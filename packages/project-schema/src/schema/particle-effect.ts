import { z } from 'zod'
import { hexColor } from './common.js'
import { CurveSchema, GradientSchema } from './curve.js'

/**
 * Particle Effect domain — reusable particle system configuration.
 * Modules are data blocks; simulation/rendering is runtime-only.
 * GPU buffers never serialize.
 */

export const PARTICLE_EFFECT_FORMAT = 'koota-3d-particle-effect'

/* ---- Emission Module ---- */

export interface EmissionModule {
  enabled: boolean
  /** Particles per second (0 = burst only). */
  rate: number
  /** Burst count at start (0 = no burst). */
  burst: number
  burstDelay: number
  /** Max concurrent particles. */
  maxParticles: number
}

export const EmissionModuleSchema = z.object({
  enabled: z.boolean().default(true),
  rate: z.number().min(0).default(10),
  burst: z.number().int().min(0).default(0),
  burstDelay: z.number().min(0).default(0),
  maxParticles: z.number().int().min(1).max(1_000_000).default(1000),
})

/* ---- Shape Module ---- */

export type EmitterShape = 'point' | 'box' | 'sphere' | 'cone'

export interface ShapeModule {
  enabled: boolean
  shape: EmitterShape
  /** Sphere radius / cone base radius. */
  radius: number
  /** Box half-extents [x,y,z]. */
  boxSize: [number, number, number]
  /** Cone height. */
  coneHeight: number
  /** Cone opening angle in radians. */
  coneAngle: number
  /** Emit from surface (true) or volume (false). */
  surfaceOnly: boolean
}

export const ShapeModuleSchema = z.object({
  enabled: z.boolean().default(true),
  shape: z.enum(['point', 'box', 'sphere', 'cone']).default('sphere'),
  radius: z.number().min(0).default(0.5),
  boxSize: z.tuple([z.number(), z.number(), z.number()]).default([1, 1, 1]),
  coneHeight: z.number().min(0).default(2),
  coneAngle: z.number().min(0).max(Math.PI / 2).default(0.5),
  surfaceOnly: z.boolean().default(false),
})

/* ---- Velocity Module ---- */

export interface VelocityModule {
  enabled: boolean
  /** Initial speed range. */
  speedMin: number
  speedMax: number
  /** Direction bias [x,y,z] (normalized internally, [0,0,0] = radial). */
  direction: [number, number, number]
  /** Directional spread (0 = focused, 1 = hemisphere). */
  spread: number
}

export const VelocityModuleSchema = z.object({
  enabled: z.boolean().default(true),
  speedMin: z.number().min(0).default(1),
  speedMax: z.number().min(0).default(2),
  direction: z.tuple([z.number(), z.number(), z.number()]).default([0, 1, 0]),
  spread: z.number().min(0).max(1).default(0.3),
})

/* ---- Lifetime Module ---- */

export interface LifetimeModule {
  enabled: boolean
  min: number
  max: number
}

export const LifetimeModuleSchema = z.object({
  enabled: z.boolean().default(true),
  min: z.number().positive().default(0.5),
  max: z.number().positive().default(2),
})

/* ---- Forces Module (gravity/acceleration) ---- */

export interface ForcesModule {
  enabled: boolean
  /** Constant acceleration [x,y,z] (gravity = [0,-9.81,0]). */
  gravity: [number, number, number]
  /** Drag coefficient (0 = none). */
  drag: number
}

export const ForcesModuleSchema = z.object({
  enabled: z.boolean().default(true),
  gravity: z.tuple([z.number(), z.number(), z.number()]).default([0, -9.81, 0]),
  drag: z.number().min(0).default(0),
})

/* ---- Size Module ---- */

export interface SizeModule {
  enabled: boolean
  /** Base size. */
  size: number
  /** Size over lifetime curve (time 0–1, multiplier). */
  sizeOverLifetime: { keys: { time: number; value: number }[] }
}

export const SizeModuleSchema = z.object({
  enabled: z.boolean().default(true),
  size: z.number().positive().default(0.2),
  sizeOverLifetime: CurveSchema,
})

/* ---- Color Module ---- */

export interface ColorModule {
  enabled: boolean
  /** Color + alpha over lifetime gradient. */
  colorOverLifetime: {
    colorStops: { time: number; color: string }[]
    alphaStops: { time: number; alpha: number }[]
  }
}

export const ColorModuleSchema = z.object({
  enabled: z.boolean().default(true),
  colorOverLifetime: GradientSchema,
})

/* ---- Rotation Module ---- */

export interface RotationModule {
  enabled: boolean
  /** Initial rotation range (degrees). */
  initialMin: number
  initialMax: number
  /** Rotation speed range (degrees/second). */
  speedMin: number
  speedMax: number
}

export const RotationModuleSchema = z.object({
  enabled: z.boolean().default(true),
  initialMin: z.number().default(0),
  initialMax: z.number().default(360),
  speedMin: z.number().default(-90),
  speedMax: z.number().default(90),
})

/* ---- Renderer Module ---- */

export type ParticleBlendMode = 'alpha' | 'additive' | 'multiply'
export type ParticleRenderMode = 'billboard' | 'mesh'

export interface RendererModule {
  enabled: boolean
  mode: ParticleRenderMode
  /** Texture asset ID (null = solid circle). */
  textureAssetId: string | null
  blendMode: ParticleBlendMode
  /** Sorting (false = faster, true = correct alpha). */
  depthWrite: boolean
}

export const RendererModuleSchema = z.object({
  enabled: z.boolean().default(true),
  mode: z.enum(['billboard', 'mesh']).default('billboard'),
  textureAssetId: z.string().nullable().default(null),
  blendMode: z.enum(['alpha', 'additive', 'multiply']).default('additive'),
  depthWrite: z.boolean().default(false),
})

/* ---- Particle Effect ---- */

export interface ParticleEffectData {
  format: typeof PARTICLE_EFFECT_FORMAT
  schemaVersion: number
  id: string
  name: string
  duration: number
  loop: boolean
  emission?: EmissionModule
  shape?: ShapeModule
  velocity?: VelocityModule
  lifetime?: LifetimeModule
  forces?: ForcesModule
  size?: SizeModule
  color?: ColorModule
  rotation?: RotationModule
  renderer?: RendererModule
}

export const ParticleEffectDataSchema = z.object({
  format: z.literal(PARTICLE_EFFECT_FORMAT),
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string(),
  duration: z.number().positive().default(5),
  loop: z.boolean().default(true),
  emission: EmissionModuleSchema.optional(),
  shape: ShapeModuleSchema.optional(),
  velocity: VelocityModuleSchema.optional(),
  lifetime: LifetimeModuleSchema.optional(),
  forces: ForcesModuleSchema.optional(),
  size: SizeModuleSchema.optional(),
  color: ColorModuleSchema.optional(),
  rotation: RotationModuleSchema.optional(),
  renderer: RendererModuleSchema.optional(),
})

/** Creates a fire/spark-like default effect. */
export function createFireEffect(id: string): ParticleEffectData {
  return {
    format: PARTICLE_EFFECT_FORMAT,
    schemaVersion: 1,
    id,
    name: 'Fire',
    duration: 5,
    loop: true,
    emission: { enabled: true, rate: 50, burst: 0, burstDelay: 0, maxParticles: 2000 },
    shape: { enabled: true, shape: 'cone', radius: 0.3, boxSize: [1, 1, 1], coneHeight: 0.5, coneAngle: 0.4, surfaceOnly: false },
    velocity: { enabled: true, speedMin: 1.5, speedMax: 3, direction: [0, 1, 0], spread: 0.2 },
    lifetime: { enabled: true, min: 0.5, max: 1.5 },
    forces: { enabled: true, gravity: [0, 0.5, 0], drag: 0.5 },
    size: { enabled: true, size: 0.15, sizeOverLifetime: { keys: [{ time: 0, value: 0.3 }, { time: 0.2, value: 1 }, { time: 1, value: 0 }] } },
    color: {
      enabled: true,
      colorOverLifetime: {
        colorStops: [
          { time: 0, color: '#fff3c4' },
          { time: 0.3, color: '#ff9e2c' },
          { time: 0.7, color: '#e5341a' },
          { time: 1, color: '#331105' },
        ],
        alphaStops: [
          { time: 0, alpha: 0.9 },
          { time: 0.6, alpha: 0.6 },
          { time: 1, alpha: 0 },
        ],
      },
    },
    rotation: { enabled: true, initialMin: 0, initialMax: 360, speedMin: -60, speedMax: 60 },
    renderer: { enabled: true, mode: 'billboard', textureAssetId: null, blendMode: 'additive', depthWrite: false },
  }
}
