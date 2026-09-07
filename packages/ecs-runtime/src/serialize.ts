import type { Entity, World } from 'koota'
import {
  CURRENT_SCHEMA_VERSION,
  SCENE_FORMAT,
  type PrefabOverrides,
  type SceneData,
  type SceneSettings,
  type SerializedComponents,
  type SerializedEntity,
  type PrefabDefinition,
} from '@ahengine/project-schema'
import { EntityMeta, InstanceMember, PrefabInstance } from './traits.js'
import { getComponentDef, serializableDefs } from './registry.js'
import { ChildOf, getParent } from './relations.js'
import { instantiatePrefab } from './prefabs.js'

/**
 * World ↔ authoring-data conversion. The Koota world is the live editing
 * state; SerializedEntity is the durable, engine independent product.
 */

export function serializeEntity(entity: Entity, options?: { skipChildren?: boolean }): SerializedEntity {
  const meta = entity.get(EntityMeta)
  const components: SerializedComponents = {}
  for (const def of serializableDefs()) {
    if (!entity.has(def.trait)) continue
    const record = entity.get(def.trait) as Record<string, unknown>
    components[def.id] = def.serialize(record)
  }
  const parent = getParent(entity)
  return {
    id: meta?.uuid ?? '',
    name: meta?.name ?? 'Entity',
    enabled: meta?.enabled !== false,
    parentId: options?.skipChildren ? null : (parent ? (parent.get(EntityMeta)?.uuid ?? null) : null),
    components,
  }
}

export function serializeSubtree(world: World, root: Entity): SerializedEntity[] {
  const out: SerializedEntity[] = []
  const walk = (entity: Entity) => {
    out.push(serializeEntity(entity))
    for (const child of world.query(ChildOf(entity))) walk(child)
  }
  walk(root)
  return out
}

/**
 * Serialize scene entities. Prefab instances collapse to their root entity —
 * members are rebuilt from the prefab definition plus recorded overrides.
 */
export function serializeSceneEntities(world: World): SerializedEntity[] {
  const result: SerializedEntity[] = []
  const instanceMemberUuids = new Set<string>()
  // Mark members of prefab instances so their live entities are skipped.
  for (const entity of world.query(InstanceMember)) {
    const uuid = entity.get(EntityMeta)?.uuid
    if (uuid) instanceMemberUuids.add(uuid)
  }

  const walk = (entity: Entity, parentId: string | null) => {
    const uuid = entity.get(EntityMeta)?.uuid
    if (uuid && instanceMemberUuids.has(uuid)) return
    const serialized = serializeEntity(entity)
    serialized.parentId = parentId
    result.push(serialized)
    if (entity.has(PrefabInstance)) {
      // Instance members serialize into overrides, not into the scene graph.
      const instance = entity.get(PrefabInstance)!
      const withOverrides: SerializedEntity = {
        ...serialized,
        components: {
          ...serialized.components,
          'prefab.instance': {
            prefabId: instance.prefabId,
            instanceId: instance.instanceId,
            overrides: instance.overrides as unknown as PrefabOverrides,
          },
        },
      }
      result[result.length - 1] = withOverrides
      // Members still contribute nothing directly.
      return
    }
    for (const child of world.query(ChildOf(entity))) walk(child, uuid ?? null)
  }

  for (const entity of world.query(EntityMeta)) {
    if (getParent(entity) === undefined) walk(entity, null)
  }
  return result
}

export function serializeScene(world: World, settings: SceneSettings, meta: { id: string; name: string }): SceneData {
  return {
    format: SCENE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: meta.id,
    name: meta.name,
    settings,
    entities: serializeSceneEntities(world),
  }
}

/* ------------------------------------------------------------------ */
/* Deserialization                                                     */
/* ------------------------------------------------------------------ */

export interface SpawnOptions {
  /** uuid to assign (preserved identity across save/load) */
  uuid?: string
  name?: string
}

export function deserializeEntity(world: World, data: SerializedEntity): Entity {
  const uuid = data.id
  const entity = world.spawn(
    [EntityMeta, { uuid, name: data.name ?? 'Entity', enabled: data.enabled !== false }]
  )
  const unknown: string[] = []
  for (const [componentId, value] of Object.entries(data.components ?? {})) {
    const def = getComponentDef(componentId)
    if (!def) {
      unknown.push(componentId)
      continue
    }
    if (!def.serializable) continue
    entity.add([def.trait, def.deserialize(value) as never])
  }
  if (unknown.length > 0) {
    entity.destroy()
    throw new Error(
      `Unknown component${unknown.length > 1 ? 's' : ''} on entity "${data.name}": ${unknown.join(', ')}` +
        ' (registry ids are stable — data authored by a newer editor cannot load here)'
    )
  }
  return entity
}

/**
 * Two-pass scene load: create all entities first (so parent uuids resolve),
 * then link hierarchy. Prefab instance entities are expanded through the
 * prefab definitions available in `prefabs`.
 */
export function deserializeScene(
  world: World,
  entities: SerializedEntity[],
  prefabs: PrefabDefinition[] = []
): { entitiesById: Map<string, Entity>; rootEntities: Entity[] } {
  const prefabById = new Map(prefabs.map((p) => [p.id, p]))
  const entitiesById = new Map<string, Entity>()
  const roots: Entity[] = []
  const deferredPrefabs: { entity: Entity; data: SerializedEntity }[] = []

  for (const data of entities) {
    const instanceData = data.components?.['prefab.instance'] as
      | { prefabId: string; instanceId: string; overrides?: PrefabOverrides }
      | undefined
    if (instanceData?.prefabId && prefabById.has(instanceData.prefabId)) {
      const prefab = prefabById.get(instanceData.prefabId)!
      // Pass the FULL prefab table as context so nested instances
      // (A contains B contains C) resolve and expand instead of being
      // silently skipped.
      const root = instantiatePrefab(world, prefab, {
        instanceId: instanceData.instanceId,
        overrides: instanceData.overrides ?? {},
        name: data.name,
        enabled: data.enabled !== false,
        prefabContext: prefabById,
      })
      entitiesById.set(data.id, root)
      deferredPrefabs.push({ entity: root, data })
      continue
    }
    const entity = deserializeEntity(world, data)
    entitiesById.set(data.id, entity)
  }

  for (const { entity, data } of deferredPrefabs) {
    if (data.parentId && entitiesById.has(data.parentId)) {
      entity.add(ChildOf(entitiesById.get(data.parentId)!))
    } else {
      roots.push(entity)
    }
  }

  for (const data of entities) {
    const entity = entitiesById.get(data.id)
    if (!entity || deferredPrefabs.some((d) => d.data === data)) continue
    if (data.parentId && entitiesById.has(data.parentId)) {
      entity.add(ChildOf(entitiesById.get(data.parentId)!))
    } else {
      roots.push(entity)
    }
  }

  return { entitiesById, rootEntities: roots }
}
