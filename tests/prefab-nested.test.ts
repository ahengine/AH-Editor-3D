import { describe, expect, it } from 'vitest'
import { createWorld } from 'koota'
import { EntityMeta, PrefabInstance, MaterialReference, getChildren, instantiatePrefabDetailed, validateNesting } from '@ahengine/ecs-runtime'
import type { PrefabDefinition, PrefabEntity, NestedPrefabInstance } from '@ahengine/project-schema'
import { detectPrefabCycle } from '@ahengine/project-schema'

/* Nested prefab system: local IDs, nested instances, overrides, cycle protection. */

function makeEntity(localId: string, parentLocalId: string | null, name: string, components: Record<string, Record<string, unknown>>): PrefabEntity {
  return { localId, parentLocalId, name, enabled: true, components }
}

function makePrefab(id: string, name: string, entities: PrefabEntity[], nested: NestedPrefabInstance[] = []): PrefabDefinition {
  return {
    format: 'koota-3d-prefab',
    schemaVersion: 1,
    id,
    name,
    rootLocalEntityId: entities[0]?.localId ?? 'root',
    entities,
    nestedInstances: nested,
  }
}

describe('prefab local IDs + instantiation', () => {
  it('instantiates entities with fresh scene UUIDs mapped from localIds', () => {
    const world = createWorld()
    const prefab = makePrefab('p-chair', 'Chair', [
      makeEntity('root', null, 'Chair', { 'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
      makeEntity('seat', 'root', 'Seat', { 'core.transform': { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    ])
    const result = instantiatePrefabDetailed(world, prefab)
    expect(result.allEntities.length).toBe(2)
    expect(result.localToSceneUuid.has('root')).toBe(true)
    expect(result.localToSceneUuid.has('seat')).toBe(true)
    // Scene UUIDs are fresh (not equal to localIds)
    expect(result.localToSceneUuid.get('root')).not.toBe('root')
    expect(result.localToSceneUuid.get('seat')).not.toBe('seat')
    // Root has PrefabInstance
    expect(result.root.has(PrefabInstance)).toBe(true)
    // Seat is child of root
    const children = getChildren(world, result.root)
    expect(children.length).toBe(1)
    expect(children[0].get(EntityMeta)!.name).toBe('Seat')
  })
})

describe('nested prefab instances (NOT flattened)', () => {
  it('Car contains 4 Wheel instances as nested references', () => {
    const wheel = makePrefab('p-wheel', 'Wheel', [
      makeEntity('wheel-root', null, 'Wheel', {
        'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        'render.material': { slots: [{ materialId: 'mat-black' }] },
      }),
    ])
    const car = makePrefab('p-car', 'Car', [
      makeEntity('car-root', null, 'Car', { 'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
      makeEntity('body', 'car-root', 'Body', { 'core.transform': { position: [0, 1, 0], rotation: [0, 0, 0], scale: [2, 0.5, 4] } }),
    ], [
      { instanceId: 'wheel-fl', prefabId: 'p-wheel', parentLocalId: 'car-root', overrides: {} },
      { instanceId: 'wheel-fr', prefabId: 'p-wheel', parentLocalId: 'car-root', overrides: {} },
      { instanceId: 'wheel-rl', prefabId: 'p-wheel', parentLocalId: 'car-root', overrides: {} },
      { instanceId: 'wheel-rr', prefabId: 'p-wheel', parentLocalId: 'car-root', overrides: {} },
    ])

    // Nested instances preserved in data (not flattened)
    expect(car.nestedInstances.length).toBe(4)
    expect(car.nestedInstances.every(n => n.prefabId === 'p-wheel')).toBe(true)

    // Instantiate Car in a world with Wheel available
    const world = createWorld()
    const context = new Map<string, PrefabDefinition>([['p-wheel', wheel], ['p-car', car]])
    const result = instantiatePrefabDetailed(world, car, { prefabContext: context })
    // 2 car entities + 4 wheel entities
    expect(result.allEntities.length).toBe(6)
    // Car root + body + 4 wheel children under car-root
    const carChildren = getChildren(world, result.root)
    expect(carChildren.length).toBe(5) // body + 4 wheels
  })

  it('editing Wheel prefab propagates to all 4 Car wheels', () => {
    const wheel = makePrefab('p-wheel', 'Wheel', [
      makeEntity('wheel-root', null, 'Wheel', {
        'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        'render.material': { slots: [{ materialId: 'mat-black' }] },
      }),
    ])
    const car = makePrefab('p-car', 'Car', [
      makeEntity('car-root', null, 'Car', { 'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    ], [
      { instanceId: 'wheel-fl', prefabId: 'p-wheel', parentLocalId: 'car-root', overrides: {} },
      { instanceId: 'wheel-fr', prefabId: 'p-wheel', parentLocalId: 'car-root', overrides: {} },
    ])

    const world = createWorld()
    const context = new Map<string, PrefabDefinition>([['p-wheel', wheel], ['p-car', car]])
    const result = instantiatePrefabDetailed(world, car, { prefabContext: context })

    // Find all wheels (entities with InstanceMember referencing p-wheel)
    const wheels = world.query(PrefabInstance).filter(e => e.get(PrefabInstance)!.prefabId === 'p-wheel')
    expect(wheels.length).toBe(2) // both wheels from the nested instances

    // All wheels have the original material
    for (const w of wheels) {
      expect(w.get(MaterialReference)?.slots[0]?.materialId).toBe('mat-black')
    }

    // Edit Wheel prefab: change material
    const updatedWheel = {
      ...wheel,
      entities: wheel.entities.map(e =>
        e.localId === 'wheel-root'
          ? { ...e, components: { ...e.components, 'render.material': { slots: [{ materialId: 'mat-red' }] } } }
          : e
      ),
    }

    // Re-instantiate with updated wheel
    for (const e of result.allEntities) if (e.isAlive()) e.destroy()
    const context2 = new Map<string, PrefabDefinition>([['p-wheel', updatedWheel], ['p-car', car]])
    instantiatePrefabDetailed(world, car, { prefabContext: context2 })
    const wheels2 = world.query(PrefabInstance).filter(e => e.get(PrefabInstance)!.prefabId === 'p-wheel')
    expect(wheels2.length).toBe(2)
    for (const w of wheels2) {
      expect(w.get(MaterialReference)?.slots[0]?.materialId).toBe('mat-red')
    }
  })

  it('override on FL wheel survives Wheel prefab edit', () => {
    const wheel = makePrefab('p-wheel', 'Wheel', [
      makeEntity('wheel-root', null, 'Wheel', {
        'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        'render.material': { slots: [{ materialId: 'mat-black' }] },
      }),
    ])
    // Car has FL wheel with material override
    const car = makePrefab('p-car', 'Car', [
      makeEntity('car-root', null, 'Car', { 'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    ], [
      { instanceId: 'wheel-fl', prefabId: 'p-wheel', parentLocalId: 'car-root',
        overrides: { 'wheel-root': { 'render.material': { slots: [{ materialId: 'mat-gold' }] } } } },
      { instanceId: 'wheel-fr', prefabId: 'p-wheel', parentLocalId: 'car-root', overrides: {} },
    ])

    // Instantiate with updated wheel (mat-red)
    const updatedWheel = {
      ...wheel,
      entities: wheel.entities.map(e =>
        e.localId === 'wheel-root'
          ? { ...e, components: { ...e.components, 'render.material': { slots: [{ materialId: 'mat-red' }] } } }
          : e
      ),
    }

    const world = createWorld()
    const context = new Map<string, PrefabDefinition>([['p-wheel', updatedWheel], ['p-car', car]])
    instantiatePrefabDetailed(world, car, { prefabContext: context })

    const wheels = world.query(PrefabInstance).filter(e => e.get(PrefabInstance)!.prefabId === 'p-wheel')
    expect(wheels.length).toBe(2)

    const flWheel = wheels.find(w => w.get(PrefabInstance)!.instanceId.includes('wheel-fl'))
    const frWheel = wheels.find(w => w.get(PrefabInstance)!.instanceId.includes('wheel-fr'))

    // FL has override (gold), FR inherits updated (red)
    expect(flWheel?.get(MaterialReference)?.slots[0]?.materialId).toBe('mat-gold')
    expect(frWheel?.get(MaterialReference)?.slots[0]?.materialId).toBe('mat-red')
  })
})

describe('cycle protection', () => {
  it('prevents direct self-nesting', () => {
    const prefab = makePrefab('p-a', 'A', [makeEntity('root', null, 'A', {})])
    const allPrefabs = new Map([['p-a', prefab]])
    const result = validateNesting('p-a', 'p-a', allPrefabs)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('itself')
  })

  it('prevents A→B→A cycle', () => {
    const a = makePrefab('p-a', 'A', [makeEntity('root', null, 'A', {})],
      [{ instanceId: 'b', prefabId: 'p-b', parentLocalId: null, overrides: {} }])
    const b = makePrefab('p-b', 'B', [makeEntity('root', null, 'B', {})])

    const allPrefabs = new Map([['p-a', a], ['p-b', b]])
    // Try to nest A inside B (would create A→B→A)
    const result = validateNesting('p-b', 'p-a', allPrefabs)
    expect(result.ok).toBe(false)
    expect(result.error).toBeTruthy()
  })

  it('detectPrefabCycle returns descriptive error', () => {
    const a = makePrefab('p-a', 'A', [makeEntity('root', null, 'A', {})],
      [{ instanceId: 'b1', prefabId: 'p-b', parentLocalId: null, overrides: {} }])
    const b = makePrefab('p-b', 'B', [makeEntity('root', null, 'B', {})],
      [{ instanceId: 'a1', prefabId: 'p-a', parentLocalId: null, overrides: {} }])
    const ctx = { prefabs: new Map([['p-a', a], ['p-b', b]]) }
    const error = detectPrefabCycle('p-a', ctx)
    expect(error?.toLowerCase()).toContain('circular')
  })
})

describe('prefab save/reload stability', () => {
  it('nested prefab data survives JSON round-trip without flattening', () => {
    const wheel = makePrefab('p-wheel', 'Wheel', [
      makeEntity('wheel-root', null, 'Wheel', { 'render.material': { slots: [{ materialId: 'mat-black' }] } }),
    ])
    const car = makePrefab('p-car', 'Car', [
      makeEntity('car-root', null, 'Car', { 'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } }),
    ], [
      { instanceId: 'fl', prefabId: 'p-wheel', parentLocalId: 'car-root', overrides: {} },
      { instanceId: 'fr', prefabId: 'p-wheel', parentLocalId: 'car-root', overrides: {} },
    ])

    const roundTripped = JSON.parse(JSON.stringify({ wheel, car }))
    expect(roundTripped.car.nestedInstances.length).toBe(2)
    expect(roundTripped.car.nestedInstances[0].prefabId).toBe('p-wheel')
    expect(roundTripped.car.entities.length).toBe(1) // NOT flattened
    expect(roundTripped.wheel.entities[0].localId).toBe('wheel-root')
  })
})
