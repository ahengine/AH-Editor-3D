import type { ZodType } from 'zod'
import {
  AnimatorControllerSchema,
  MaterialAssetSchema,
  MaterialDefinitionSchema,
  PrefabDefinitionSchema,
  ProjectDataSchema,
  SceneDataSchema,
  AnimationClipAssetSchema,
  ParticleEffectAssetSchema,
} from '../schema/index.js'
import type {
  AnimatorController,
  MaterialAsset,
  MaterialDefinition,
  PrefabDefinition,
  ProjectData,
  SceneData,
  AnimationClipAsset,
  ParticleEffectAsset,
} from '../schema/index.js'
import {
  migrateAnimation,
  migrateAnimator,
  migrateMaterialAsset,
  migrateParticle,
  migratePrefab,
  migrateProject,
  migrateScene,
} from '../migrations/index.js'
import { ValidationError } from './errors.js'

/** Parse + migrate + validate arbitrary JSON. Throws ValidationError. */

function run<T>(schema: ZodType<T>, data: unknown, label: string, migrate: (value: never) => T): T {
  const raw = data as { schemaVersion?: number } | null
  const migrated =
    raw && typeof raw.schemaVersion === 'number' ? migrate(raw as never) : raw
  const result = schema.safeParse(migrated)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: `${label} → ${issue.path.map(String).join('.') || '(root)'}`,
      message: issue.message,
    }))
    throw new ValidationError(issues)
  }
  return result.data
}

export function parseProject(data: unknown): ProjectData {
  return run(ProjectDataSchema, data, 'project', migrateProject)
}

export function parseScene(data: unknown): SceneData {
  return run(SceneDataSchema, data, 'scene', migrateScene)
}

export function parsePrefab(data: unknown): PrefabDefinition {
  return run(PrefabDefinitionSchema, data, 'prefab', migratePrefab)
}

export function parseMaterialAsset(data: unknown): MaterialAsset {
  return run(MaterialAssetSchema, data, 'material-asset', migrateMaterialAsset)
}

export function parseMaterial(data: unknown): MaterialDefinition {
  return run(MaterialDefinitionSchema, data, 'material', (value) => value)
}

export function parseAnimatorController(data: unknown): AnimatorController {
  return run(AnimatorControllerSchema, data, 'animator-controller', migrateAnimator)
}

export function parseAnimationClip(data: unknown): AnimationClipAsset {
  return run(AnimationClipAssetSchema, data, 'animation-clip', migrateAnimation)
}

export function parseParticleEffect(data: unknown): ParticleEffectAsset {
  return run(ParticleEffectAssetSchema, data, 'particle-effect', migrateParticle)
}
