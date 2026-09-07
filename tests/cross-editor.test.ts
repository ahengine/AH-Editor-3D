import { describe, expect, it } from 'vitest'
import { Animator, EntityMeta } from '@ahengine/ecs-runtime'
import {
  collectProblems,
  docForWorkspace,
  editComponentField,
  openAsset,
  redo,
  runCommand,
  SetDocumentListCommand,
  undo,
  useEditorStore,
} from '@ahengine/editor-core'

/* Phase 12: unified problems validation, typed navigation, per-document
 * undo stacks and dirty tracking. */

function spawnProbe(name: string): string {
  const world = useEditorStore.getState().world
  const entity = world.spawn([EntityMeta, { uuid: crypto.randomUUID(), name, enabled: true }])
  const uuid = entity.get(EntityMeta)!.uuid
  return uuid
}

describe('problems panel validation', () => {
  it('flags an entity referencing a deleted animator controller', () => {
    const store = useEditorStore.getState()
    const uuid = spawnProbe('Probe Entity')
    const entity = store.world.query(EntityMeta).find((e) => e.get(EntityMeta)!.uuid === uuid)!
    entity.add([Animator, { controllerId: 'ac-missing', playing: true, speed: 1, initialState: '' } as never])

    const problems = collectProblems()
    const broken = problems.find((p) => p.message.includes('ac-missing'))
    expect(broken).toBeDefined()
    expect(broken!.severity).toBe('error')
    expect(broken!.doc).toBe('scene')
    expect(broken!.target?.kind).toBe('entity')
    expect(broken!.target?.id).toBe(uuid)
  })

  it('stays clean when every reference resolves', () => {
    useEditorStore.getState().setControllers([
      {
        format: 'koota-3d-animator',
        schemaVersion: 1,
        id: 'ac-ok',
        name: 'OK Controller',
        parameters: [],
        states: [{ id: 's1', name: 'Idle', clipId: null, speed: 1, loop: true, position: [0, 0] }],
        transitions: [],
        entryStateId: 's1',
      },
    ])
    const uuid = spawnProbe('Fine Entity')
    editComponentField(uuid, 'animation.animator', { controllerId: 'ac-ok' })

    const problems = collectProblems().filter((p) => p.target?.id === uuid)
    expect(problems).toHaveLength(0)
  })
})

describe('typed navigation', () => {
  it('openAsset routes a controller deep link into the animation workspace', () => {
    useEditorStore.getState().setControllers([
      {
        format: 'koota-3d-animator',
        schemaVersion: 1,
        id: 'ac-nav',
        name: 'Nav Controller',
        parameters: [],
        states: [{ id: 's1', name: 'Idle', clipId: null, speed: 1, loop: true, position: [0, 0] }],
        transitions: [],
        entryStateId: 's1',
      },
    ])
    useEditorStore.getState().setWorkspace('scene')
    openAsset({ kind: 'controller', id: 'ac-nav' })
    const after = useEditorStore.getState()
    expect(after.workspace).toBe('animation')
    expect(after.editingControllerId).toBe('ac-nav')
    expect(after.bottomTab.animation).toBe('animator')
    expect(after.selectionFocus).toEqual({ kind: 'controller', id: 'ac-nav' })
    expect(after.returnWorkspace).toBe('scene')
  })
})

describe('per-document undo + dirty state', () => {
  it('keeps controller edits on the animation stack only', () => {
    const store = useEditorStore.getState()
    store.setWorkspace('animation')
    const before = store.controllers
    const next = [
      ...before,
      {
        format: 'koota-3d-animator',
        schemaVersion: 1,
        id: 'ac-undo-me',
        name: 'Undo Me',
        parameters: [],
        states: [{ id: 's1', name: 'Idle', clipId: null, speed: 1, loop: true, position: [0, 0] }],
        transitions: [],
        entryStateId: 's1',
      },
    ]
    runCommand(new SetDocumentListCommand('Create Undo Me', 'animation', 'controllers', before, next))
    expect(useEditorStore.getState().controllers.some((c) => c.id === 'ac-undo-me')).toBe(true)
    expect(useEditorStore.getState().dirtyDocs.animation).toBe(true)

    // Scene-doc undo must not touch the animation history.
    useEditorStore.getState().setWorkspace('scene')
    undo()
    expect(useEditorStore.getState().controllers.some((c) => c.id === 'ac-undo-me')).toBe(true)

    // Animation-doc undo removes it; redo restores it.
    useEditorStore.getState().setWorkspace('animation')
    undo()
    expect(useEditorStore.getState().controllers.some((c) => c.id === 'ac-undo-me')).toBe(false)
    redo()
    expect(useEditorStore.getState().controllers.some((c) => c.id === 'ac-undo-me')).toBe(true)

    expect(docForWorkspace('scene')).toBe('scene')
    expect(docForWorkspace('animation')).toBe('animation')
  })
})
