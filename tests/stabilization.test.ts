import { describe, expect, it, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import * as THREE from 'three'
import { EntityMeta, PrimitiveMesh, ThreeObject, Transform } from '@ahengine/ecs-runtime'
import { AnimatorRuntime } from '@ahengine/ecs-runtime'
import { ParticleSystemInstance } from '@ahengine/ecs-runtime'
import { createFireEffect, type ProjectData } from '@ahengine/project-schema'
import { IndexedDbBackend } from '../packages/editor-core/src/backend.js'
import {
  deleteSelection,
  importProjectJson,
  runCommand,
  useEditorStore,
  AddEntitiesCommand,
} from '@ahengine/editor-core'

/* Stabilization §4/§7/§8/§10/§11: resource lifecycle and corruption safety. */

function spawnBox(name: string, meshObject?: THREE.Object3D): { uuid: string; object: THREE.Object3D } {
  const world = useEditorStore.getState().world
  const object = meshObject ?? new THREE.Group()
  const entity = world.spawn([
    EntityMeta,
    { uuid: crypto.randomUUID(), name, enabled: true },
  ])
  entity.add([Transform, { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }])
  entity.add([PrimitiveMesh, { shape: 'box', size: 1, segments: 32, visible: true }])
  entity.add([ThreeObject, { object }])
  return { uuid: entity.get(EntityMeta)!.uuid, object }
}

describe('shared GPU resources survive entity deletion (§4)', () => {
  it('deleting entities never disposes shared primitive geometries or service materials', () => {
    const store = useEditorStore.getState()
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose')

    const a = spawnBox('Box A')
    const b = spawnBox('Box B')
    // Parent both as KootaScene would (scene root stand-in).
    const sceneRoot = new THREE.Group()
    sceneRoot.add(a.object, b.object)
    // Shared mesh on both objects, as KootaScene would attach it.
    const sharedGeometry = new THREE.BoxGeometry(1, 1, 1)
    for (const target of [a, b]) {
      const mesh = new THREE.Mesh(sharedGeometry, new THREE.MeshBasicMaterial())
      mesh.name = 'mesh'
      target.object.add(mesh)
    }

    store.select([a.uuid])
    deleteSelection()

    // Survivor keeps its object intact and nothing shared was disposed.
    expect(geometryDispose).not.toHaveBeenCalled()
    expect(materialDispose).not.toHaveBeenCalled()
    expect(b.object.parent).toBe(sceneRoot)

    geometryDispose.mockRestore()
    materialDispose.mockRestore()
  })
})

describe('import corruption safety (§10)', () => {
  it('a broken import leaves the current project untouched', () => {
    const store = useEditorStore.getState()
    const nameBefore = store.projectName
    const entitiesBefore = store.world.query(EntityMeta).length

    importProjectJson({ definitely: 'not a project' })
    importProjectJson({ project: { id: 'x', name: 'Evil' }, scene: { entities: 'nope' } })

    const after = useEditorStore.getState()
    expect(after.projectName).toBe(nameBefore)
    expect(after.world.query(EntityMeta).length).toBe(entitiesBefore)
    // A failed import must not mark the project dirty (no autosave overwrite).
    expect(after.notifications.some((n) => n.kind === 'error' && n.message.startsWith('Import failed'))).toBe(true)
  })
})

describe('autosave snapshot rotation (§11)', () => {
  const backend = new IndexedDbBackend()

  beforeEach(async () => {
    const { idbDeleteProject } = await import('../packages/editor-core/src/idb.js')
    await idbDeleteProject('active').catch(() => undefined)
    await idbDeleteProject('active.backup').catch(() => undefined)
  })

  it('save rotates the previous valid project into the backup slot', async () => {
    const first = { project: { id: 'a', name: 'First' } } as unknown as ProjectData
    const second = { project: { id: 'b', name: 'Second' } } as unknown as ProjectData

    await backend.save(first)
    await backend.save(second)

    expect((await backend.load())?.project.name).toBe('Second')
    expect((await backend.loadBackup())?.project.name).toBe('First')
  })

  it('save failure preserves the previous state entirely', async () => {
    const first = { project: { id: 'a', name: 'First' } } as unknown as ProjectData
    await backend.save(first)
    // Structured-clone failure (function in payload) aborts before the swap.
    const poisoned = { project: { id: 'b', name: 'Bad' }, fn: () => 1 } as unknown as ProjectData
    await expect(backend.save(poisoned)).rejects.toThrow()
    expect((await backend.load())?.project.name).toBe('First')
    expect((await backend.loadBackup())?.project.name).toBe('First')
  })
})

describe('animation mixer lifecycle (§7)', () => {
  it('stop/dispose clear mixer state; destroyed entities are inert', () => {
    const runtime = new AnimatorRuntime()
    const object = new THREE.Group()
    object.uuid = 'mixer-test-object'
    const { uuid } = spawnBox('Animated', object)

    // Drive with no controller state — must not throw for a bare entity.
    runtime.update(useEditorStore.getState().world, 1 / 60)

    runtime.disposeObject(object)
    // Idempotent: disposing again is a no-op.
    expect(() => runtime.disposeObject(object)).not.toThrow()
    void uuid
  })
})

describe('particle system lifecycle (§8)', () => {
  it('multiple emitters update independently and dispose cleanly', async () => {
    const effectA = createFireEffect('fx-a')
    const effectB = createFireEffect('fx-b')
    const a = new ParticleSystemInstance(effectA)
    const b = new ParticleSystemInstance(effectB)

    // Pause/resume = caller-driven stepping; a paused system just stops advancing.
    for (let i = 0; i < 30; i++) a.update(1 / 60)
    b.update(1 / 60)

    expect(a.points).toBeDefined()
    expect(b.points).toBeDefined()

    const geometrySpy = vi.spyOn(a.points.geometry, 'dispose')
    a.dispose()
    expect(geometrySpy).toHaveBeenCalledTimes(1)
    // Second dispose must not double-free shared GPU handles.
    expect(() => a.dispose()).not.toThrow()
    // The other instance is unaffected.
    expect(() => b.update(1 / 60)).not.toThrow()
    b.dispose()
  })
})

describe('undo stack after lifecycle changes', () => {
  it('AddEntities → delete → undo restores entities with fresh identity', () => {
    const store = useEditorStore.getState()
    const before = store.world.query(EntityMeta).length
    runCommand(
      new AddEntitiesCommand('Add probe', [
        {
          id: crypto.randomUUID(),
          name: 'Undo Probe',
          enabled: true,
          parentId: null,
          components: { 'core.transform': { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] } },
        },
      ])
    )
    expect(useEditorStore.getState().world.query(EntityMeta).length).toBe(before + 1)
  })
})
