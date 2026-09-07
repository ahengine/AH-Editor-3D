import { z } from 'zod'
import {
  CURRENT_SCHEMA_VERSION,
  MATERIAL_FORMAT,
  PREFAB_FORMAT,
  PROJECT_FORMAT,
  SCENE_FORMAT,
} from './types.js'

/* ------------------------------------------------------------------ */
/* Zod v1 schemas                                                      */
/* ------------------------------------------------------------------ */

const hexColor = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Expected #rrggbb color')

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])

export const AssetRecordSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['model', 'texture', 'material', 'animation-controller', 'prefab', 'environment']),
  name: z.string(),
  uri: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const componentData = z.record(z.string(), z.unknown())

export const SerializedEntitySchema = z.object({
  id: z.string().min(1, 'Entity id (persistent uuid) is required'),
  name: z.string(),
  enabled: z.boolean(),
  parentId: z.string().nullable(),
  components: z.record(z.string(), componentData),
})

export const MaterialPropertiesSchema = z.object({
  baseColor: hexColor.optional(),
  baseColorTexture: z.string().nullable().optional(),
  metalness: z.number().min(0).max(1).optional(),
  metalnessTexture: z.string().nullable().optional(),
  roughness: z.number().min(0).max(1).optional(),
  roughnessTexture: z.string().nullable().optional(),
  normalTexture: z.string().nullable().optional(),
  normalScale: z.number().optional(),
  emissive: hexColor.optional(),
  emissiveIntensity: z.number().min(0).optional(),
  emissiveTexture: z.string().nullable().optional(),
  opacity: z.number().min(0).max(1).optional(),
  transparent: z.boolean().optional(),
  alphaTest: z.number().min(0).max(1).optional(),
  side: z.enum(['front', 'back', 'double']).optional(),
})

export const MaterialDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['standard', 'physical', 'unlit']),
  properties: MaterialPropertiesSchema,
})

export const AnimatorParameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['float', 'int', 'bool', 'trigger']),
  default: z.union([z.number(), z.boolean()]),
})

export const AnimatorStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  clip: z.string().nullable(),
  loop: z.boolean(),
  speed: z.number(),
})

export const AnimatorTransitionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  duration: z.number().min(0),
  exitTime: z.number().min(0).max(1),
  conditions: z.array(
    z.object({
      parameterId: z.string(),
      operator: z.enum(['>', '<', '==', '!=', 'trigger']),
      value: z.union([z.number(), z.boolean()]).optional(),
    })
  ),
})

export const AnimatorControllerSchema = z.object({
  id: z.string(),
  name: z.string(),
  modelAssetId: z.string().nullable(),
  parameters: z.array(AnimatorParameterSchema),
  states: z.array(AnimatorStateSchema),
  transitions: z.array(AnimatorTransitionSchema),
  entryStateId: z.string(),
})

export const PrefabDefinitionSchema = z.object({
  format: z.literal(PREFAB_FORMAT),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string().min(1),
  name: z.string(),
  rootEntityId: z.string().min(1, 'Prefab rootEntityId is required'),
  entities: z.array(SerializedEntitySchema).min(1, 'Prefab must contain at least one entity'),
})

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
  environmentIntensity: z.number(),
  fog: FogSettingsSchema,
  toneMapping: z.enum(['none', 'aces', 'linear', 'reinhard', 'cineon']),
  toneMappingExposure: z.number(),
  shadowEnabled: z.boolean(),
  defaultCameraId: z.string().nullable(),
})

export const SceneDataSchema = z.object({
  format: z.literal(SCENE_FORMAT),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string(),
  name: z.string(),
  settings: SceneSettingsSchema,
  entities: z.array(SerializedEntitySchema),
})

export const ProjectDataSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  project: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  scene: SceneDataSchema,
  assets: z.array(AssetRecordSchema),
  materials: z.array(MaterialDefinitionSchema),
  prefabs: z.array(PrefabDefinitionSchema),
  animatorControllers: z.array(AnimatorControllerSchema),
})

export const MaterialAssetSchema = z.object({
  format: z.literal(MATERIAL_FORMAT),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  material: MaterialDefinitionSchema,
})
