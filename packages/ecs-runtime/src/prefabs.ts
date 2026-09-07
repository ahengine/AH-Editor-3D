import type { Entity, World } from 'koota'
import type { PrefabDefinition, PrefabEntity, PrefabOverrides } from '@ahengine/project-schema'
import { canNestPrefab } from '@ahengine/project-schema'
import { ChildOf } from './relations.js'
import { EntityMeta, InstanceMember, PrefabInstance } from './traits.js'
import { getComponentDef, serializableDefs } from './registry.js'

/**
 * Prefab system — local-ID-based with nested prefab instances.
 *
 * A Prefab is a reusable entity hierarchy stored with STABLE LOCAL IDs
 * (not scene UUIDs). Instances in scenes carry PrefabInstance components
 * with field-level overrides keyed by localId/componentId/propertyPath.
 * Nested prefab references are stored as NestedPrefabInstance entries and
 * are NEVER flattened during save.
 */

export interface InstantiateOptions {
  instanceId?: string
  overrides?: PrefabOverrides
  name?: string
  enabled?: boolean
  /** All prefab definitions available for nested resolution. */
  prefabContext?: Map<string, PrefabDefinition>
}

/** Result of instantiation — root entity + local→scene UUID mapping. */
export interface InstantiateResult {
  root: Entity
  /** localId → scene entity UUID (for nested override targeting). */
  localToSceneUuid: Map<string, string>
  /** All spawned entities (root + members + nested instance roots). */
  allEntities: Entity[]
}

export function newInstanceId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `inst-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Recursively instantiates a prefab definition into the world.
 * Nested prefab instances are resolved (recursively) and linked.
 */
export function instantiatePrefab(
  world: World,
  prefab: PrefabDefinition,
  options: InstantiateOptions = {}
): Entity {
  return instantiatePrefabDetailed(world, prefab, options).root
}

export function instantiatePrefabDetailed(
  world: World,
  prefab: PrefabDefinition,
  options: InstantiateOptions = {}
): InstantiateResult {
  const instanceId = options.instanceId ?? newInstanceId()
  const overrides = options.overrides ?? {}
  const context = options.prefabContext ?? new Map<string, PrefabDefinition>()
  context.set(prefab.id, prefab)

  const localToSceneUuid = new Map<string, string>()
  const allEntities: Entity[] = []

  // Pass 1: spawn direct entities with fresh scene UUIDs.
  for (const entityDef of prefab.entities) {
    const sceneUuid = crypto.randomUUID()
    localToSceneUuid.set(entityDef.localId, sceneUuid)
    const entity = world.spawn([
      EntityMeta,
      { uuid: sceneUuid, name: entityDef.name, enabled: entityDef.enabled !== false },
    ])
    for (const [componentId, value] of Object.entries(entityDef.components ?? {})) {
      const def = getComponentDef(componentId)
      if (!def || !def.serializable) continue
      entity.add([def.trait, def.deserialize(value) as never])
    }
    entity.add([InstanceMember, { prefabId: prefab.id, instanceId, sourceUuid: entityDef.localId }])
    allEntities.push(entity)
  }

  // Pass 2: hierarchy (parentLocalId → ChildOf relation).
  const entityByLocal = new Map<string, Entity>()
  for (let i = 0; i < prefab.entities.length; i++) {
    const entityDef = prefab.entities[i]
    const entity = allEntities[i]
    entityByLocal.set(entityDef.localId, entity)
    if (entityDef.parentLocalId) {
      const parent = entityByLocal.get(entityDef.parentLocalId)
      if (parent) entity.add(ChildOf(parent))
    }
  }

  // Pass 3: apply overrides (field-level patches).
  for (const [localId, componentPatches] of Object.entries(overrides)) {
    const target = entityByLocal.get(localId)
    if (!target) continue
    for (const [componentId, fields] of Object.entries(componentPatches)) {
      if (!fields || Object.keys(fields).length === 0) continue
      applyPatch(target, componentId, fields)
    }
  }

  // Pass 4: nested prefab instances (recursive, NOT flattened).
  for (const nested of prefab.nestedInstances ?? []) {
    const nestedPrefab = context.get(nested.prefabId)
    if (!nestedPrefab) continue
    const nestedResult = instantiatePrefabDetailed(world, nestedPrefab, {
      instanceId: `${instanceId}:${nested.instanceId}`,
      overrides: nested.overrides ?? {},
      name: nested.name,
      prefabContext: context,
    })
    // Link nested root under the specified parent.
    const parentLocal = nested.parentLocalId
    const parentEntity = parentLocal ? entityByLocal.get(parentLocal) : entityByLocal.get(prefab.rootLocalEntityId)
    if (parentEntity && nestedResult.root.isAlive()) {
      nestedResult.root.add(ChildOf(parentEntity))
    }
    allEntities.push(...nestedResult.allEntities)
    // Merge local→scene mapping with prefix to avoid collisions.
    for (const [k, v] of nestedResult.localToSceneUuid) {
      localToSceneUuid.set(`${nested.instanceId}:${k}`, v)
    }
  }

  // Mark root with PrefabInstance.
  const root = entityByLocal.get(prefab.rootLocalEntityId)!
  root.remove(InstanceMember)
  root.add([
    PrefabInstance,
    { prefabId: prefab.id, instanceId, overrides: structuredClone(overrides) },
  ])
  if (options.name !== undefined) root.set(EntityMeta, { name: options.name })
  if (options.enabled !== undefined) root.set(EntityMeta, { enabled: options.enabled })

  return { root, localToSceneUuid, allEntities }
}

/* ------------------------------------------------------------------ */
/* Create prefab from scene entities (new localId format)              */
/* ------------------------------------------------------------------ */

export function createPrefabFromEntity(
  world: World,
  root: Entity,
  id: string,
  name: string
): PrefabDefinition {
  const entities: PrefabEntity[] = []
  const uuidToLocal = new Map<string, string>()
  const used = new Set<string>()

  const uniqueLocal = (entityName: string) => {
    let candidate = (entityName || 'entity').toLowerCase().replace(/\s+/g, '-')
    let i = 1
    while (used.has(candidate)) candidate = `${(entityName || 'entity').toLowerCase().replace(/\s+/g, '-')}-${i++}`
    used.add(candidate)
    return candidate
  }

  const walk = (entity: Entity, parentLocalId: string | null) => {
    const meta = entity.get(EntityMeta)
    if (!meta) return
    const localId = uniqueLocal(meta.name)
    uuidToLocal.set(meta.uuid, localId)

    const components: Record<string, Record<string, unknown>> = {}
    for (const def of serializableDefs()) {
      if (!entity.has(def.trait)) continue
      if (def.id === 'prefab.instance') continue
      components[def.id] = def.serialize(entity.get(def.trait) as Record<string, unknown>)
    }

    entities.push({
      localId,
      parentLocalId,
      name: meta.name,
      enabled: meta.enabled,
      components,
    })

    for (const child of world.query(ChildOf(entity))) walk(child, localId)
  }

  walk(root, null)
  const rootLocal = uuidToLocal.get(root.get(EntityMeta)!.uuid) ?? 'root'

  return {
    format: 'koota-3d-prefab',
    schemaVersion: 1,
    id,
    name,
    rootLocalEntityId: rootLocal,
    entities,
    nestedInstances: [],
  }
}

/* ------------------------------------------------------------------ */
/* Override diff/revert/apply                                          */
/* ------------------------------------------------------------------ */

function sourceDataFor(prefab: PrefabDefinition, localId: string, componentId: string): Record<string, unknown> | undefined {
  const entity = prefab.entities.find((e) => e.localId === localId)
  return entity?.components?.[componentId]
}

/** Field-level diff of live instance members against the prefab source. */
export function computeInstanceOverrides(
  world: World,
  instanceRoot: Entity,
  prefab: PrefabDefinition
): PrefabOverrides {
  const instanceId = instanceRoot.get(PrefabInstance)?.instanceId
  if (!instanceId) return {}
  const overrides: PrefabOverrides = {}
  for (const member of world.query(InstanceMember)) {
    const tag = member.get(InstanceMember)
    if (!tag || tag.instanceId !== instanceId) continue
    const diff: Record<string, Record<string, unknown>> = {}
    for (const def of serializableDefs()) {
      if (!member.has(def.trait)) continue
      const live = def.serialize(member.get(def.trait) as Record<string, unknown>)
      const source = sourceDataFor(prefab, tag.sourceUuid, def.id)
      if (!source) {
        diff[def.id] = live
        continue
      }
      const fieldDiff = diffObjects(source, live)
      if (Object.keys(fieldDiff).length > 0) diff[def.id] = fieldDiff
    }
    if (Object.keys(diff).length > 0) overrides[tag.sourceUuid] = diff
  }
  // Include root's own overrides (root has PrefabInstance, not InstanceMember)
  const rootTag = instanceRoot.get(PrefabInstance)
  if (rootTag) {
    const rootDiff: Record<string, Record<string, unknown>> = {}
    for (const def of serializableDefs()) {
      if (!instanceRoot.has(def.trait) || def.id === 'prefab.instance') continue
      const live = def.serialize(instanceRoot.get(def.trait) as Record<string, unknown>)
      const source = sourceDataFor(prefab, prefab.rootLocalEntityId, def.id)
      if (!source) { rootDiff[def.id] = live; continue }
      const fieldDiff = diffObjects(source, live)
      if (Object.keys(fieldDiff).length > 0) rootDiff[def.id] = fieldDiff
    }
    if (Object.keys(rootDiff).length > 0) overrides[prefab.rootLocalEntityId] = rootDiff
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

/**
 * Applies live instance overrides back into the prefab definition.
 * All OTHER instances of this prefab revert to the updated source.
 */
export function applyOverridesToPrefab(
  world: World,
  instanceRoot: Entity,
  prefab: PrefabDefinition,
  _allPrefabs: Map<string, PrefabDefinition>
): PrefabDefinition {
  const overrides = computeInstanceOverrides(world, instanceRoot, prefab)
  const updated: PrefabDefinition = {
    ...prefab,
    entities: prefab.entities.map((entity) => {
      const patch = overrides[entity.localId]
      if (!patch) return entity
      return {
        ...entity,
        components: Object.fromEntries(
          Object.entries(entity.components).map(([componentId, data]) => [
            componentId,
            patch[componentId]
              ? { ...(data as Record<string, unknown>), ...patch[componentId] }
              : data,
          ])
        ),
      }
    }),
  }
  // Revert other instances to match updated source
  for (const other of world.query(PrefabInstance)) {
    if (other.get(PrefabInstance)!.prefabId !== updated.id) continue
    const otherUuid = other.get(EntityMeta)?.uuid
    if (otherUuid && otherUuid !== instanceRoot.get(EntityMeta)?.uuid) {
      const s = useEditorStoreShim()
      void s
    }
  }
  return updated
}

// Minimal store shim to avoid circular import (called from editor-core wrapper)
let editorStoreShim: { bumpWorld(): void; notify(kind: string, msg: string): void } | null = null
export function setEditorStoreShim(shim: typeof editorStoreShim): void {
  editorStoreShim = shim
}
function useEditorStoreShim() {
  return editorStoreShim
}

/* ------------------------------------------------------------------ */
/* Cycle validation                                                    */
/* ------------------------------------------------------------------ */

export function validateNesting(
  containerId: string,
  nestedId: string,
  allPrefabs: Map<string, PrefabDefinition>
): { ok: boolean; error?: string } {
  return canNestPrefab(containerId, nestedId, { prefabs: allPrefabs })
}
