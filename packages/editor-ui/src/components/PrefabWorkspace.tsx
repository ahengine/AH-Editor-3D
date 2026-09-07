import { useMemo, useState } from 'react'
import { ChevronRight, Package, PackageOpen, ArrowLeft } from 'lucide-react'
import type { PrefabDefinition } from '@ahengine/project-schema'
import { EntityMeta, PrefabInstance } from '@ahengine/ecs-runtime'
import { openAsset, useEditorStore, instantiatePrefabAction } from '@ahengine/editor-core'

/**
 * Prefab Workspace — breadcrumb navigation, prefab list, isolated edit context.
 * Left: prefab list. Center: structure overview. Right: shared inspector.
 * Top: breadcrumb (Assets / Prefabs / Car / Wheel for nested).
 */

export function PrefabWorkspace() {
  const prefabs = useEditorStore((s) => s.prefabs)
  const activePrefabId = useEditorStore((s) => s.activePrefabId)
  const setActivePrefabId = useEditorStore((s) => s.setActivePrefabId)
  const [breadcrumb, setBreadcrumb] = useState<string[]>([])

  const editingPrefab = prefabs.find((p) => p.id === activePrefabId)

  return (
    <div className="ah-prefab-workspace">
      {/* Left: prefab list or prefab hierarchy (when editing) */}
      {editingPrefab ? (
        <div className="ah-panel" style={{ width: 240, flex: 'none' }}>
          <div className="ah-panel-head">
            <button
              className="ah-icon-btn small"
              title="Back to prefab list"
              onClick={() => {
                setActivePrefabId(null)
                setBreadcrumb([])
              }}
            >
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
                <div
                  key={nested.instanceId}
                  className="ah-list-row"
                  style={{ cursor: 'pointer' }}
                  onClick={() => {
                    const np = prefabs.find((p) => p.id === nested.prefabId)
                    if (np) {
                      setActivePrefabId(np.id)
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
                onClick={() => {
                  setActivePrefabId(prefab.id)
                  setBreadcrumb([])
                }}
                onDoubleClick={() => instantiatePrefabAction(prefab.id)}
                title={`${prefab.name} — click to open, double-click to instantiate, drag to viewport`}
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

      {/* Center: breadcrumb + structure overview */}
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'auto' }}>
          {editingPrefab ? (
            <PrefabStructurePanel prefab={editingPrefab} />
          ) : (
            <div className="ah-empty" style={{ flex: 1 }}>
              <Package size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div>Select a prefab to open</div>
              <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-tertiary)', marginTop: 4 }}>
                or create one from a Scene entity (right-click → Create Prefab)
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Prefab structure overview — real data only: per-entity components, nested
 * instances, and where the scene instantiates this prefab.
 */
export function PrefabStructurePanel({ prefab }: { prefab: PrefabDefinition }) {
  const world = useEditorStore((s) => s.world)
  const worldVersion = useEditorStore((s) => s.worldVersion)

  const usages = useMemo(() => {
    void worldVersion
    const rows: { uuid: string; name: string }[] = []
    for (const entity of world.query(PrefabInstance)) {
      if (entity.get(PrefabInstance)?.prefabId === prefab.id) {
        rows.push({ uuid: entity.get(EntityMeta)?.uuid ?? '', name: entity.get(EntityMeta)?.name ?? 'Instance' })
      }
    }
    return rows
  }, [world, worldVersion, prefab.id])

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Entities + components */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: 'var(--sp-3)' }}>
        <div className="ah-table-head">Entities ({prefab.entities.length})</div>
        <table className="ah-table">
          <thead>
            <tr>
              <th style={{ width: 90 }}>Local ID</th>
              <th>Name</th>
              <th style={{ width: 110 }}>Parent</th>
              <th>Components</th>
            </tr>
          </thead>
          <tbody>
            {prefab.entities.map((entity) => (
              <tr key={entity.localId}>
                <td className="mono">{entity.localId}</td>
                <td>{entity.name}</td>
                <td className="mono">{entity.parentLocalId ?? '— root'}</td>
                <td className="dim">{Object.keys(entity.components ?? {}).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Scene usage + nesting */}
      <div style={{ width: 280, flex: 'none', borderLeft: '1px solid var(--border-subtle)', padding: 'var(--sp-3)', overflow: 'auto' }}>
        <div className="ah-table-head">Scene instances</div>
        {usages.length === 0 && (
          <div style={{ fontSize: 'var(--fs-secondary)', color: 'var(--text-tertiary)', padding: '6px 0' }}>
            Not instantiated in the scene — drag the prefab into the viewport to place one.
          </div>
        )}
        {usages.map((usage) => (
          <button
            key={usage.uuid}
            className="ah-list-row"
            onClick={() => openAsset({ kind: 'entity', id: usage.uuid }, { from: false })}
            title="Select in Scene"
          >
            <span className="ah-list-icon"><PackageOpen size={13} /></span>
            <span className="ah-list-name">{usage.name}</span>
            <span className="ah-list-meta">select</span>
          </button>
        ))}

        <div className="ah-table-head" style={{ marginTop: 12 }}>Nested prefabs</div>
        {(prefab.nestedInstances?.length ?? 0) === 0 && (
          <div style={{ fontSize: 'var(--fs-secondary)', color: 'var(--text-tertiary)', padding: '6px 0' }}>
            No nested instances. Nest by dragging a prefab into prefab edit mode.
          </div>
        )}
        {(prefab.nestedInstances ?? []).map((nested) => (
          <button
            key={nested.instanceId}
            className="ah-list-row"
            onClick={() => openAsset({ kind: 'prefab', id: nested.prefabId }, { from: false })}
            title="Open nested prefab"
          >
            <span className="ah-list-icon"><Package size={13} /></span>
            <span className="ah-list-name">{nested.name ?? nested.prefabId}</span>
          </button>
        ))}
      </div>
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
