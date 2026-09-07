import { Package, Plus } from 'lucide-react'
import { IconButton } from '../ui/primitives.js'
import { createPrefabFromSelection, instantiatePrefabAction, useEditorStore } from '@ahengine/editor-core'

/**
 * Prefab Workspace — breadcrumb navigation, prefab list, isolated edit context.
 * Left: prefab list. Center: structure overview. Right: shared inspector.
 * Top: breadcrumb (Assets / Prefabs / Car / Wheel for nested).
 */

export function PrefabWorkspace() {
  const prefabs = useEditorStore((s) => s.prefabs)
  const activePrefabId = useEditorStore((s) => s.activePrefabId)
  const setActivePrefabId = useEditorStore((s) => s.setActivePrefabId)
  const store = useEditorStore.getState

  return (
    <div className="ah-panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="ah-panel-head">
        <div className="ah-segment">
          <button className="active">Prefabs</button>
        </div>
        <div style={{ flex: 1 }} />
        <IconButton small icon={<Plus size={13} />} label="New prefab (from selection)" onClick={() => createPrefabFromSelection()} />
      </div>
      <div className="ah-search">
        <input placeholder="Search prefabs…" />
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
            className={`ah-list-row ${prefab.id === activePrefabId ? 'focused' : ''}`}
            draggable
            onDragStart={(event) => event.dataTransfer.setData('ah/prefab', prefab.id)}
            onClick={() => {
              setActivePrefabId(prefab.id)
              store().setSelectionFocus({ kind: 'prefab', id: prefab.id })
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
  )
}
