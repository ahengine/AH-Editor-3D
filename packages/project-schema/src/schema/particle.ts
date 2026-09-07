import { z } from 'zod'
import { hexColor } from './common.js'

/**
 * Particle domain — data-only effect definitions (V1 authoring contract).
 * Runtime emission/simulation is out of the schema; only authored parameters.
 */

export const PARTICLE_FORMAT = 'koota-3d-particle'

export type ParticleShape = 'point' | 'sphere' | 'cone'

export interface ParticleEffectAsset {
  format: typeof PARTICLE_FORMAT
  schemaVersion: number
  id: string
  name: string
  duration: number
  loop: boolean
  capacity: number
  emissionRate: number
  shape: ParticleShape
  shapeRadius: number
  startColor: string
  endColor: string
  startSize: number
  endSize: number
  startSpeed: number
  gravity: number
}

export const ParticleEffectAssetSchema = z.object({
  format: z.literal(PARTICLE_FORMAT),
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string(),
  duration: z.number().min(0),
  loop: z.boolean(),
  capacity: z.number().int().min(1).max(1_000_000),
  emissionRate: z.number().min(0),
  shape: z.enum(['point', 'sphere', 'cone']),
  shapeRadius: z.number().min(0),
  startColor: hexColor,
  endColor: hexColor,
  startSize: z.number().min(0),
  endSize: z.number().min(0),
  startSpeed: z.number(),
  gravity: z.number(),
})
