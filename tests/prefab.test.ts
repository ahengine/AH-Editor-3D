import { describe, expect, it } from 'vitest'
import { createWorld } from 'koota'
import {
  EntityMeta,
  PrefabInstance,
  Transform,
  instantiatePrefabDetailed,
  createPrefabFromEntity,
  computeInstanceOverrides,
  applyPatch,
} from '@ahengine/ecs-runtime'
import type { PrefabDefinition, PrefabEntity } from '@ahengine/project-schema'

/* Prefab system (localId format) — create/instantiate/override/revert/round-trip. */

function cube(localId: string, parentLocalId: string | null = null): PrefabEntity {
  return {
    localId,
    parentLocalId,
    name: 'Cube',
    enabled: true,
    components: {
      'core.transform': { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      'render.mesh': { shape: 'box', size: 1, segments: 1 },
    },
  }
}

function makePrefab(entities: PrefabEntity[]): PrefabDefinition {
  return {
    format: 'koota-3d-prefab',
    schemaVersion: 1,
    id: 'test-prefab',
    name: 'Test Prefab',
    rootLocalEntityId: entities[0]?.localId ?? 'root',
    entities,
    nestedInstances: [],
  }
}

describe('prefab localId format', () => {
  it('creates a prefab from a scene entity with stable localId', () => {
    const world = createWorld()
    const root = world.spawn([EntityMeta, { uuid: crypto.randomUUID(), name: 'Cube', enabled: true }], [Transform, { position: { x: 0, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }])
    const prefab = createPrefabFromEntity(world, root, 'test-prefab', 'Cube')
    expect(prefab.rootLocalEntityId).toBe('cube')
    expect(prefab.entities[0].localId).toBe('cube')
    expect(prefab.entities[0].components['core.transform']).toBeDefined()
  })

  it('instantiates with fresh scene UUIDs mapped from localIds', () => {
    const world = createWorld()
    const result = instantiatePrefabDetailed(world, makePrefab([cube('cube')]))
    expect(result.root.has(PrefabInstance)).toBe(true)
    expect(result.localToSceneUuid.get('cube')).toBeDefined()
    expect(result.localToSceneUuid.get('cube')).not.toBe('cube')
  })

  it('overrides apply only specified fields (localId keyed)', () => {
    const world = createWorld()
    const result = instantiatePrefabDetailed(world, makePrefab([cube('cube')]), {
      overrides: { cube: { 'core.transform': { position: [4, 0, 2] } } },
    })
    expect(result.root.get(Transform)!.position.x).toBe(4)
    expect(result.root.get(Transform)!.scale.x).toBe(1)
  })

  it('computeInstanceOverrides returns field-level diff keyed by localId', () => {
    const world = createWorld()
    const prefab = makePrefab([cube('cube')])
    const result = instantiatePrefabDetailed(world, prefab)
    applyPatch(result.root, 'core.transform', { position: [9, 9, 9] })
    const overrides = computeInstanceOverrides(world, result.root, prefab)
    expect(overrides['cube']['core.transform']).toEqual({ position: [9, 9, 9] })
    expect(prefab.entities[0].components['core.transform']).toMatchObject({ position: [0, 0.5, 0] })
  })

  it('JSON round-trip preserves localIds and nestedInstances (no flattening)', () => {
    const prefab = makePrefab([cube('cube'), { ...cube('child', 'cube'), name: 'Child' }])
    prefab.nestedInstances = [
      { instanceId: 'n1', prefabId: 'other', parentLocalId: 'cube', overrides: {} },
    ]
    const json = JSON.parse(JSON.stringify(prefab))
    expect(json.entities).toHaveLength(2)
    expect(json.entities[1].parentLocalId).toBe('cube')
    expect(json.nestedInstances).toHaveLength(1)
    expect(json.entities[0].id).toBeUndefined()
  })
})
