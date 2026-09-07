import type { Entity } from 'koota'
import type { PrefabDefinition } from '@ahengine/project-schema'
import {
  ChildOf,
  EntityMeta,
  InstanceMember,
  PrefabInstance,
  computeInstanceOverrides,
  createPrefabFromEntity,
  findEntityByUuid,
  instantiatePrefab,
} from '@ahengine/ecs-runtime'
import { useEditorStore } from './store.js'
import { newUuid } from './actions.js'

/** Prefab authoring operations on top of the ecs-runtime primitives. */

export function createPrefabFromSelection(): void {
  const store = useEditorStore.getState()
  const uuid = store.selection[0]
  if (!uuid) return
  const entity = findEntityByUuid(store.world, uuid)
  if (!entity) return
  const name = entity.get(EntityMeta)?.name ?? 'Prefab'
  const prefab = createPrefabFromEntity(store.world, entity, `prefab-${newUuid()}`, name)
  store.setPrefabs([...store.prefabs, prefab])
  store.notify('success', `Prefab "${prefab.name}" created`)
}

/** Refreshes stored overrides on every live instance (called before save/export). */
export function captureAllInstanceOverrides(): void {
  const store = useEditorStore.getState()
  const prefabById = new Map(store.prefabs.map((p) => [p.id, p]))
  for (const root of store.world.query(PrefabInstance)) {
    const instance = root.get(PrefabInstance)
    const prefab = instance ? prefabById.get(instance.prefabId) : undefined
    if (!instance || !prefab) continue
    const overrides = computeInstanceOverrides(store.world, root, prefab)
    root.set(PrefabInstance, { ...instance, overrides })
  }
}

/** Destroys the instance and re-spawns it from the prefab source. */
export function revertInstance(uuid: string): void {
  const store = useEditorStore.getState()
  const root = findEntityByUuid(store.world, uuid)
  if (!root || !root.has(PrefabInstance)) return
  const instance = root.get(PrefabInstance)!
  const prefab = store.prefabs.find((p) => p.id === instance.prefabId)
  if (!prefab) return
  const name = root.get(EntityMeta)?.name ?? prefab.name
  const parentEntity = root.targetFor(ChildOf)

  destroyInstance(root)
  const fresh = instantiatePrefab(store.world, prefab, { name })
  if (parentEntity) fresh.add(ChildOf(parentEntity))

  const freshUuid = fresh.get(EntityMeta)?.uuid
  store.bumpWorld()
  if (freshUuid) store.select([freshUuid])
}

function destroyInstance(root: Entity): void {
  const world = useEditorStore.getState().world
  const instanceId = root.get(PrefabInstance)?.instanceId
  if (instanceId) {
    for (const member of world.query(InstanceMember)) {
      if (member.get(InstanceMember)?.instanceId === instanceId) member.destroy()
    }
  }
  root.destroy()
}

/** Converts an instance into plain entities (severs the prefab link). */
export function unpackInstance(uuid: string): void {
  const store = useEditorStore.getState()
  const root = findEntityByUuid(store.world, uuid)
  if (!root) return
  const instance = root.get(PrefabInstance)
  if (!instance) return
  const instanceId = instance.instanceId
  root.remove(PrefabInstance)
  for (const member of store.world.query(InstanceMember)) {
    if (member.get(InstanceMember)?.instanceId === instanceId) member.remove(InstanceMember)
  }
  store.bumpWorld()
  store.notify('info', 'Prefab unpacked')
}

/** Applies live instance overrides back into the prefab definition. */
export function applyInstanceOverridesToPrefab(uuid: string): void {
  const store = useEditorStore.getState()
  const root = findEntityByUuid(store.world, uuid)
  if (!root || !root.has(PrefabInstance)) return
  const instance = root.get(PrefabInstance)!
  const prefab = store.prefabs.find((p) => p.id === instance.prefabId)
  if (!prefab) return

  const overrides = computeInstanceOverrides(store.world, root, prefab)
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
  store.setPrefabs(store.prefabs.map((p) => (p.id === updated.id ? updated : p)))

  // Other instances of this prefab re-spawn to match the updated source.
  for (const other of store.world.query(PrefabInstance)) {
    if (other.get(PrefabInstance)!.prefabId !== updated.id) continue
    const otherUuid = other.get(EntityMeta)?.uuid
    if (otherUuid && otherUuid !== uuid) revertInstance(otherUuid)
  }
  store.notify('success', `Overrides applied to "${updated.name}"`)
}
