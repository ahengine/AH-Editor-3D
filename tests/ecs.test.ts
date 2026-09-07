import { describe, expect, it } from 'vitest'
import { createWorld } from 'koota'
import {
  ChildOf,
  EntityMeta,
  Transform,
  deserializeEntity,
  deserializeScene,
  findEntityByUuid,
  getChildren,
  getParent,
  isDescendantOf,
  serializeEntity,
  serializeSceneEntities,
  setParent,
} from '@ahengine/ecs-runtime'
import type { SerializedEntity } from '@ahengine/project-schema'

/* Entity serialization, persistent UUIDs, hierarchy reconstruction. */

function entityFixture(id: string, parentId: string | null = null, name = id): SerializedEntity {
  return {
    id,
    name,
    enabled: true,
    parentId,
    components: {
      'core.transform': { position: [1, 2, 3], rotation: [0, 90, 0], scale: [1, 1, 1] },
    },
  }
}

describe('entity serialization', () => {
  it('round-trips a component entity through world → JSON → world', () => {
    const world = createWorld()
    const entity = deserializeEntity(world, entityFixture('fixture-1'))
    const serialized = serializeEntity(entity)
    expect(serialized.id).toBe('fixture-1')
    expect(serialized.components['core.transform']).toEqual({
      position: [1, 2, 3],
      rotation: [0, 90, 0],
      scale: [1, 1, 1],
    })

    const world2 = createWorld()
    const again = deserializeEntity(world2, serialized)
    const transform = again.get(Transform)!
    expect(transform.position).toEqual({ x: 1, y: 2, z: 3 })
    expect(transform.rotation).toEqual({ x: 0, y: 90, z: 0 })
  })

  it('preserves persistent uuids across save/load cycles', () => {
    const world = createWorld()
    const a = deserializeEntity(world, entityFixture('stable-id'))
    const uuid = a.get(EntityMeta)!.uuid
    const serialized = serializeEntity(a)
    const world2 = createWorld()
    const b = deserializeEntity(world2, serialized)
    expect(b.get(EntityMeta)!.uuid).toBe('stable-id')
    expect(uuid).toBe('stable-id')
    // Koota internal ids are irrelevant to identity.
    expect(findEntityByUuid(world2, 'stable-id')).toBe(b)
  })
})

describe('hierarchy reconstruction', () => {
  it('rebuilds parent-child links from parentId data', () => {
    const world = createWorld()
    const { entitiesById, rootEntities } = deserializeScene(world, [
      entityFixture('root'),
      entityFixture('child-a', 'root'),
      entityFixture('child-b', 'root'),
      entityFixture('grandchild', 'child-a'),
    ])
    expect(rootEntities.map((e) => e.get(EntityMeta)!.uuid)).toEqual(['root'])
    const childA = entitiesById.get('child-a')!
    expect(getParent(childA)).toBe(entitiesById.get('root'))
    expect(getChildren(world, entitiesById.get('root')!).map((e) => e.get(EntityMeta)!.uuid)).toEqual([
      'child-a',
      'child-b',
    ])
    expect(isDescendantOf(entitiesById.get('grandchild')!, entitiesById.get('root')!)).toBe(true)
  })

  it('re-serializes nested entities with correct parent links', () => {
    const world = createWorld()
    deserializeScene(world, [entityFixture('p'), entityFixture('c', 'p')])
    const entities = serializeSceneEntities(world)
    expect(entities.find((e) => e.id === 'p')!.parentId).toBeNull()
    expect(entities.find((e) => e.id === 'c')!.parentId).toBe('p')
  })

  it('prevents cyclic reparenting through relations', () => {
    const world = createWorld()
    const { entitiesById } = deserializeScene(world, [entityFixture('p'), entityFixture('c', 'p')])
    const parent = entitiesById.get('p')!
    const child = entitiesById.get('c')!
    expect(setParent(world, parent, child)).toBe(false) // would create a cycle
    expect(setParent(world, child, null)).toBe(true)
    expect(getParent(child)).toBeUndefined()
    expect(child.has(ChildOf(parent))).toBe(false)
  })
})
