import { describe, expect, it } from 'vitest'
import { createWorld } from 'koota'
import {
  EntityMeta,
  InstanceMember,
  PrefabInstance,
  Transform,
  applyPatch,
  computeInstanceOverrides,
  createPrefabFromEntity,
  deserializeEntity,
  deserializeScene,
  findEntityByUuid,
  instantiatePrefab,
  serializeSceneEntities,
} from '@ahengine/ecs-runtime'
import type { SerializedEntity } from '@ahengine/project-schema'

/* Prefab creation, instantiation, overrides, revert — spec §48. */

function cube(id: string, parentId: string | null = null): SerializedEntity {
  return {
    id,
    name: 'Cube',
    enabled: true,
    parentId,
    components: {
      'core.transform': { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      'render.mesh': { shape: 'box', size: 1, segments: 1 },
    },
  }
}

describe('prefabs', () => {
  it('creates a prefab definition from an entity subtree', () => {
    const world = createWorld()
    deserializeScene(world, [cube('cube-root'), cube('cube-child', 'cube-root')])
    const root = findEntityByUuid(world, 'cube-root')!
    const prefab = createPrefabFromEntity(world, root, 'prefab-1', 'Cube')
    expect(prefab.rootEntityId).toBe('cube-root')
    expect(prefab.entities).toHaveLength(2)
    expect(prefab.entities[0].parentId).toBeNull()
    expect(prefab.entities[1].parentId).toBe('cube-root')
  })

  it('instantiates fresh members with new uuids linked to the source', () => {
    const world = createWorld()
    deserializeScene(world, [cube('cube-root')])
    const source = findEntityByUuid(world, 'cube-root')!
    const prefab = createPrefabFromEntity(world, source, 'prefab-1', 'Cube')

    const instance = instantiatePrefab(world, prefab)
    const instanceUuid = instance.get(EntityMeta)!.uuid
    expect(instanceUuid).not.toBe('cube-root')
    expect(instance.has(PrefabInstance)).toBe(true)
    expect(instance.get(PrefabInstance)!.prefabId).toBe('prefab-1')
    // Original untouched
    expect(source.has(PrefabInstance)).toBe(false)
    expect(source.get(Transform)!.position).toEqual({ x: 0, y: 0.5, z: 0 })
  })

  it('records only differing fields as overrides', () => {
    const world = createWorld()
    deserializeScene(world, [cube('cube-root')])
    const source = findEntityByUuid(world, 'cube-root')!
    const prefab = createPrefabFromEntity(world, source, 'prefab-1', 'Cube')

    const instance = instantiatePrefab(world, prefab)
    // Move the instance root.
    applyPatch(instance, 'core.transform', { position: [4, 0, 2] })

    const overrides = computeInstanceOverrides(world, instance, prefab)
    const rootPatch = overrides['cube-root']
    expect(rootPatch).toBeDefined()
    expect(rootPatch['core.transform']).toEqual({ position: [4, 0, 2] }) // only position differs
    // Prefab source unchanged
    expect(prefab.entities[0].components['core.transform']).toEqual({
      position: [0, 0.5, 0],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
    })
  })

  it('reverting an instance re-spawns it from the prefab source', () => {
    const world = createWorld()
    deserializeScene(world, [cube('cube-root')])
    const source = findEntityByUuid(world, 'cube-root')!
    const prefab = createPrefabFromEntity(world, source, 'prefab-1', 'Cube')

    const instance = instantiatePrefab(world, prefab)
    applyPatch(instance, 'core.transform', { position: [9, 9, 9] })
    expect(instance.get(Transform)!.position).toEqual({ x: 9, y: 9, z: 9 })

    // Revert = destroy + re-instantiate with same instanceId, no overrides.
    const instanceId = instance.get(PrefabInstance)!.instanceId
    for (const member of world.query(InstanceMember)) {
      if (member.get(InstanceMember)!.instanceId === instanceId) member.destroy()
    }
    instance.destroy()
    const fresh = instantiatePrefab(world, prefab, { instanceId })
    expect(fresh.get(Transform)!.position).toEqual({ x: 0, y: 0.5, z: 0 })
  })

  it('serializes instances as roots with overrides, not as full copies', () => {
    const world = createWorld()
    deserializeScene(world, [cube('cube-root')])
    const source = findEntityByUuid(world, 'cube-root')!
    const prefab = createPrefabFromEntity(world, source, 'prefab-1', 'Cube')

    const instance = instantiatePrefab(world, prefab, { name: 'Cube Instance' })
    applyPatch(instance, 'core.transform', { position: [4, 0, 2] })

    const serialized = serializeSceneEntities(world)
    const instanceRow = serialized.find((row) => row.name === 'Cube Instance')!
    expect(instanceRow.components['prefab.instance']).toMatchObject({
      prefabId: 'prefab-1',
    })
    // Members collapsed: total rows = source + instance root only.
    expect(serialized.filter((row) => row.components['prefab.instance'])).toHaveLength(1)
    const memberRows = serialized.filter((row) => row.name === 'Cube' && row.id !== 'cube-root')
    expect(memberRows).toHaveLength(0)
  })
})
