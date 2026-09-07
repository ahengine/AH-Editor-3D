import { useMemo } from 'react'
import { Package, Sparkles, Wand2 } from 'lucide-react'
import type { WorkspaceId } from '@ahengine/editor-core'
import { useEditorStore, instantiatePrefabAction } from '@ahengine/editor-core'

/**
 * Left-sidebar list panels for the non-Scene workspaces.
 * Real data, real actions — no fake buttons. Editing surfaces arrive in
 * their dedicated phases (Prefab/Material/Particle).
 */

export function PrefabListPanel() {
  const prefabs = useEditorStore((s) => s.prefabs)
  return (
    <div className="ah-panel">
      <div className="ah-panel-head">
        <span className="ah-panel-title">Prefabs</span>
        <span className="ah-list-count">{prefabs.length}</span>
      </div>
      <div className="ah-panel-body">
        {prefabs.length === 0 && (
          <div className="ah-empty">
            No prefabs yet.
            <div style={{ fontSize: 'var(--fs-meta)', marginTop: 4, color: 'var(--text-tertiary)' }}>
              Select an entity → right-click → Create Prefab
            </div>
          </div>
        )}
        {prefabs.map((prefab) => (
          <button
            key={prefab.id}
            className="ah-list-row"
            draggable
            onDragStart={(event) => event.dataTransfer.setData('ah/prefab', prefab.id)}
            onDoubleClick={() => instantiatePrefabAction(prefab.id)}
            title={`${prefab.name} — drag into viewport or double-click to instantiate`}
          >
            <span className="ah-list-icon">
              <Package size={14} />
            </span>
            <span className="ah-list-name">{prefab.name}</span>
            <span className="ah-list-meta">{prefab.entities.length} ent</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function MaterialListPanel() {
  const materials = useEditorStore((s) => s.materials)
  const selection = useEditorStore((s) => s.selection)
  const store = useEditorStore.getState
  return (
    <div className="ah-panel">
      <div className="ah-panel-head">
        <span className="ah-panel-title">Materials</span>
        <span className="ah-list-count">{materials.length}</span>
      </div>
      <div className="ah-panel-body">
        {materials.length === 0 && <div className="ah-empty">No materials — create one in Inspector ▸ Library</div>}
        {materials.map((material) => (
          <button
            key={material.id}
            className="ah-list-row"
            draggable
            onDragStart={(event) => event.dataTransfer.setData('ah/material', material.id)}
            onClick={() => store().setEditingMaterial(material.id)}
            title={`${material.name} — click to edit in Inspector ▸ Library`}
          >
            <span className="ah-mat-swatch" style={{ background: material.properties.baseColor ?? '#888' }} />
            <span className="ah-list-name">{material.name}</span>
            <span className="ah-list-meta">{material.type}</span>
          </button>
        ))}
        {selection.length > 0 && materials.length > 0 && (
          <div style={{ padding: 'var(--sp-2)', fontSize: 'var(--fs-meta)', color: 'var(--text-tertiary)' }}>
            Drag onto an entity to assign
          </div>
        )}
      </div>
    </div>
  )
}

export function ParticleListPanel() {
  const effects = useEditorStore((s) => s.particleEffects)
  const totalEntities = useMemo(
    () => useEditorStore.getState().world.query(require_trait()).length,
    []
  )
  void totalEntities
  return (
    <div className="ah-panel">
      <div className="ah-panel-head">
        <span className="ah-panel-title">Particle Effects</span>
        <span className="ah-list-count">{effects.length}</span>
      </div>
      <div className="ah-panel-body">
        {effects.length === 0 && (
          <div className="ah-empty">
            <Sparkles size={18} style={{ marginBottom: 6, opacity: 0.5 }} />
            <div>Particle effect authoring arrives in the Particle phase.</div>
            <div style={{ fontSize: 'var(--fs-meta)', marginTop: 4, color: 'var(--text-tertiary)' }}>
              Emitters reference effects by stable id — the data contract is ready.
            </div>
          </div>
        )}
        {effects.map((effect) => (
          <div key={effect.id} className="ah-list-row" style={{ cursor: 'default' }}>
            <span className="ah-list-icon">
              <Sparkles size={14} />
            </span>
            <span className="ah-list-name">{effect.name}</span>
            <span className="ah-list-meta">{effect.shape}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ParticleEmitter trait import kept local to avoid a top-level import cycle at module init
import { ParticleEmitter } from '@ahengine/ecs-runtime'
function require_trait() {
  return ParticleEmitter
}

/** Clearly-incomplete shell for bottom panels whose phase hasn't started. */
export function IncompletePanelShell({ domain, hint }: { domain: string; hint: string }) {
  return (
    <div className="ah-incomplete">
      <Wand2 size={20} style={{ opacity: 0.4, marginBottom: 8 }} />
      <div style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{domain} panel — not implemented yet</div>
      <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-tertiary)', marginTop: 4, maxWidth: 420 }}>
        {hint}
      </div>
    </div>
  )
}
