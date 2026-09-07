import { runMigrations, UnsupportedSchemaVersionError, type Migration } from './runner.js'
import { CURRENT_SCHEMA_VERSION } from '../versions.js'
import type {
  ProjectData,
  SceneData,
  PrefabDefinition,
  MaterialAsset,
  AnimationClipAsset,
  AnimatorController,
  ParticleEffectAsset,
} from '../schema/index.js'

/**
 * Per-domain migration pipelines. Schema is V1 everywhere — every map is
 * intentionally empty; registering `1: migrateV1ToV2` later extends a domain
 * without touching the dispatcher.
 */

export const projectMigrations: Record<number, Migration> = {}
export const sceneMigrations: Record<number, Migration> = {}
export const prefabMigrations: Record<number, Migration> = {}
export const materialMigrations: Record<number, Migration> = {}
export const animationMigrations: Record<number, Migration> = {}
export const animatorMigrations: Record<number, Migration> = {}
export const particleMigrations: Record<number, Migration> = {}

/** Standalone scene file (`.koota-scene.json`). */
export function migrateScene(data: SceneData): SceneData {
  return runMigrations('Scene', data, sceneMigrations, CURRENT_SCHEMA_VERSION)
}

/** Standalone prefab file (`.koota-prefab.json`). */
export function migratePrefab(data: PrefabDefinition): PrefabDefinition {
  return runMigrations('Prefab', data, prefabMigrations, CURRENT_SCHEMA_VERSION)
}

/** Standalone material file (`.koota-material.json`). */
export function migrateMaterialAsset(data: MaterialAsset): MaterialAsset {
  return runMigrations('Material', data, materialMigrations, CURRENT_SCHEMA_VERSION)
}

/** Standalone animation clip file (`.koota-animation.json`). */
export function migrateAnimation(data: AnimationClipAsset): AnimationClipAsset {
  return runMigrations('Animation', data, animationMigrations, CURRENT_SCHEMA_VERSION)
}

/** Standalone animator controller (schemaVersion defaults to 1 when embedded). */
export function migrateAnimator(data: AnimatorController): AnimatorController {
  const withVersion = { ...data, schemaVersion: data.schemaVersion ?? 1 }
  return runMigrations('Animator', withVersion, animatorMigrations, CURRENT_SCHEMA_VERSION)
}

/** Standalone particle effect file (`.koota-particle.json`). */
export function migrateParticle(data: ParticleEffectAsset): ParticleEffectAsset {
  return runMigrations('Particle', data, particleMigrations, CURRENT_SCHEMA_VERSION)
}

/** Project envelope, then every embedded versioned sub-document. */
export function migrateProject(data: ProjectData): ProjectData {
  const project = runMigrations('Project', data, projectMigrations, CURRENT_SCHEMA_VERSION)
  const migrated: ProjectData = {
    ...project,
    scene: migrateScene(project.scene),
    prefabs: project.prefabs.map((prefab) => migratePrefab(prefab)),
    animations: (project.animations ?? []).map((clip) => migrateAnimation(clip)),
    animatorControllers: (project.animatorControllers ?? []).map((controller) =>
      migrateAnimator(controller)
    ),
    particleEffects: (project.particleEffects ?? []).map((effect) => migrateParticle(effect)),
  }
  return migrated
}

export { runMigrations, UnsupportedSchemaVersionError }
export type { Migration }
