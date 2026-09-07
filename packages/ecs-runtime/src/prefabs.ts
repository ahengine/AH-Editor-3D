import type { Entity, World } from 'koota'
import {
  CURRENT_SCHEMA_VERSION,
  PREFAB_FORMAT,
  type PrefabDefinition,
  type PrefabOverrides,
} from '@ahengine/project-schema'
import { EntityMeta, InstanceMember, PrefabInstance } from './traits.js'
import { ChildOf } from './relations.js'
import { getComponentDef, serializableDefs } from './registry.js'
import { serializeSubtree } from './serialize.js'

/**
 * Prefab system.
 *
 * A Prefab is a reusable entity hierarchy stored independently from scenes.
 * Instances record only what differs from the source (field-level overrides),
 * so a prefab edit propagates to every untouched instance on reload.
 */

export function createPrefabFromEntity(world: World, root: Entity, id: string, name: string): PrefabDefinition {
  const entities = serializeSubtree(world, root)
  entities[0] = { ...entities[0], parentId: null }
  return {
    format: PREFAB_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id,
    name,
    rootEntityId: entities[0].id,
    entities,
  }
}

export interface InstantiateOptions {
  instanceId?: string
  overrides?: PrefabOverrides
  name?: string
  enabled?: boolean
}

/** Spawns a full instance of a prefab definition, applying stored overrides. */
export function instantiatePrefab(
  world: World,
  prefab: PrefabDefinition,
  options: InstantiateOptions = {}
): Entity {
  const instanceId = options.instanceId ?? newInstanceId()
  const overrides = options.overrides ?? {}
  const spawned = new Map<string, Entity>()

  // Pass 1: spawn members with fresh uuids.
  for (const data of prefab.entities) {
    const entity = world.spawn([
      EntityMeta,
      { uuid: newInstanceId(), name: data.name, enabled: data.enabled !== false },
    ])
    for (const [componentId, value] of Object.entries(data.components ?? {})) {
      if (componentId === 'prefab.instance') continue
      const def = getComponentDef(componentId)
      if (!def || !def.serializable) continue
      entity.add([def.trait, def.deserialize(value) as never])
    }
    entity.add([InstanceMember, { prefabId: prefab.id, instanceId, sourceUuid: data.id }])
    spawned.set(data.id, entity)
  }

  // Pass 2: hierarchy + overrides.
  for (const data of prefab.entities) {
    const entity = spawned.get(data.id)!
    if (data.parentId && spawned.has(data.parentId)) {
      entity.add(ChildOf(spawned.get(data.parentId)!))
    }
    const patch = overrides[data.id]
    if (patch) {
      for (const [componentId, fields] of Object.entries(patch)) {
        if (fields && Object.keys(fields).length > 0) applyPatch(entity, componentId, fields)
      }
    }
  }

  const root = spawned.get(prefab.rootEntityId)!
  root.remove(InstanceMember)
  root.add([
    PrefabInstance,
    { prefabId: prefab.id, instanceId, overrides: structuredClone(overrides) },
  ])
  if (options.name !== undefined) root.set(EntityMeta, { name: options.name })
  if (options.enabled !== undefined) root.set(EntityMeta, { enabled: options.enabled })
  return root
}

/* ------------------------------------------------------------------ */
/* Override diffing                                                    */
/* ------------------------------------------------------------------ */

function componentDataFor(entity: Entity, componentId: string): Record<string, unknown> | undefined {
  const def = getComponentDef(componentId)
  if (!def || !entity.has(def.trait)) return undefined
  return def.serialize(entity.get(def.trait) as Record<string, unknown>)
}

function sourceDataFor(
  prefab: PrefabDefinition,
  sourceUuid: string,
  componentId: string
): Record<string, unknown> | undefined {
  return prefab.entities.find((e) => e.id === sourceUuid)?.components?.[componentId]
}

/** Field-level diff of live instance members against the prefab source. */
export function computeInstanceOverrides(
  world: World,
  instanceRoot: Entity,
  prefab: PrefabDefinition
): PrefabOverrides {
  const instance = instanceRoot.get(PrefabInstance)
  if (!instance) return {}
  const overrides: PrefabOverrides = {}

  const diffEntity = (entity: Entity, sourceUuid: string) => {
    const diff: Record<string, Record<string, unknown>> = {}
    for (const def of serializableDefs()) {
      if (!entity.has(def.trait)) continue
      const live = def.serialize(entity.get(def.trait) as Record<string, unknown>)
      const source = sourceDataFor(prefab, sourceUuid, def.id)
      if (!source) {
        diff[def.id] = live
        continue
      }
      const fieldDiff = diffObjects(source, live)
      if (Object.keys(fieldDiff).length > 0) diff[def.id] = fieldDiff
    }
    if (Object.keys(diff).length > 0) overrides[sourceUuid] = diff
  }

  // The instance root maps to the prefab's root entity.
  diffEntity(instanceRoot, prefab.rootEntityId)
  for (const member of world.query(InstanceMember)) {
    const tag = member.get(InstanceMember)
    if (!tag || tag.instanceId !== instance.instanceId) continue
    diffEntity(member, tag.sourceUuid)
  }
  return overrides
}

function diffObjects(source: Record<string, unknown>, live: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(live)) {
    if (JSON.stringify(source[key]) !== JSON.stringify(value)) out[key] = value
  }
  return out
}

/** Applies a field-level patch produced by diffObjects. */
export function applyPatch(entity: Entity, componentId: string, patch: Record<string, unknown>): void {
  const def = getComponentDef(componentId)
  if (!def) return
  if (!entity.has(def.trait)) {
    entity.add([def.trait, def.deserialize(patch) as never])
    return
  }
  const serialized = def.serialize(entity.get(def.trait) as Record<string, unknown>)
  entity.set(def.trait, def.deserialize({ ...serialized, ...patch }) as never)
}

export function newInstanceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `inst-${Math.random().toString(36).slice(2, 10)}`
}
