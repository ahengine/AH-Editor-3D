import { ChevronRight, Package, PackageOpen, Plus, Trash2, Workflow } from 'lucide-react'
import type { PrefabDefinition, PrefabEntity } from '@ahengine/project-schema'
import { canNestPrefab } from '@ahengine/project-schema'
import {
  runCommand,
  SetDocumentListCommand,
  useEditorStore,
} from '@ahengine/editor-core'

/**
 * Prefab Workspace — Godot-style node editing.
 * Left: prefab list. When a prefab is open: its node tree with per-node
 * add/delete, plus "Add Nested Prefab" to compose other project prefabs
 * as children (cycle-protected). All edits are undoable
 * (SetDocumentListCommand on the prefabs document).
 */

let prefabNodeSeq = 0
const nextLocalId = () => `n${Date.now().toString(36)}${(prefabNodeSeq++).toString(36)}`

export function PrefabWorkspace() {
  const prefabs = useEditorStore((s) => s.prefabs)
  const activePrefabId = useEditorStore((s) => s.activePrefabId)
  const setActivePrefabId = useEditorStore((s) => s.setActivePrefabId)
  const store = useEditorStore.getState

  const prefab = prefabs.find((p) => p.id === activePrefabId) ?? null

  const updatePrefab = (next: PrefabDefinition, label: string) => {
    runCommand(
      new SetDocumentListCommand(
        label,
        'prefab',
        'prefabs',
        store().prefabs,
        store().prefabs.map((p) => (p.id === next.id ? next : p))
      )
    )
  }

  const createPrefab = () => {
    const id = `pfx-${crypto.randomUUID().slice(0, 8)}`
    const rootLocalId = nextLocalId()
    const def: PrefabDefinition = {
      format: 'koota-3d-prefab',
      schemaVersion: 1,
      id,
      name: `Prefab ${store().prefabs.length + 1}`,
      rootLocalEntityId: rootLocalId,
      entities: [
        {
          localId: rootLocalId,
          parentLocalId: null,
          name: 'Root',
          enabled: true,
          components: { 'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
        },
      ],
      nestedInstances: [],
    }
    runCommand(
      new SetDocumentListCommand('Create prefab', 'prefab', 'prefabs', store().prefabs, [
        ...store().prefabs,
        def,
      ])
    )
    setActivePrefabId(id)
  }

  const addChildNode = (parentLocalId: string) => {
    if (!prefab) return
    const localId = nextLocalId()
    const node: PrefabEntity = {
      localId,
      parentLocalId,
      name: `Node ${prefab.entities.length + 1}`,
      enabled: true,
      components: { 'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
    }
    updatePrefab(
      { ...prefab, entities: [...prefab.entities, node] },
      `Add node to ${prefab.name}`
    )
  }

  const deleteNode = (localId: string) => {
    if (!prefab || localId === prefab.rootLocalEntityId) return
    const doomed = new Set<string>([localId])
    let grew = true
    while (grew) {
      grew = false
      for (const e of prefab.entities) {
        if (e.parentLocalId && doomed.has(e.parentLocalId) && !doomed.has(e.localId)) {
          doomed.add(e.localId)
          grew = true
        }
      }
    }
    updatePrefab(
      {
        ...prefab,
        entities: prefab.entities.filter((e) => !doomed.has(e.localId)),
        nestedInstances: (prefab.nestedInstances ?? []).filter(
          (n) => !doomed.has(n.parentLocalId ?? prefab.rootLocalEntityId)
        ),
      },
      `Delete node from ${prefab.name}`
    )
  }

  const addNestedPrefab = (childPrefabId: string, parentLocalId: string) => {
    if (!prefab) return
    const cycle = canNestPrefab(prefab.id, childPrefabId, { prefabs: new Map(prefabs.map((p) => [p.id, p])) })
    if (!cycle.ok) {
      store().notify('error', cycle.error ?? 'Cannot nest: cycle detected')
      return
    }
    const child = prefabs.find((p) => p.id === childPrefabId)
    updatePrefab(
      {
        ...prefab,
        nestedInstances: [
          ...(prefab.nestedInstances ?? []),
          {
            instanceId: `nested-${crypto.randomUUID().slice(0, 6)}`,
            prefabId: childPrefabId,
            parentLocalId,
            name: child?.name ?? childPrefabId,
            overrides: {},
          },
        ],
      },
      `Nest ${child?.name ?? 'prefab'} in ${prefab.name}`
    )
  }

  const removeNested = (instanceId: string) => {
    if (!prefab) return
    updatePrefab(
      { ...prefab, nestedInstances: (prefab.nestedInstances ?? []).filter((n) => n.instanceId !== instanceId) },
      `Remove nested prefab from ${prefab.name}`
    )
  }

  const renameNode = (localId: string, name: string) => {
    if (!prefab) return
    updatePrefab(
      { ...prefab, entities: prefab.entities.map((e) => (e.localId === localId ? { ...e, name } : e)) },
      `Rename node in ${prefab.name}`
    )
  }

  return (
    <div className="ah-panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="ah-panel-head">
        <div className="ah-segment">
          <button className="active">Prefabs</button>
        </div>
        <div style={{ flex: 1 }} />
        <button className="ah-icon-btn" title="New prefab" onClick={createPrefab}>
          <Plus size={13} />
        </button>
      </div>
      {!prefab && (
        <div className="ah-search">
          <input placeholder="Search prefabs…" />
        </div>
      )}
      <div className="ah-panel-body" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {!prefab && (
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {prefabs.length === 0 && (
              <div className="ah-empty">
                No prefabs.
                <div style={{ fontSize: 'var(--fs-meta)', marginTop: 4, color: 'var(--text-tertiary)' }}>
                  Create one with + or right-click any entity in the scene
                </div>
              </div>
            )}
            {prefabs.map((p) => (
              <div
                key={p.id}
                className="ah-list-row"
                onClick={() => setActivePrefabId(p.id)}
                title={`${p.name} — click to open`}
              >
                <span className="ah-list-icon"><Package size={14} /></span>
                <span className="ah-list-name">{p.name}</span>
                <span className="ah-list-meta">{p.entities.length} ent</span>
              </div>
            ))}
          </div>
        )}

        {prefab && (
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flex: 1 }}>
            <div className="ah-panel-head" style={{ height: 36, borderBottom: '1px solid var(--border-subtle)' }}>
              <button
                className="ah-icon-btn small"
                title="Back to prefab list"
                onClick={() => setActivePrefabId(null)}
              >
                <ChevronRight size={13} style={{ transform: 'rotate(180deg)' }} />
              </button>
              <span className="ah-panel-title">{prefab.name}</span>
              <div style={{ flex: 1 }} />
              <button className="ah-icon-btn small" title="Add child node to root" onClick={() => addChildNode(prefab.rootLocalEntityId)}>
                <Plus size={13} />
              </button>
              <button
                className="ah-icon-btn small"
                title="Add nested prefab to root"
                onClick={() => {
                  const graph = { prefabs: new Map(prefabs.map((p) => [p.id, p])) }
                  const others = prefabs.filter((p) => p.id !== prefab.id && canNestPrefab(prefab.id, p.id, graph).ok)
                  if (others.length === 0) {
                    store().notify('info', 'No other prefabs available to nest')
                    return
                  }
                  addNestedPrefab(others[0].id, prefab.rootLocalEntityId)
                }}
              >
                <Workflow size={13} />
              </button>
            </div>
            <div className="ah-tree" style={{ overflowY: 'auto', flex: 1 }}>
              <PrefabNodeRow
                prefab={prefab}
                localId={prefab.rootLocalEntityId}
                depth={0}
                onAddChild={addChildNode}
                onDelete={deleteNode}
                onRename={renameNode}
              />
              {(prefab.nestedInstances ?? []).map((nested) => (
                <div
                  key={nested.instanceId}
                  className="ah-tree-row"
                  style={{ paddingLeft: 6 + 17 }}
                  title={`Nested: ${nested.name ?? nested.prefabId}`}
                >
                  <span className="ah-tree-icon"><PackageOpen size={13} /></span>
                  <span className="ah-tree-name" style={{ color: 'var(--accent)' }}>{nested.name ?? nested.prefabId}</span>
                  <span className="ah-tree-actions">
                    <button
                      className="ah-icon-btn small"
                      title="Open this nested prefab"
                      onClick={() => setActivePrefabId(nested.prefabId)}
                    >
                      <ChevronRight size={12} />
                    </button>
                    <button
                      className="ah-icon-btn small"
                      title="Remove nested prefab"
                      onClick={() => removeNested(nested.instanceId)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
            {prefabs.length > 1 && (
              <div style={{ borderTop: '1px solid var(--border-subtle)', padding: '6px 8px', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', width: '100%' }}>
                  NEST AS CHILD OF ROOT:
                </span>
                {prefabs
                  .filter((p) => p.id !== prefab.id && canNestPrefab(prefab.id, p.id, { prefabs: new Map(prefabs.map((q) => [q.id, q])) }).ok)
                  .slice(0, 6)
                  .map((p) => (
                    <button key={p.id} className="ah-chip" onClick={() => addNestedPrefab(p.id, prefab.rootLocalEntityId)}>
                      <PackageOpen size={10} /> {p.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function PrefabNodeRow({
  prefab,
  localId,
  depth,
  onAddChild,
  onDelete,
  onRename,
}: {
  prefab: PrefabDefinition
  localId: string
  depth: number
  onAddChild: (parentLocalId: string) => void
  onDelete: (localId: string) => void
  onRename: (localId: string, name: string) => void
}) {
  const entity = prefab.entities.find((e) => e.localId === localId)
  if (!entity) return null
  const children = prefab.entities.filter((e) => e.parentLocalId === localId)
  const isRoot = localId === prefab.rootLocalEntityId
  return (
    <>
      <div className="ah-tree-row" style={{ paddingLeft: 6 + depth * 17 }}>
        {children.length > 0 ? <span className="ah-tree-caret"><ChevronRight size={13} /></span> : <span style={{ width: 16, flex: 'none' }} />}
        <span className="ah-tree-icon" style={{ color: isRoot ? 'var(--accent)' : 'var(--text-tertiary)' }}>
          <Package size={13} />
        </span>
        <span
          className="ah-tree-name"
          onDoubleClick={() => {
            const name = window.prompt('Node name', entity.name)
            if (name && name.trim()) onRename(localId, name.trim())
          }}
          title="Double-click to rename"
        >
          {entity.name}
        </span>
        <span className="ah-tree-actions">
          <button className="ah-icon-btn small" title="Add child node" onClick={() => onAddChild(localId)}>
            <Plus size={11} />
          </button>
          {!isRoot && (
            <button className="ah-icon-btn small" title="Delete node (and children)" onClick={() => onDelete(localId)}>
              <Trash2 size={11} />
            </button>
          )}
        </span>
      </div>
      {children.map((child) => (
        <PrefabNodeRow
          key={child.localId}
          prefab={prefab}
          localId={child.localId}
          depth={depth + 1}
          onAddChild={onAddChild}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </>
  )
}
