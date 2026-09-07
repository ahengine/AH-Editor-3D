import * as THREE from 'three'
import type { ParticleEffectData } from '@ahengine/project-schema'
import { sampleCurve, sampleGradientColor, sampleGradientAlpha } from '@ahengine/project-schema'

/**
 * Particle runtime — batched CPU simulation with GPU-ready abstraction.
 *
 * V1: TypedArray simulation + THREE.Points with BufferGeometry (batched,
 * no React component per particle). GPU compute (TSL storage buffers) is
 * architected for but deferred — the ParticleBuffer interface allows a
 * compute-shader backend to replace the CPU step without changing the
 * authoring data or the rendering path.
 */

interface ParticleBuffer {
  /** Position XYZ per particle (stride 3). */
  positions: Float32Array
  /** Color RGBA per particle (stride 4). */
  colors: Float32Array
  /** Size per particle (stride 1). */
  sizes: Float32Array
  /** Current life (age in seconds, stride 1). */
  ages: Float32Array
  /** Lifetime at spawn (stride 1). */
  lifetimes: Float32Array
  /** Velocity XYZ (stride 3). */
  velocities: Float32Array
  /** Rotation angle radians (stride 1). */
  rotations: Float32Array
  /** Rotation speed (stride 1). */
  rotationSpeeds: Float32Array
  /** Alive flag (stride 1). */
  alive: Uint8Array
}

export class ParticleSystemInstance {
  private buffer: ParticleBuffer
  private capacity: number
  private aliveCount = 0
  private emissionAccumulator = 0
  private elapsed = 0
  private effect: ParticleEffectData
  private geometry: THREE.BufferGeometry
  private material: THREE.PointsMaterial

  constructor(effect: ParticleEffectData) {
    this.effect = effect
    this.capacity = effect.emission?.maxParticles ?? 1000
    const cap = this.capacity
    this.buffer = {
      positions: new Float32Array(cap * 3),
      colors: new Float32Array(cap * 4),
      sizes: new Float32Array(cap),
      ages: new Float32Array(cap),
      lifetimes: new Float32Array(cap),
      velocities: new Float32Array(cap * 3),
      rotations: new Float32Array(cap),
      rotationSpeeds: new Float32Array(cap),
      alive: new Uint8Array(cap),
    }

    this.geometry = new THREE.BufferGeometry()
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.buffer.positions, 3))
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.buffer.colors, 4))
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.buffer.sizes, 1))
    this.geometry.setDrawRange(0, 0)

    this.material = new THREE.PointsMaterial({
      size: effect.size?.size ?? 0.2,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      depthWrite: effect.renderer?.depthWrite ?? false,
      blending: effect.renderer?.blendMode === 'additive' ? THREE.AdditiveBlending
        : effect.renderer?.blendMode === 'multiply' ? THREE.MultiplyBlending
        : THREE.NormalBlending,
      sizeAttenuation: true,
    })
  }

  get points(): THREE.Points {
    const points = new THREE.Points(this.geometry, this.material)
    points.frustumCulled = false
    return points
  }

  get aliveParticles(): number { return this.aliveCount }

  reset(): void {
    this.buffer.alive.fill(0)
    this.aliveCount = 0
    this.emissionAccumulator = 0
    this.elapsed = 0
    this.geometry.setDrawRange(0, 0)
  }

  restart(): void { this.reset() }

  update(dt: number): void {
    this.elapsed += dt
    const e = this.effect

    // Emission
    if (e.emission?.enabled) {
      // Burst at start
      if (e.emission.burst > 0 && this.elapsed < dt * 2) {
        for (let i = 0; i < e.emission.burst; i++) this.spawn()
      }
      // Rate
      const rate = e.emission.rate
      if (rate > 0) {
        this.emissionAccumulator += rate * dt
        while (this.emissionAccumulator >= 1) {
          this.spawn()
          this.emissionAccumulator -= 1
        }
      }
    }

    // Simulation
    const b = this.buffer
    const gravity = e.forces?.enabled ? e.forces.gravity : [0, 0, 0]
    const drag = e.forces?.enabled ? e.forces.drag : 0
    const lifeEnabled = e.lifetime?.enabled
    const sizeEnabled = e.size?.enabled
    const colorEnabled = e.color?.enabled
    const rotEnabled = e.rotation?.enabled

    for (let i = 0; i < this.capacity; i++) {
      if (!b.alive[i]) continue
      const i3 = i * 3, i4 = i * 4

      // Age
      b.ages[i] += dt
      if (lifeEnabled && b.ages[i] >= b.lifetimes[i]) {
        b.alive[i] = 0
        continue
      }

      // Physics
      b.velocities[i3] += gravity[0] * dt
      b.velocities[i3 + 1] += gravity[1] * dt
      b.velocities[i3 + 2] += gravity[2] * dt
      if (drag > 0) {
        const dampening = Math.max(0, 1 - drag * dt)
        b.velocities[i3] *= dampening
        b.velocities[i3 + 1] *= dampening
        b.velocities[i3 + 2] *= dampening
      }
      b.positions[i3] += b.velocities[i3] * dt
      b.positions[i3 + 1] += b.velocities[i3 + 1] * dt
      b.positions[i3 + 2] += b.velocities[i3 + 2] * dt

      // Rotation
      if (rotEnabled) {
        b.rotations[i] += b.rotationSpeeds[i] * dt
      }

      // Size over lifetime
      if (sizeEnabled && e.size?.sizeOverLifetime) {
        const t = lifeEnabled ? b.ages[i] / b.lifetimes[i] : 0
        b.sizes[i] = e.size.size * sampleCurve(e.size.sizeOverLifetime, t)
      }

      // Color over lifetime
      if (colorEnabled && e.color?.colorOverLifetime) {
        const grad = e.color.colorOverLifetime
        const t = lifeEnabled ? b.ages[i] / b.lifetimes[i] : 0
        const [r, g, bl] = sampleGradientColor(grad, t)
        const a = sampleGradientAlpha(grad, t)
        b.colors[i4] = r
        b.colors[i4 + 1] = g
        b.colors[i4 + 2] = bl
        b.colors[i4 + 3] = a
      }
    }

    // Compact alive particles to front of buffer for rendering
    this.compact()
    this.geometry.attributes.position.needsUpdate = true
    this.geometry.attributes.color.needsUpdate = true
    this.geometry.attributes.size.needsUpdate = true
    this.geometry.setDrawRange(0, this.aliveCount)
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
  }

  private spawn(): void {
    const b = this.buffer
    // Find free slot
    for (let i = 0; i < this.capacity; i++) {
      if (b.alive[i]) continue
      const i3 = i * 3, i4 = i * 4
      b.alive[i] = 1
      b.ages[i] = 0

      // Lifetime
      const e = this.effect
      b.lifetimes[i] = e.lifetime?.enabled
        ? e.lifetime.min + Math.random() * (e.lifetime.max - e.lifetime.min)
        : Infinity

      // Position from shape
      const shape = e.shape
      if (shape?.enabled) {
        const [px, py, pz] = this.sampleShape(shape)
        b.positions[i3] = px
        b.positions[i3 + 1] = py
        b.positions[i3 + 2] = pz
      } else {
        b.positions[i3] = b.positions[i3 + 1] = b.positions[i3 + 2] = 0
      }

      // Velocity
      const vel = e.velocity
      if (vel?.enabled) {
        const speed = vel.speedMin + Math.random() * (vel.speedMax - vel.speedMin)
        const [dx, dy, dz] = this.sampleDirection(vel.direction, vel.spread)
        b.velocities[i3] = dx * speed
        b.velocities[i3 + 1] = dy * speed
        b.velocities[i3 + 2] = dz * speed
      } else {
        b.velocities[i3] = b.velocities[i3 + 1] = b.velocities[i3 + 2] = 0
      }

      // Rotation
      const rot = e.rotation
      if (rot?.enabled) {
        const degToRad = Math.PI / 180
        b.rotations[i] = (rot.initialMin + Math.random() * (rot.initialMax - rot.initialMin)) * degToRad
        b.rotationSpeeds[i] = (rot.speedMin + Math.random() * (rot.speedMax - rot.speedMin)) * degToRad
      }

      // Initial color/size
      if (e.color?.enabled && e.color.colorOverLifetime) {
        const [r, g, bl] = sampleGradientColor(e.color.colorOverLifetime, 0)
        const a = sampleGradientAlpha(e.color.colorOverLifetime, 0)
        b.colors[i4] = r; b.colors[i4 + 1] = g; b.colors[i4 + 2] = bl; b.colors[i4 + 3] = a
      } else {
        b.colors[i4] = b.colors[i4 + 1] = b.colors[i4 + 2] = 1; b.colors[i4 + 3] = 1
      }

      if (e.size?.enabled && e.size.sizeOverLifetime) {
        b.sizes[i] = e.size.size * sampleCurve(e.size.sizeOverLifetime, 0)
      } else {
        b.sizes[i] = e.size?.size ?? 0.2
      }
      break
    }
  }

  private sampleShape(shape: NonNullable<ParticleEffectData['shape']>): [number, number, number] {
    const { shape: type, radius, boxSize, coneHeight, coneAngle, surfaceOnly } = shape
    switch (type) {
      case 'point': return [0, 0, 0]
      case 'box': {
        const x = (Math.random() * 2 - 1) * boxSize[0] / 2
        const y = (Math.random() * 2 - 1) * boxSize[1] / 2
        const z = (Math.random() * 2 - 1) * boxSize[2] / 2
        return [x, y, z]
      }
      case 'sphere': {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = surfaceOnly ? radius : radius * Math.cbrt(Math.random())
        return [
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.sin(phi) * Math.sin(theta),
          r * Math.cos(phi),
        ]
      }
      case 'cone': {
        // Cone opening upward from origin
        const angle = Math.random() * coneAngle
        const dist = surfaceOnly ? coneHeight : Math.random() * coneHeight
        const theta = Math.random() * Math.PI * 2
        const r = Math.tan(angle) * dist
        return [r * Math.cos(theta), dist, r * Math.sin(theta)]
      }
      default: return [0, 0, 0]
    }
  }

  private sampleDirection(dir: [number, number, number], spread: number): [number, number, number] {
    // If direction is zero, use radial from origin
    const len = Math.hypot(dir[0], dir[1], dir[2])
    if (len < 0.001) return [0, 1, 0]
    const base = [dir[0] / len, dir[1] / len, dir[2] / len]
    // Apply spread: random perturbation
    const spreadAmount = spread * 2 - 1 // -1 to 1
    const randomOffset = [Math.random() * spreadAmount, Math.random() * spreadAmount, Math.random() * spreadAmount]
    const result = [
      base[0] + randomOffset[0] * spread * 0.5,
      base[1] + randomOffset[1] * spread * 0.5,
      base[2] + randomOffset[2] * spread * 0.5,
    ]
    const resultLen = Math.hypot(result[0], result[1], result[2]) || 1
    return [result[0] / resultLen, result[1] / resultLen, result[2] / resultLen]
  }

  /** Moves alive particles to the front of the buffer for contiguous rendering. */
  private compact(): void {
    const b = this.buffer
    let write = 0
    for (let read = 0; read < this.capacity; read++) {
      if (!b.alive[read]) continue
      if (read !== write) {
        // Copy read → write
        b.positions[write * 3] = b.positions[read * 3]
        b.positions[write * 3 + 1] = b.positions[read * 3 + 1]
        b.positions[write * 3 + 2] = b.positions[read * 3 + 2]
        b.colors[write * 4] = b.colors[read * 4]
        b.colors[write * 4 + 1] = b.colors[read * 4 + 1]
        b.colors[write * 4 + 2] = b.colors[read * 4 + 2]
        b.colors[write * 4 + 3] = b.colors[read * 4 + 3]
        b.sizes[write] = b.sizes[read]
        b.velocities[write * 3] = b.velocities[read * 3]
        b.velocities[write * 3 + 1] = b.velocities[read * 3 + 1]
        b.velocities[write * 3 + 2] = b.velocities[read * 3 + 2]
        b.rotations[write] = b.rotations[read]
        b.rotationSpeeds[write] = b.rotationSpeeds[read]
        b.ages[write] = b.ages[read]
        b.lifetimes[write] = b.lifetimes[read]
        b.alive[write] = 1
        b.alive[read] = 0
      }
      write++
    }
    this.aliveCount = write
  }
}
