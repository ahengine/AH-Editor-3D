import { useState, useMemo } from 'react'
import { ChevronRight, Package, PackageOpen, ArrowLeft } from 'lucide-react'
import type { PrefabDefinition } from '@ahengine/project-schema'
import { useEditorStore, createPrefabFromSelection, instantiatePrefabAction } from '@ahengine/editor-core'
import { HierarchyPanel } from './HierarchyPanel.js'
import { Inspector } from './Inspector.js'
import { IncompletePanelShell } from './WorkspacePanels.js'

/**
 * Prefab Workspace — breadcrumb navigation, prefab list, isolated edit context.
 * Left: prefab list. Center: viewport (isolated prefab). Right: inspector.
 * Top: breadcrumb (Assets / Prefabs / Car / Wheel for nested).
 */

export function PrefabWorkspace() {
  const prefabs = useEditorStore((s) => s.prefabs)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [breadcrumb, setBreadcrumb] = useState<string[]>([])

  const editingPrefab = prefabs.find((p) => p.id === editingId)

  return (
    <div className="ah-prefab-workspace">
      {/* Left: prefab list or prefab hierarchy (when editing) */}
      {editingPrefab ? (
        <div className="ah-panel" style={{ width: 240, flex: 'none' }}>
          <div className="ah-panel-head">
            <button className="ah-icon-btn small" title="Back to prefab list" onClick={() => { setEditingId(null); setBreadcrumb([]) }}>
              <ArrowLeft size={13} />
            </button>
            <span className="ah-panel-title">{editingPrefab.name}</span>
          </div>
          <PrefabHierarchyView prefab={editingPrefab} />
          {/* Nested instances */}
          {(editingPrefab.nestedInstances?.length ?? 0) > 0 && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 'var(--sp-2)' }}>
              <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>
                NESTED INSTANCES
              </div>
              {editingPrefab.nestedInstances.map((nested) => (
                <div key={nested.instanceId} className="ah-list-row" style={{ cursor: 'pointer' }}
                  onClick={() => {
                    const np = prefabs.find((p) => p.id === nested.prefabId)
                    if (np) {
                      setEditingId(np.id)
                      setBreadcrumb((prev) => [...prev, editingPrefab.name, nested.name ?? np.name])
                    }
                  }}
                >
                  <span className="ah-list-icon"><PackageOpen size={13} /></span>
                  <span className="ah-list-name">{nested.name ?? nested.prefabId}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="ah-panel" style={{ width: 240, flex: 'none' }}>
          <div className="ah-panel-head">
            <span className="ah-panel-title">Prefabs</span>
            <span className="ah-list-count">{prefabs.length}</span>
          </div>
          <div className="ah-panel-body">
            {prefabs.length === 0 && (
              <div className="ah-empty">
                No prefabs.
                <div style={{ fontSize: 'var(--fs-meta)', marginTop: 4, color: 'var(--text-tertiary)' }}>
                  Select an entity → right-click → Create Prefab
                </div>
              </div>
            )}
            {prefabs.map((prefab) => (
              <div
                key={prefab.id}
                className="ah-list-row"
                draggable
                onDragStart={(event) => event.dataTransfer.setData('ah/prefab', prefab.id)}
                onClick={() => { setEditingId(prefab.id); setBreadcrumb([]) }}
                onDoubleClick={() => instantiatePrefabAction(prefab.id)}
                title={`${prefab.name} — click to edit, double-click to instantiate, drag to viewport`}
              >
                <span className="ah-list-icon"><Package size={14} /></span>
                <span className="ah-list-name">{prefab.name}</span>
                {(prefab.nestedInstances?.length ?? 0) > 0 && (
                  <span className="ah-list-meta">{prefab.nestedInstances.length} nested</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Center: breadcrumb + viewport area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {editingPrefab && (
          <div className="ah-breadcrumb">
            <span>Assets</span>
            <ChevronRight size={11} />
            <span>Prefabs</span>
            {breadcrumb.map((crumb, i) => (
              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <ChevronRight size={11} />
                <span>{crumb}</span>
              </span>
            ))}
            <ChevronRight size={11} />
            <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{editingPrefab.name}</span>
          </div>
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {editingPrefab ? (
            <IncompletePanelShell
              domain="Prefab isolated editing viewport"
              hint={`Editing "${editingPrefab.name}" — the isolated 3D viewport for prefab edit mode renders in the next iteration. The prefab data model, nested instances, and override system are fully functional. Drag the prefab into a Scene to see it rendered.`}
            />
          ) : (
            <div className="ah-empty" style={{ flex: 1 }}>
              <Package size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div>Select a prefab to edit</div>
              <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                or create one from a Scene entity (right-click → Create Prefab)
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: inspector stays shared */}
    </div>
  )
}

function PrefabHierarchyView({ prefab }: { prefab: PrefabDefinition }) {
  const byLocal = useMemo(() => new Map(prefab.entities.map((e) => [e.localId, e])), [prefab])
  const [expanded, setExpanded] = useState<Set<string>>(new Set(prefab.entities.map((e) => e.localId)))

  const renderEntity = (entity: (typeof prefab.entities)[0], depth: number): React.ReactNode => {
    const children = prefab.entities.filter((e) => e.parentLocalId === entity.localId)
    const isExpanded = expanded.has(entity.localId)
    return (
      <div key={entity.localId}>
        <div
          className="ah-tree-row"
          style={{ paddingLeft: 6 + depth * 17 }}
        >
          {children.length > 0 ? (
            <span
              className="ah-tree-caret"
              onClick={() =>
                setExpanded((prev) => {
                  const next = new Set(prev)
                  if (next.has(entity.localId)) next.delete(entity.localId)
                  else next.add(entity.localId)
                  return next
                })
              }
            >
              {isExpanded ? <ChevronRight size={13} style={{ transform: 'rotate(90deg)' }} /> : <ChevronRight size={13} />}
            </span>
          ) : (
            <span style={{ width: 16, flex: 'none' }} />
          )}
          <span className="ah-tree-icon" style={{ color: entity.localId === prefab.rootLocalEntityId ? 'var(--accent)' : 'var(--text-tertiary)' }}>
            <Package size={13} />
          </span>
          <span className="ah-tree-name">{entity.name}</span>
        </div>
        {isExpanded && children.map((child) => renderEntity(child, depth + 1))}
      </div>
    )
  }

  const root = byLocal.get(prefab.rootLocalEntityId)
  return <div className="ah-tree">{root ? renderEntity(root, 0) : null}</div>
}
