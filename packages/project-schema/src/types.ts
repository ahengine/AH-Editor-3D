/**
 * Pure data types for the AHEngine project format.
 *
 * These types describe AUTHORING DATA only — plain JSON, no engine objects,
 * no class instances, no runtime references. Three.js / Koota objects are
 * constructed at runtime from this data and never serialized.
 */

export const CURRENT_SCHEMA_VERSION = 1
export const PROJECT_FORMAT = 'koota-3d-project'
export const SCENE_FORMAT = 'koota-3d-scene'
export const PREFAB_FORMAT = 'koota-3d-prefab'
export const MATERIAL_FORMAT = 'koota-3d-material'

/* ------------------------------------------------------------------ */
/* Shared primitives                                                   */
/* ------------------------------------------------------------------ */

/** [x, y, z] — deterministic, engine independent */
export type Vec3Data = [number, number, number]
export type Vec2Data = [number, number]

export type AssetType =
  | 'model'
  | 'texture'
  | 'material'
  | 'animation-controller'
  | 'prefab'
  | 'environment'

export interface AssetRecord {
  id: string
  type: AssetType
  name: string
  /** Infrastructure agnostic URI. e.g. `idb://…` in the editor, `https://…` or `/assets/…` at runtime. */
  uri: string
  metadata?: Record<string, unknown>
}

/* ------------------------------------------------------------------ */
/* Components (generic representation)                                 */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

export type MaterialType = 'standard' | 'physical' | 'unlit'

export interface MaterialProperties {
  baseColor?: string
  baseColorTexture?: string | null
  metalness?: number
  metalnessTexture?: string | null
  roughness?: number
  roughnessTexture?: string | null
  normalTexture?: string | null
  normalScale?: number
  emissive?: string
  emissiveIntensity?: number
  emissiveTexture?: string | null
  opacity?: number
  transparent?: boolean
  alphaTest?: number
  side?: 'front' | 'back' | 'double'
}

export interface MaterialDefinition {
  id: string
  name: string
  type: MaterialType
  properties: MaterialProperties
}

export interface MaterialAsset {
  format: typeof MATERIAL_FORMAT
  schemaVersion: number
  material: MaterialDefinition
}

/* ------------------------------------------------------------------ */
/* Animation                                                           */
/* ------------------------------------------------------------------ */

export type AnimatorParameterType = 'float' | 'int' | 'bool' | 'trigger'

export interface AnimatorParameter {
  id: string
  name: string
  type: AnimatorParameterType
  default: number | boolean
}

export interface AnimatorState {
  id: string
  name: string
  /** Animation clip name inside the source model asset, or null for the default (empty) state. */
  clip: string | null
  loop: boolean
  speed: number
}

export type AnimatorConditionOperator = '>' | '<' | '==' | '!=' | 'trigger'

export interface AnimatorCondition {
  parameterId: string
  operator: AnimatorConditionOperator
  value?: number | boolean
}

export interface AnimatorTransition {
  id: string
  from: string
  to: string
  /** Cross fade duration in seconds. */
  duration: number
  /** Normalized exit time (0–1) when conditions are already satisfied. */
  exitTime: number
  conditions: AnimatorCondition[]
}

export interface AnimatorController {
  id: string
  name: string
  /** Model asset that provides the clips, if any. */
  modelAssetId: string | null
  parameters: AnimatorParameter[]
  states: AnimatorState[]
  transitions: AnimatorTransition[]
  entryStateId: string
}

/* ------------------------------------------------------------------ */
/* Prefabs                                                             */
/* ------------------------------------------------------------------ */

/**
 * Field-level patch of component data that differs from the prefab source.
 * Keyed by member entity uuid, then component id, then field name.
 */
export type PrefabOverrides = Record<string, Record<string, Record<string, unknown>>>

export interface PrefabDefinition {
  format: typeof PREFAB_FORMAT
  schemaVersion: number
  id: string
  name: string
  rootEntityId: string
  entities: SerializedEntity[]
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export type ToneMappingType = 'none' | 'aces' | 'linear' | 'reinhard' | 'cineon'

export interface FogSettings {
  enabled: boolean
  type: 'linear' | 'exponential'
  color: string
  near: number
  far: number
  density: number
}

export interface SceneSettings {
  background: string
  /** HDRI environment asset id, or null. */
  environmentAssetId: string | null
  environmentIntensity: number
  fog: FogSettings
  toneMapping: ToneMappingType
  toneMappingExposure: number
  shadowEnabled: boolean
  /** Persistent UUID of the default camera entity. */
  defaultCameraId: string | null
}

export interface SceneData {
  format: typeof SCENE_FORMAT
  schemaVersion: number
  id: string
  name: string
  settings: SceneSettings
  entities: SerializedEntity[]
}

/* ------------------------------------------------------------------ */
/* Project                                                             */
/* ------------------------------------------------------------------ */

export interface ProjectInfo {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface ProjectData {
  format: typeof PROJECT_FORMAT
  schemaVersion: number
  project: ProjectInfo
  scene: SceneData
  assets: AssetRecord[]
  materials: MaterialDefinition[]
  prefabs: PrefabDefinition[]
  animatorControllers: AnimatorController[]
}
