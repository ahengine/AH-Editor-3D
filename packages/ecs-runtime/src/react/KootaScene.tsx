import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import type { Entity, World } from 'koota'
import type { SceneSettings } from '@ahengine/project-schema'
import { Camera as CameraTrait, EntityMeta, Light as LightTrait, MaterialReference, ModelRenderer, PrimitiveMesh, ThreeObject, Transform } from '../traits.js'
import { getParent } from '../relations.js'
import { fallbackMaterial, type MaterialService } from '../materials.js'
import type { AnimatorRuntime } from '../animation.js'
import { sharedAssetCache } from '../asset-cache.js'
import { modelAnimationRegistry } from '../loader.js'
import { entityUuid } from '../registry.js'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'

/**
 * KootaScene — reusable R3F render bridge.
 *
 * Queries the Koota world and maintains imperative THREE objects. React state
 * is never touched per frame: transforms stream trait → Object3D (or back
 * during gizmo drags) inside useFrame. Structural changes are detected by
 * cheap per-frame diffing of query results.
 */

/** Entities whose Object3D is currently driven externally (transform gizmo). */
export const gizmoDragTargets = new Set<string>()

export interface KootaSceneRuntime {
  materials: MaterialService
  animator: AnimatorRuntime
}

export interface KootaSceneProps {
  world: World
  runtime: KootaSceneRuntime
  /** Drive the R3F camera from the scene's camera entity instead of the editor camera. */
  useGameCamera?: boolean
  settings?: SceneSettings
  environmentLookup?: (assetId: string) => { uri: string } | undefined
  resolveAssetUri?: (uri: string) => Promise<string>
}

interface EntityVisual {
  uuid: string
  object: THREE.Object3D
  meshKey?: string
  modelKey?: string
  lightKey?: string
}

interface SyncContext {
  world: World
  runtime: KootaSceneRuntime
  useGameCamera: boolean
  environmentLookup?: (assetId: string) => { uri: string } | undefined
  resolveAssetUri?: (uri: string) => Promise<string>
}

export function KootaScene({
  world,
  runtime,
  useGameCamera = false,
  settings,
  environmentLookup,
  resolveAssetUri,
}: KootaSceneProps) {
  const rootRef = useRef<THREE.Group>(null)
  const visuals = useRef(new Map<string, EntityVisual>())

  const frameCtx = useMemo<SyncContext>(
    () => ({ world, runtime, useGameCamera, environmentLookup, resolveAssetUri }),
    [world, runtime, useGameCamera, environmentLookup, resolveAssetUri]
  )

  useEffect(() => {
    return () => {
      // Teardown: drop every managed object with the component — INCLUDING its
      // trait (identity-guarded so a stale cleanup can never unregister a newer
      // registration). A surviving trait would orphan: the next sync creates a
      // fresh object, and koota's add() would leave the trait pointing at the
      // removed one, breaking gizmo attach and picking ownership.
      for (const visual of visuals.current.values()) {
        const entity = findEntityByUuidLocal(frameCtx.world, visual.uuid)
        if (entity?.isAlive() && entity.get(ThreeObject)?.object === visual.object) {
          entity.remove(ThreeObject)
        }
        disposeVisual(visual, frameCtx.runtime)
      }
      visuals.current.clear()
    }
  }, [frameCtx])

  useFrame((state, delta) => {
    const root = rootRef.current
    if (!root) return
    syncStructure(frameCtx, root, visuals.current)
    syncHierarchy(frameCtx, root, visuals.current)
    syncTransforms(frameCtx, visuals.current)
    syncVisuals(frameCtx, visuals.current)
    runtime.animator.update(world, delta)
    if (useGameCamera) syncGameCamera(frameCtx, state, visuals.current)
  })

  return (
    <group ref={rootRef} name="koota-scene-root">
      <SceneEnvironment settings={settings} environmentLookup={environmentLookup} resolveAssetUri={resolveAssetUri} />
    </group>
  )
}

/* ------------------------------------------------------------------ */
/* Structural sync                                                     */
/* ------------------------------------------------------------------ */

function syncStructure(
  ctx: SyncContext,
  root: THREE.Group,
  visuals: Map<string, EntityVisual>
) {
  const seen = new Set<string>()
  for (const entity of ctx.world.query(Transform)) {
    const uuid = entityUuid(entity)
    if (!uuid) continue
    seen.add(uuid)
    if (!visuals.has(uuid)) {
      const object = new THREE.Group()
      object.name = 'entity'
      object.userData.entityUuid = uuid
      // entity.add() IGNORES values when the trait already exists (verified
      // against koota 0.6.6) — always write through set() so the trait points
      // at the live object, never an orphaned previous generation.
      if (entity.has(ThreeObject)) entity.set(ThreeObject, { object })
      else entity.add([ThreeObject, { object }])
      root.add(object)
      visuals.set(uuid, { uuid, object })
    }
  }
  // Remove stale visuals (entity destroyed or Transform removed).
  for (const [uuid, visual] of visuals) {
    if (seen.has(uuid)) continue
    disposeVisual(visual, ctx.runtime)
    visuals.delete(uuid)
    const entity = findEntityByUuidLocal(ctx.world, uuid)
    if (entity?.isAlive()) entity.remove(ThreeObject)
  }
}

const uuidIndex = new WeakMap<World, Map<string, Entity>>()
function findEntityByUuidLocal(world: World, uuid: string): Entity | undefined {
  let index = uuidIndex.get(world)
  if (!index) {
    index = new Map()
    uuidIndex.set(world, index)
  }
  if (index.has(uuid)) {
    const entity = index.get(uuid)!
    if (entity.isAlive() && entity.get(EntityMeta)?.uuid === uuid) return entity
    index.delete(uuid)
  }
  for (const entity of world.query(EntityMeta)) {
    const metaUuid = entity.get(EntityMeta)?.uuid
    if (metaUuid) index.set(metaUuid, entity)
    if (metaUuid === uuid) return entity
  }
  return undefined
}

function disposeVisual(visual: EntityVisual, runtime: KootaSceneRuntime): void {
  runtime.animator.disposeObject(visual.object)
  visual.object.removeFromParent()
}

/* ------------------------------------------------------------------ */
/* Hierarchy sync — keep THREE parenting aligned with ChildOf          */
/* ------------------------------------------------------------------ */

function syncHierarchy(
  ctx: SyncContext,
  root: THREE.Group,
  visuals: Map<string, EntityVisual>
) {
  for (const visual of visuals.values()) {
    const entity = findEntityByUuidLocal(ctx.world, visual.uuid)
    if (!entity) continue
    const parent = getParent(entity)
    const expectedParent = parent ? visuals.get(parent.get(EntityMeta)?.uuid ?? '')?.object ?? root : root
    if (visual.object.parent !== expectedParent) expectedParent.add(visual.object)
  }
}

/* ------------------------------------------------------------------ */
/* Transform sync — trait → object, object → trait during gizmo drags  */
/* ------------------------------------------------------------------ */

const _euler = new THREE.Euler()
const _quat = new THREE.Quaternion()

function syncTransforms(
  ctx: SyncContext,
  visuals: Map<string, EntityVisual>
) {
  for (const visual of visuals.values()) {
    const entity = findEntityByUuidLocal(ctx.world, visual.uuid)
    if (!entity) continue
    const transform = entity.get(Transform)
    if (!transform) continue
    const object = visual.object

    const meta = entity.get(EntityMeta)
    object.visible = meta?.enabled !== false

    if (gizmoDragTargets.has(visual.uuid)) {
      // Gizmo is the authority — stream the object back into the trait.
      entity.set(Transform, {
        position: { x: object.position.x, y: object.position.y, z: object.position.z },
        rotation: {
          x: THREE.MathUtils.radToDeg(object.rotation.x),
          y: THREE.MathUtils.radToDeg(object.rotation.y),
          z: THREE.MathUtils.radToDeg(object.rotation.z),
        },
        scale: { x: object.scale.x, y: object.scale.y, z: object.scale.z },
      })
      continue
    }

    object.position.set(transform.position.x, transform.position.y, transform.position.z)
    _euler.set(
      THREE.MathUtils.degToRad(transform.rotation.x),
      THREE.MathUtils.degToRad(transform.rotation.y),
      THREE.MathUtils.degToRad(transform.rotation.z)
    )
    object.quaternion.copy(_quat.setFromEuler(_euler))
    object.scale.set(transform.scale.x ?? 1, transform.scale.y ?? 1, transform.scale.z ?? 1)
  }
}

/* ------------------------------------------------------------------ */
/* Visual components: mesh / model / light / camera                    */
/* ------------------------------------------------------------------ */

function syncVisuals(
  ctx: SyncContext,
  visuals: Map<string, EntityVisual>
) {
  for (const visual of visuals.values()) {
    const entity = findEntityByUuidLocal(ctx.world, visual.uuid)
    if (!entity) continue
    if (entity.has(PrimitiveMesh)) syncPrimitive(entity, visual, ctx.runtime)
    else removeChild(visual, 'mesh')
    if (entity.has(ModelRenderer)) syncModel(entity, visual, ctx)
    else removeChild(visual, 'model')
    if (entity.has(LightTrait)) syncLight(entity, visual)
    else removeChild(visual, 'light')
    if (entity.has(CameraTrait)) syncCamera(entity, visual)
    else removeChild(visual, 'camera')
  }
}

function removeChild(visual: EntityVisual, key: string) {
  // Primitive geometries are shared through the module-level geometryCache
  // and materials through MaterialService — neither is owned by the visual,
  // so removal must never dispose them.
  visual.object.getObjectByName(key)?.removeFromParent()
}

const geometryCache = new Map<string, THREE.BufferGeometry>()

function primitiveGeometry(shape: string, size: number, segments: number): THREE.BufferGeometry {
  const key = `${shape}|${size}|${segments}`
  let geometry = geometryCache.get(key)
  if (!geometry) {
    switch (shape) {
      case 'sphere':
        geometry = new THREE.SphereGeometry(size / 2, Math.max(8, segments), Math.max(6, Math.floor(segments / 2)))
        break
      case 'plane':
        geometry = new THREE.PlaneGeometry(size, size)
        break
      case 'cylinder':
        geometry = new THREE.CylinderGeometry(size / 2, size / 2, size, Math.max(8, segments))
        break
      case 'cone':
        geometry = new THREE.ConeGeometry(size / 2, size, Math.max(8, segments))
        break
      case 'torus':
        geometry = new THREE.TorusGeometry(size / 2, size / 6, Math.max(8, Math.floor(segments / 2)), segments)
        break
      default:
        geometry = new THREE.BoxGeometry(size, size, size)
    }
    geometryCache.set(key, geometry)
  }
  return geometry
}

function entityMaterial(entity: Entity, runtime: KootaSceneRuntime): THREE.Material {
  const reference = entity.get(MaterialReference)
  const materialId = reference?.slots?.[0]?.materialId ?? null
  return runtime.materials.get(materialId) ?? fallbackMaterial
}

function syncPrimitive(entity: Entity, visual: EntityVisual, runtime: KootaSceneRuntime) {
  const data = entity.get(PrimitiveMesh)!
  const key = `mesh:${data.shape}|${data.size}|${data.segments}`
  if (visual.meshKey === key) {
    const mesh = visual.object.getObjectByName('mesh') as THREE.Mesh
    if (mesh) {
      mesh.material = entityMaterial(entity, runtime)
      mesh.visible = data.visible !== false
    }
    return
  }
  removeChild(visual, 'mesh')
  const mesh = new THREE.Mesh(primitiveGeometry(data.shape, data.size, data.segments), entityMaterial(entity, runtime))
  mesh.name = 'mesh'
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.visible = data.visible !== false
  visual.object.add(mesh)
  visual.meshKey = key
}

function syncModel(
  entity: Entity,
  visual: EntityVisual,
  ctx: SyncContext
) {
  const data = entity.get(ModelRenderer)!
  const key = `model:${data.assetId}`
  if (visual.modelKey === key) {
    const holder = visual.object.getObjectByName('model')
    if (holder) holder.visible = data.visible
    return
  }
  removeChild(visual, 'model')
  visual.modelKey = key
  if (!data.assetId) return
  const record = ctx.environmentLookup?.(data.assetId)
  if (!record || !ctx.resolveAssetUri) return
  const materialService = ctx.runtime.materials
  ctx
    .resolveAssetUri(record.uri)
    .then((url) => sharedAssetCache.loadModel(url))
    .then((loaded) => {
      if (visual.modelKey !== key) return // asset changed mid-flight
      modelAnimationRegistry.set(data.assetId, loaded.animations)
      const instance = skeletonClone(loaded.scene)
      instance.traverse((child) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        mesh.castShadow = data.castShadow
        mesh.receiveShadow = data.receiveShadow
        const reference = entity.get(MaterialReference)
        const override = materialService.get(reference?.slots?.[0]?.materialId ?? null)
        if (override) mesh.material = override
      })
      const holder = new THREE.Group()
      holder.name = 'model'
      holder.visible = data.visible
      holder.add(instance)
      visual.object.add(holder)
    })
    .catch(() => undefined)
}

const tmpColor = new THREE.Color()

function syncLight(entity: Entity, visual: EntityVisual) {
  const data = entity.get(LightTrait)!
  const key = `light:${data.type}`
  let light = visual.object.getObjectByName('light') as THREE.Light & {
    distance?: number
    decay?: number
    angle?: number
    penumbra?: number
    shadow?: THREE.LightShadow
    groundColor?: THREE.Color
  }
  if (visual.lightKey !== key) {
    removeChild(visual, 'light')
    light = createLight(data.type) as typeof light
    light.name = 'light'
    visual.object.add(light)
    visual.lightKey = key
  }
  if (!light) return
  light.color.copy(tmpColor.set(data.color))
  light.intensity = data.intensity
  const anyLight = light as unknown as Record<string, unknown>
  if ('distance' in anyLight) anyLight.distance = data.distance
  if ('decay' in anyLight) anyLight.decay = data.decay
  if ('angle' in anyLight) anyLight.angle = data.angle
  if ('penumbra' in anyLight) anyLight.penumbra = data.penumbra
  if (light.castShadow !== data.castShadow) light.castShadow = data.castShadow
  if (light.shadow) {
    light.shadow.bias = data.shadowBias
    const mapSize = nearestPow2(data.shadowMapSize)
    const size = light.shadow.mapSize as THREE.Vector2
    if (size.x !== mapSize) {
      size.set(mapSize, mapSize)
      light.shadow.map?.dispose()
      light.shadow.map = null
    }
  }
}

function createLight(type: string): THREE.Light {
  switch (type) {
    case 'point':
      return new THREE.PointLight()
    case 'spot': {
      const spot = new THREE.SpotLight()
      // Aim along local -Z so entity rotation steers the cone.
      spot.target.position.set(0, 0, -1)
      spot.add(spot.target)
      return spot
    }
    case 'ambient':
      return new THREE.AmbientLight()
    case 'hemisphere': {
      const hemi = new THREE.HemisphereLight()
      hemi.groundColor.set('#3a3f46')
      return hemi
    }
    default: {
      const sun = new THREE.DirectionalLight()
      sun.target.position.set(0, 0, -1)
      sun.add(sun.target)
      return sun
    }
  }
}

function nearestPow2(value: number): number {
  const pow = Math.max(64, 2 ** Math.round(Math.log2(value)))
  return Math.min(4096, pow)
}

const runtimeCameras = new WeakMap<THREE.Object3D, THREE.PerspectiveCamera>()

function syncCamera(entity: Entity, visual: EntityVisual) {
  const data = entity.get(CameraTrait)!
  let camera = runtimeCameras.get(visual.object)
  if (!camera) {
    camera = new THREE.PerspectiveCamera()
    camera.name = 'camera'
    visual.object.add(camera)
    runtimeCameras.set(visual.object, camera)
  }
  if (camera.fov !== data.fov) {
    camera.fov = data.fov
    camera.updateProjectionMatrix()
  }
  camera.near = data.near
  camera.far = data.far
}

function syncGameCamera(
  ctx: SyncContext,
  state: Parameters<NonNullable<Parameters<typeof useFrame>[0]>>[0],
  visuals: Map<string, EntityVisual>
) {
  void visuals
  let cameraEntity: Entity | undefined
  for (const entity of ctx.world.query(CameraTrait, ThreeObject)) {
    cameraEntity = entity
    break
  }
  if (!cameraEntity) return
  const object = cameraEntity.get(ThreeObject)?.object
  if (!object) return
  object.updateWorldMatrix(true, false)
  state.camera.position.setFromMatrixPosition(object.matrixWorld)
  state.camera.quaternion.setFromRotationMatrix(object.matrixWorld)
  const gameCamera = object.getObjectByName('camera') as THREE.PerspectiveCamera | undefined
  if (gameCamera) {
    const perspective = state.camera as THREE.PerspectiveCamera
    if (perspective.isPerspectiveCamera && perspective.fov !== gameCamera.fov) {
      perspective.fov = gameCamera.fov
      perspective.updateProjectionMatrix()
    }
  }
  state.camera.updateMatrixWorld()
}

/* ------------------------------------------------------------------ */
/* Scene environment: background / fog / tone mapping / environment    */
/* ------------------------------------------------------------------ */

function SceneEnvironment({
  settings,
  environmentLookup,
  resolveAssetUri,
}: {
  settings?: SceneSettings
  environmentLookup?: (assetId: string) => { uri: string } | undefined
  resolveAssetUri?: (uri: string) => Promise<string>
}) {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  const ambientLightRef = useRef<THREE.HemisphereLight | null>(null)

  useEffect(() => {
    if (!settings) return
    if (settings.background) scene.background = new THREE.Color(settings.background)
    else scene.background = null

    if (settings.fog.enabled) {
      const color = new THREE.Color(settings.fog.color)
      scene.fog =
        settings.fog.type === 'exponential'
          ? new THREE.FogExp2(color, settings.fog.density)
          : new THREE.Fog(color, settings.fog.near, settings.fog.far)
    } else {
      scene.fog = null
    }

    const toneMapping = {
      none: THREE.NoToneMapping,
      aces: THREE.ACESFilmicToneMapping,
      linear: THREE.LinearToneMapping,
      reinhard: THREE.ReinhardToneMapping,
      cineon: THREE.CineonToneMapping,
    }[settings.toneMapping] ?? THREE.NoToneMapping
    gl.toneMapping = toneMapping
    gl.toneMappingExposure = settings.toneMappingExposure
    gl.shadowMap.enabled = settings.shadowEnabled

    let cancelled = false
    if (settings.environmentAssetId && environmentLookup && resolveAssetUri) {
      const record = environmentLookup(settings.environmentAssetId)
      if (record) {
        resolveAssetUri(record.uri)
          .then((url) => sharedAssetCache.loadEnvironment(url))
          .then((texture) => {
            if (cancelled) return
            scene.environment = texture
            scene.environmentIntensity = settings.environmentIntensity
            if (settings.environmentRotation) {
              texture.rotation = settings.environmentRotation
            }
            // Sky background: show HDRI as visible sky or use solid color
            scene.background = settings.environmentBackground ? texture : null
          })
          .catch(() => undefined)
      }
    } else {
      scene.environment = null
      scene.background = null
    }

    // Ambient contribution — hemisphere light (sky/ground approximation), not a fake entity
    if (!ambientLightRef.current) {
      ambientLightRef.current = new THREE.HemisphereLight('#c8d4e0', '#3a3f46', 0)
      scene.add(ambientLightRef.current)
    }
    ambientLightRef.current.intensity = settings.ambientIntensity ?? 0
    if (settings.ambientColor) {
      ambientLightRef.current.color.set(settings.ambientColor)
    }
    return () => {
      cancelled = true
    }
  }, [settings, scene, gl, environmentLookup, resolveAssetUri])

  return null
}
