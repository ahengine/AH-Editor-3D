import { useState } from 'react'
import type { Entity } from 'koota'
import { ChevronDown, ChevronRight, Copy, Plus, RotateCcw, Settings2, Trash2, ClipboardPaste } from 'lucide-react'
import {
  EntityMeta,
  componentRegistry,
  findEntityByUuid,
  getComponentDef,
} from '@ahengine/ecs-runtime'
import {
  removeComponentFrom,
  renameEntity,
  setEnabled,
  useEditorStore,
} from '@ahengine/editor-core'
import { FieldEditor } from './FieldEditors.js'
import { AddComponentDialog } from './AddComponentDialog.js'
import { SceneSettingsPanel } from './SceneSettingsPanel.js'
import { useContextMenu } from '../hooks.js'

/**
 * Inspector — renders components from Component Registry metadata. Changes
 * write straight into Koota traits; no duplicated React state.
 */

export function Inspector() {
  const world = useEditorStore((s) => s.world)
  const worldVersion = useEditorStore((s) => s.worldVersion)
  const selection = useEditorStore((s) => s.selection)
  const [adding, setAdding] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const contextMenu = useContextMenu()

  const uuid = selection[0]
  const entity: Entity | undefined = uuid ? findEntityByUuid(world, uuid) : undefined
  const meta = entity?.get(EntityMeta)
  void worldVersion

  if (!entity || !meta) {
    return (
      <div className="ah-panel">
        <div className="ah-panel-header">
          <span className="ah-panel-title">Inspector</span>
        </div>
        <div className="ah-inspector">
          <SceneSettingsPanel />
        </div>
      </div>
    )
  }

  const present = componentRegistry.filter((def) => entity.has(def.trait) && def.addable)

  return (
    <div className="ah-panel">
      <div className="ah-panel-header">
        <span className="ah-panel-title">Inspector</span>
        <div style={{ flex: 1 }} />
        <button className="ah-icon-btn" title="Add Component" onClick={() => setAdding(true)}>
          <Plus size={15} />
        </button>
      </div>

      <div className="ah-inspector">
        <div className="ah-entity-head">
          <input
            className="ah-input"
            style={{ fontSize: 13, fontWeight: 600, padding: '5px 8px' }}
            defaultValue={meta.name}
            key={uuid}
            onInput={(e) => setEntityNameLive(uuid, (e.target as HTMLInputElement).value)}
            onBlur={(e) => renameEntity(uuid, e.target.value.trim() || meta.name)}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label className="ah-check">
              <input
                type="checkbox"
                checked={meta.enabled}
                onChange={(e) => setEnabled(uuid, e.target.checked)}
              />
              Enabled
            </label>
            <span style={{ color: 'var(--text-muted)', fontSize: 10.5, marginLeft: 'auto' }}>{uuid.slice(0, 13)}…</span>
          </div>
        </div>

        {present.map((def) => {
          const record = entity.get(def.trait) as Record<string, unknown>
          const isCollapsed = collapsed.has(def.id)
          return (
            <div className="ah-component" key={def.id}>
              <div
                className="ah-component-header"
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev)
                    if (next.has(def.id)) next.delete(def.id)
                    else next.add(def.id)
                    return next
                  })
                }
                onContextMenu={(event) =>
                  contextMenu.open(event, [
                    {
                      label: 'Reset to Default',
                      icon: <RotateCcw size={13} />,
                      onClick: () => resetComponent(uuid, def.id),
                    },
                    {
                      label: 'Copy Component',
                      icon: <Copy size={13} />,
                      onClick: () => copyComponent(uuid, def.id),
                    },
                    {
                      label: 'Paste Component',
                      icon: <ClipboardPaste size={13} />,
                      disabled: !canPaste(def.id),
                      onClick: () => pasteComponent(uuid),
                    },
                    {
                      separatorBefore: true,
                      label: 'Remove Component',
                      icon: <Trash2 size={13} />,
                      danger: true,
                      onClick: () => removeComponentFrom(uuid, def.id),
                    },
                  ])
                }
              >
                {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                <Settings2 size={13} style={{ color: 'var(--text-muted)' }} />
                <span className="name">{def.name}</span>
                <button
                  className="ah-icon-btn"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation()
                    removeComponentFrom(uuid, def.id)
                  }}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {!isCollapsed && (
                <div className="ah-component-body">
                  {def.fields.map((field) => {
                    if (field.hidden) return null
                    const value =
                      field.key === 'slot0'
                        ? (record.slots as { materialId: string | null }[] | undefined)?.[0]?.materialId ?? null
                        : record[field.key]
                    return (
                      <div className="ah-field" key={field.key}>
                        {field.type !== 'vec3' && <label>{field.label}</label>}
                        <FieldEditor uuid={uuid} componentId={def.id} field={field} value={value} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ padding: 10 }}>
          <button className="ah-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() => setAdding(true)}>
            <Plus size={13} /> Add Component
          </button>
        </div>
      </div>

      {adding && <AddComponentDialog onClose={() => setAdding(false)} />}
      {contextMenu.node}
    </div>
  )
}

function setEntityNameLive(uuid: string, name: string): void {
  const { world } = useEditorStore.getState()
  findEntityByUuid(world, uuid)?.set(EntityMeta, { name })
}

function resetComponent(uuid: string, componentId: string): void {
  const def = getComponentDef(componentId)
  if (!def) return
  const { world } = useEditorStore.getState()
  const entity = findEntityByUuid(world, uuid)
  if (!entity) return
  entity.remove(def.trait)
  entity.add(def.trait, def.deserialize({}) as never)
  useEditorStore.getState().bumpWorld()
}

function copyComponent(uuid: string, componentId: string): void {
  const { world, setClipboardComponent } = useEditorStore.getState()
  const entity = findEntityByUuid(world, uuid)
  const def = getComponentDef(componentId)
  if (!entity || !def) return
  const data = def.serialize(entity.get(def.trait) as Record<string, unknown>)
  setClipboardComponent({ componentId, data })
}

function canPaste(componentId: string): boolean {
  const clipboard = useEditorStore.getState().clipboardComponent
  return clipboard?.componentId === componentId
}

function pasteComponent(uuid: string): void {
  const { world, clipboardComponent } = useEditorStore.getState()
  if (!clipboardComponent) return
  const def = getComponentDef(clipboardComponent.componentId)
  const entity = findEntityByUuid(world, uuid)
  if (!def || !entity) return
  entity.add(def.trait, def.deserialize(clipboardComponent.data) as never)
  useEditorStore.getState().bumpWorld()
}


