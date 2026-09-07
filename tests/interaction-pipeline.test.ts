import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  EntityMeta,
  PrimitiveMesh,
  ThreeObject,
  Transform,
  applyPatch,
  deserializeScene,
  findEntityByUuid,
  serializeSceneEntities,
} from '@ahengine/ecs-runtime'
import { gizmoDragTargets } from '@ahengine/ecs-runtime/react'
import { AddEntitiesCommand, redo, runCommand, undo, useEditorStore } from '@ahengine/editor-core'

/* Scene-editor interaction pipeline invariants (blocking-bug regression suite).

The browser run proved: create → select → move-commit → save → reload →
reselect re-resolves the SAME uuid with ECS↔Three in sync. These tests lock
the underlying invariants that made it work — and the two bugs this pass
fixed (zero-default scale on created entities; live-reference redo values).
*/

function spawnCube(): string {
  const world = useEditorStore.getState().world
  const uuid = crypto.randomUUID()
  deserializeScene(world, [
    {
      id: uuid,
      name: 'Cube',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        'render.mesh': { shape: 'box', size: 1 },
      },
    },
  ])
  return uuid
}

describe('created entities get usable defaults (pickable, visible)', () => {
  it('deserialize of an EMPTY transform yields unit scale, not zero', () => {
    // createPrimitive/createLight/createCamera all pass 'core.transform': {}
    // through serializedFromSpec — a zero scale there produced invisible,
    // unpickable objects (the reported "cannot find/select new object").
    const world = useEditorStore.getState().world
    const uuid = crypto.randomUUID()
    deserializeScene(world, [
      {
        id: uuid,
        name: 'Defaulted',
        enabled: true,
        parentId: null,
        components: { 'core.transform': {} },
      },
    ])
    const transform = findEntityByUuid(world, uuid)!.get(Transform)!
    expect(transform.scale).toEqual({ x: 1, y: 1, z: 1 })
    expect(transform.position).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('partial transforms keep defaults for missing fields', () => {
    const world = useEditorStore.getState().world
    const uuid = crypto.randomUUID()
    deserializeScene(world, [
      {
        id: uuid,
        name: 'Light',
        enabled: true,
        parentId: null,
        components: { 'core.transform': { position: [4, 6, 3] } },
      },
    ])
    const transform = findEntityByUuid(world, uuid)!.get(Transform)!
    expect(transform.position).toEqual({ x: 4, y: 6, z: 3 })
    expect(transform.scale).toEqual({ x: 1, y: 1, z: 1 })
  })
})

describe('transform session semantics (gizmo commit path)', () => {
  it('successive drags undo/redo to EXACT snapshots — no live-reference corruption', () => {
    const world = useEditorStore.getState().world
    const uuid = spawnCube()
    const entity = findEntityByUuid(world, uuid)!
    const object = new THREE.Group()
    object.userData.entityUuid = uuid
    entity.add([ThreeObject, { object }])

    // Mirrors the fixed dragging-changed listener in the EditorRig:
    // before/after are CLONED snapshots; commits serialize immediately.
    const serialize = (p: THREE.Vector3, r: THREE.Euler, s: THREE.Vector3) => ({
      position: [p.x, p.y, p.z] as [number, number, number],
      rotation: [
        THREE.MathUtils.radToDeg(r.x),
        THREE.MathUtils.radToDeg(r.y),
        THREE.MathUtils.radToDeg(r.z),
      ] as [number, number, number],
      scale: [s.x, s.y, s.z] as [number, number, number],
    })

    const session = (mutate: (o: THREE.Group) => void) => {
      const before = {
        position: object.position.clone(),
        rotation: object.rotation.clone(),
        scale: object.scale.clone(),
      }
      gizmoDragTargets.add(uuid) // ECS→object writes suspended during drag
      mutate(object)
      const after = {
        position: object.position.clone(),
        rotation: object.rotation.clone(),
        scale: object.scale.clone(),
      }
      gizmoDragTargets.delete(uuid)
      runCommand({
        label: 'Transform',
        doc: 'scene',
        execute: () => applyPatch(entity, 'core.transform', serialize(after.position, after.rotation, after.scale)),
        undo: () => applyPatch(entity, 'core.transform', serialize(before.position, before.rotation, before.scale)),
      })
    }

    session((o) => o.position.set(2, 1, -3))
    session((o) => o.position.set(5, 2, 1))
    session((o) => o.rotation.set(THREE.MathUtils.degToRad(120), 0, 0))
    expect(entity.get(Transform)!.position).toEqual({ x: 5, y: 2, z: 1 })
    expect(entity.get(Transform)!.rotation.x).toBeCloseTo(120, 5)

    // Undo ×3 — each session's BEFORE restored exactly (this is where the
    // live-reference bug corrupted values: redo re-read the mutated object).
    undo()
    expect(entity.get(Transform)!.rotation.x).toBeCloseTo(0, 5)
    expect(entity.get(Transform)!.position).toEqual({ x: 5, y: 2, z: 1 })
    undo()
    expect(entity.get(Transform)!.position).toEqual({ x: 2, y: 1, z: -3 })
    undo()
    expect(entity.get(Transform)!.position).toEqual({ x: 0, y: 0, z: 0 })

    // Redo ×3 — exact AFTER snapshots, in order.
    redo()
    expect(entity.get(Transform)!.position).toEqual({ x: 2, y: 1, z: -3 })
    redo()
    expect(entity.get(Transform)!.position).toEqual({ x: 5, y: 2, z: 1 })
    redo()
    expect(entity.get(Transform)!.rotation.x).toBeCloseTo(120, 5)
    expect(entity.get(Transform)!.position).toEqual({ x: 5, y: 2, z: 1 })
  })
})

describe('save / reload / re-transform loop', () => {
  it('entity uuid + transforms survive serialize→deserialize; reselect works', () => {
    const store = useEditorStore.getState()
    const uuid = spawnCube()
    const entity = findEntityByUuid(store.world, uuid)!
    applyPatch(entity, 'core.transform', {
      position: [2, 1, -3],
      rotation: [45, 90, 120],
      scale: [2, 2, 2],
    })

    // "Save" — serialization must be side-effect free.
    const saved = serializeSceneEntities(store.world)
    const row = saved.find((r) => r.id === uuid)
    expect(row).toBeDefined()
    expect(row!.components['core.transform']).toEqual({
      position: [2, 1, -3],
      rotation: [45, 90, 120],
      scale: [2, 2, 2],
    })
    // The live entity was not remounted or mutated by serializing.
    expect(entity.isAlive()).toBe(true)

    // "Reload" — deserialize into the same world (resetWorld + respawn).
    for (const e of [...store.world.query(EntityMeta)]) if (e.isAlive()) e.destroy()
    deserializeScene(store.world, saved)
    const reloaded = findEntityByUuid(store.world, uuid)!
    expect(reloaded).toBeDefined()
    expect(reloaded.get(Transform)!.position).toEqual({ x: 2, y: 1, z: -3 })
    expect(reloaded.get(Transform)!.rotation).toEqual({ x: 45, y: 90, z: 120 })
    expect(reloaded.get(Transform)!.scale).toEqual({ x: 2, y: 2, z: 2 })

    // "Retransform after reload" — the reselected entity still accepts edits.
    applyPatch(reloaded, 'core.transform', { position: [9, 9, 9] })
    expect(reloaded.get(Transform)!.position).toEqual({ x: 9, y: 9, z: 9 })
  })
})

describe('selection identity', () => {
  it('selection stores entity UUIDs; single select focuses the entity', () => {
    const store = useEditorStore.getState()
    const uuid = spawnCube()
    store.select([uuid])
    expect(useEditorStore.getState().selection).toEqual([uuid])
    expect(useEditorStore.getState().selectionFocus).toEqual({ kind: 'entity', id: uuid })
    store.select([])
    expect(useEditorStore.getState().selection).toEqual([])
  })

  it('AddEntitiesCommand selects the created root by uuid', () => {
    const uuid = crypto.randomUUID()
    runCommand(
      new AddEntitiesCommand('Add probe', [
        {
          id: uuid,
          name: 'Probe',
          enabled: true,
          parentId: null,
          components: { 'core.transform': { position: [1, 2, 3] } },
        },
      ])
    )
    const world = useEditorStore.getState().world
    expect(useEditorStore.getState().selection[0]).toBe(uuid)
    expect(findEntityByUuid(world, uuid)?.get(Transform)!.position).toEqual({ x: 1, y: 2, z: 3 })
  })
})
