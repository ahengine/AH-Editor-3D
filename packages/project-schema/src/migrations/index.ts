import { runMigrations, UnsupportedSchemaVersionError, type Migration } from './runner.js'
import { CURRENT_SCHEMA_VERSION } from '../versions.js'
import type {
  ProjectData,
  SceneData,
  PrefabDefinition,
  MaterialAsset,
  AnimationClipAsset,
  AnimatorControllerV2 as AnimatorController,
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

/** Standalone prefab file (`.koota-prefab.json`). Normalizes legacy shape, then migrates. */
export function migratePrefab(data: PrefabDefinition): PrefabDefinition {
  // Legacy prefabs (SerializedEntity[] with UUIDs) may still carry schemaVersion=1.
  // Detect by shape and normalize before the standard migration chain.
  const raw = data as unknown as Record<string, unknown>
  const entities = raw.entities as Array<Record<string, unknown>> | undefined
  const isLegacy = (entities?.length ?? 0) > 0 && entities![0].id !== undefined && entities![0].localId === undefined
  if (isLegacy) {
    return normalizeLegacyPrefab(data as unknown as Parameters<typeof normalizeLegacyPrefab>[0]) as PrefabDefinition
  }
  return runMigrations('Prefab', data, prefabMigrations, CURRENT_SCHEMA_VERSION)
}

function normalizeLegacyPrefab(data: {
  id: string; name: string; rootEntityId: string
  entities: Array<{ id: string; parentId: string | null; name: string; enabled?: boolean; components?: Record<string, Record<string, unknown>> }>
}): PrefabDefinition {
  const idToLocal = new Map<string, string>()
  const used = new Set<string>()
  const uniqueLocal = (name: string) => {
    let candidate = name.toLowerCase().replace(/\s+/g, '-') || 'entity'
    let i = 1
    while (used.has(candidate)) candidate = `${name.toLowerCase().replace(/\s+/g, '-')}-${i++}`
    used.add(candidate)
    return candidate
  }
  const entities = data.entities.map((e) => {
    const localId = uniqueLocal(e.name ?? 'entity')
    idToLocal.set(e.id, localId)
    return { localId, parentLocalId: null as string | null, name: e.name ?? 'Entity', enabled: e.enabled ?? true, components: e.components ?? {} }
  })
  data.entities.forEach((legacy, i) => {
    entities[i].parentLocalId = legacy.parentId ? idToLocal.get(legacy.parentId) ?? null : null
  })
  return {
    format: 'koota-3d-prefab' as const,
    schemaVersion: 1,
    id: data.id,
    name: data.name,
    rootLocalEntityId: idToLocal.get(data.rootEntityId) ?? entities[0]?.localId ?? 'root',
    entities,
    nestedInstances: [],
  }
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
export function migrateParticle(data: import('../schema/particle-effect.js').ParticleEffectData): import('../schema/particle-effect.js').ParticleEffectData {
  return runMigrations('Particle', data, particleMigrations, CURRENT_SCHEMA_VERSION)
}

/** Project envelope, then every embedded versioned sub-document. */
export function migrateProject(data: ProjectData): ProjectData {
  const project = runMigrations('Project', data, projectMigrations, CURRENT_SCHEMA_VERSION)
  const migrated: ProjectData = {
    ...project,
    scene: migrateScene(project.scene),
    prefabs: project.prefabs.map((prefab) => migratePrefab(prefab)),
    animations: project.animations ?? [],
    animatorControllers: (project.animatorControllers ?? []).map((controller) =>
      migrateAnimator(controller)
    ),
    particleEffects: project.particleEffects ?? [],
  }
  return migrated
}

export { runMigrations, UnsupportedSchemaVersionError }
export type { Migration }
