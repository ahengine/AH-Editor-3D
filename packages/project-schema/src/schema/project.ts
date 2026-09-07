import { z } from 'zod'
import { AssetRecordSchema } from './common.js'
import { SceneDataSchema } from './scene.js'
import { MaterialDefinitionSchema } from './material.js'
import { PrefabDefinitionSchema } from './prefab.js'
import { AnimationClipDataSchema } from './animation-clip.js'
import { AnimatorControllerV2Schema as AnimatorControllerSchema } from './animator-v2.js'
import { ParticleEffectDataSchema } from './particle-effect.js'

/** Project domain — the full authoring document. Single scene in V1. */

export const PROJECT_FORMAT = 'koota-3d-project'

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
  scene: import('./scene.js').SceneData
  assets: import('./common.js').AssetRecord[]
  materials: import('./material.js').MaterialDefinition[]
  prefabs: import('./prefab.js').PrefabDefinition[]
  animations: import('./animation-clip.js').AnimationClipData[]
  animatorControllers: import('./animator.js').AnimatorController[]
  particleEffects: import('./particle-effect.js').ParticleEffectData[]
}

export const ProjectDataSchema = z.object({
  format: z.literal(PROJECT_FORMAT),
  schemaVersion: z.number().int().min(1),
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
  // v1 backfill: projects authored before these arrays existed parse as [].
  animations: z.array(AnimationClipDataSchema).default([]),
  animatorControllers: z.array(AnimatorControllerSchema),
  particleEffects: z.array(ParticleEffectDataSchema).default([]),
})
