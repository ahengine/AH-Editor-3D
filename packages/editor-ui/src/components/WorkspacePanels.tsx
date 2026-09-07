import { Plus, Sparkles } from 'lucide-react'
import { createFireEffect } from '@ahengine/project-schema'
import {
  runCommand,
  SetDocumentListCommand,
  openAsset,
  useEditorStore,
} from '@ahengine/editor-core'
import { IconButton } from '../ui/primitives.js'

/**
 * Left-sidebar list panels for the non-Scene workspaces.
 * Real data, real actions — every row navigates via typed openAsset routing.
 */

export function MaterialListPanel() {
  const materials = useEditorStore((s) => s.materials)
  const selection = useEditorStore((s) => s.selection)
  const store = useEditorStore.getState
  return (
    <div className="ah-panel-body">
      {materials.length === 0 && <div className="ah-empty">No materials — create one in Inspector ▸ Library</div>}
      {materials.map((material) => (
        <button
          key={material.id}
          className="ah-list-row"
          draggable
          onDragStart={(event) => event.dataTransfer.setData('ah/material', material.id)}
          onClick={() => store().setEditingMaterial(material.id)}
          title={`${material.name} — drag onto a selected entity to assign`}
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
  )
}

export function ParticleListPanel() {
  const effects = useEditorStore((s) => s.particleEffects)
  const activeParticleId = useEditorStore((s) => s.activeParticleId)
  const store = useEditorStore.getState

  const createEffect = () => {
    const id = `fx-${crypto.randomUUID().slice(0, 8)}`
    const effect = createFireEffect(id)
    runCommand(
      new SetDocumentListCommand(
        `Create effect ${effect.name}`,
        'particle',
        'particleEffects',
        store().particleEffects,
        [...store().particleEffects, effect]
      )
    )
    openAsset({ kind: 'particleEffect', id }, { from: false })
  }

  return (
    <div className="ah-panel-body">
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '4px 6px' }}>
        <IconButton small icon={<Plus size={13} />} label="New effect" onClick={createEffect} />
      </div>
      {effects.length === 0 && (
        <div className="ah-empty">
          <Sparkles size={18} style={{ marginBottom: 6, opacity: 0.5 }} />
          <div>No particle effects — create one to author it below.</div>
        </div>
      )}
      {effects.map((effect) => (
        <button
          key={effect.id}
          className={`ah-list-row ${effect.id === activeParticleId ? 'active' : ''}`}
          draggable
          onDragStart={(event) => event.dataTransfer.setData('ah/particle', effect.id)}
          onClick={() => openAsset({ kind: 'particleEffect', id: effect.id }, { from: false })}
          title={`${effect.name} — drag into the viewport to place an emitter`}
        >
          <span className="ah-list-icon">
            <Sparkles size={14} />
          </span>
          <span className="ah-list-name">{effect.name}</span>
          <span className="ah-list-meta">{effect.emission?.enabled ? `${effect.emission.rate}/s` : 'off'}</span>
        </button>
      ))}
    </div>
  )
}
