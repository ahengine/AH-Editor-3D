import { z } from 'zod'
import { hexColor } from './common.js'

/** Scene domain — entities, components, settings. */

export const SCENE_FORMAT = 'koota-3d-scene'

/** Component id → its serialized data. Only stable registry ids are used as keys. */
export type SerializedComponents = Record<string, Record<string, unknown>>

export interface SerializedEntity {
  /** Persistent UUID. Never a Koota internal id. */
  id: string
  name: string
  enabled: boolean
  /** Parent persistent UUID, or null for roots. */
  parentId: string | null
  components: SerializedComponents
}

const componentData = z.record(z.string(), z.unknown())

export const SerializedEntitySchema = z.object({
  id: z.string().min(1, 'Entity id (persistent uuid) is required'),
  name: z.string(),
  enabled: z.boolean(),
  parentId: z.string().nullable(),
  components: z.record(z.string(), componentData),
})

export type FogSettings = {
  enabled: boolean
  type: 'linear' | 'exponential'
  color: string
  near: number
  far: number
  density: number
}

export type ToneMappingType = 'none' | 'aces' | 'linear' | 'reinhard' | 'cineon'

export interface SceneSettings {
  /** Background color (hex string) or 'environment' to use HDRI as sky. */
  background: string
  /** HDRI environment asset id, or null. */
  environmentAssetId: string | null
  environmentIntensity: number
  /** Environment map rotation in radians (Y-axis). */
  environmentRotation: number
  /** True = show HDRI as visible sky background; false = environment lighting only. */
  environmentBackground: boolean
  /** Ambient light contribution (0 = off). Uses hemisphere light in renderer. */
  ambientIntensity: number
  /** Ambient light color. */
  ambientColor: string
  fog: FogSettings
  toneMapping: ToneMappingType
  toneMappingExposure: number
  shadowEnabled: boolean
  /** Persistent UUID of the default camera entity. */
  defaultCameraId: string | null
}

export const FogSettingsSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['linear', 'exponential']),
  color: hexColor,
  near: z.number(),
  far: z.number(),
  density: z.number(),
})

export const SceneSettingsSchema = z.object({
  background: hexColor,
  environmentAssetId: z.string().nullable(),
  environmentIntensity: z.number().default(1),
  // v1 backfill: fields added later default for existing data
  environmentRotation: z.number().default(0),
  environmentBackground: z.boolean().default(true),
  ambientIntensity: z.number().default(0),
  ambientColor: hexColor.default('#c8d4e0'),
  fog: FogSettingsSchema,
  toneMapping: z.enum(['none', 'aces', 'linear', 'reinhard', 'cineon']),
  toneMappingExposure: z.number().default(1),
  shadowEnabled: z.boolean().default(true),
  defaultCameraId: z.string().nullable(),
})

export interface SceneData {
  format: typeof SCENE_FORMAT
  schemaVersion: number
  id: string
  name: string
  settings: SceneSettings
  entities: SerializedEntity[]
}

export const SceneDataSchema = z.object({
  format: z.literal(SCENE_FORMAT),
  schemaVersion: z.number().int().min(1),
  id: z.string(),
  name: z.string(),
  settings: SceneSettingsSchema,
  entities: z.array(SerializedEntitySchema),
})
