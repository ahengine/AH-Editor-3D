import { useMemo, useState } from 'react'
import type { Entity } from 'koota'
import { ChevronDown, ChevronRight, ClipboardPaste, Copy, Eye, EyeOff, Lightbulb, Package, PenLine, Plus, RotateCcw, Settings2, Trash2 } from 'lucide-react'
import {
  EntityMeta,
  Light as LightTrait,
  MaterialReference,
  PrimitiveMesh,
  componentRegistry,
  findEntityByUuid,
  getComponentDef,
} from '@ahengine/ecs-runtime'
import {
  editComponentField,
  openAsset,
  removeComponentFrom,
  renameEntity,
  setComponentFieldLive,
  setEnabled,
  useEditorStore,
} from '@ahengine/editor-core'
import { SegmentedControl, IconButton, InspectorSection, NumberInput, EditorSlider } from '../ui/primitives.js'
import { AddComponentDialog } from './AddComponentDialog.js'
import { SceneSettingsPanel } from './SceneSettingsPanel.js'
import { MaterialEditor } from './MaterialEditor.js'
import { useContextMenu } from '../hooks.js'

/**
 * Inspector (352px, full workspace height) — Inspector | Library tabs.
 * Compact entity header, Transform matrix (X/Y/Z columns), Material with
 * live sphere + PBR sliders, Animator, remaining registry components, and
 * always-visible collapsed Scene Settings / Light Settings sections.
 */

export function Inspector() {
  const inspectorTab = useEditorStore((s) => s.inspectorTab)
  const store = useEditorStore.getState

  return (
    <div className="ah-panel">
      <div className="ah-panel-head" style={{ paddingBottom: 0 }}>
        <SegmentedControl
          value={inspectorTab}
          onChange={(tab) => store().setInspectorTab(tab)}
          options={[
            { value: 'inspector', label: 'Inspector' },
            { value: 'library', label: 'Library' },
          ]}
        />
      </div>
      {inspectorTab === 'inspector' ? <InspectorBody /> : (
        <div className="ah-panel-body">
          <MaterialEditor />
        </div>
      )}
    </div>
  )
}

function InspectorBody() {
  const world = useEditorStore((s) => s.world)
  const worldVersion = useEditorStore((s) => s.worldVersion)
  const selection = useEditorStore((s) => s.selection)
  const materials = useEditorStore((s) => s.materials)
  const [adding, setAdding] = useState(false)
  const [sceneOpen, setSceneOpen] = useState(false)
  const [lightOpen, setLightOpen] = useState(false)
  const contextMenu = useContextMenu()
  void worldVersion

  const uuid = selection[0]
  const entity: Entity | undefined = uuid ? findEntityByUuid(world, uuid) : undefined
  const meta = entity?.get(EntityMeta)

  return (
    <div className="ah-panel-body">
      <div className="ah-inspector-scroll">
        {entity && meta ? (
          <>
            <EntityHeader entity={entity} uuid={uuid} name={meta.name} enabled={meta.enabled} />

            {entity.has(Transform) && <TransformSection entity={entity} uuid={uuid} />}

            {entity.has(MaterialReference) && (
              <MaterialSection entity={entity} uuid={uuid} materials={materials} />
            )}

            {entity.has(Animator) && <AnimatorSection entity={entity} uuid={uuid} />}

            {componentRegistry
              .filter(
                (def) =>
                  entity.has(def.trait) &&
                  def.addable &&
                  def.id !== 'core.transform' &&
                  def.id !== 'render.material' &&
                  def.id !== 'animation.animator'
              )
              .map((def) => (
                <RegistrySection
                  key={def.id}
                  entity={entity}
                  uuid={uuid}
                  componentId={def.id}
                  entityEnabled={meta.enabled}
                  onContextMenu={(event) =>
                    contextMenu.open(event, [
                      { label: 'Reset to Default', icon: <RotateCcw size={13} />, onClick: () => resetComponent(uuid, def.id) },
                      { label: 'Copy Component', icon: <Copy size={13} />, onClick: () => copyComponent(uuid, def.id) },
                      { label: 'Paste Component', icon: <ClipboardPaste size={13} />, disabled: !canPaste(def.id), onClick: () => pasteComponent(uuid) },
                      { separatorBefore: true, label: 'Remove Component', icon: <Trash2 size={13} />, danger: true, onClick: () => removeComponentFrom(uuid, def.id) },
                    ])
                  }
                />
              ))}

            <button className="ah-inspector-add" onClick={() => setAdding(true)}>
              <Plus size={13} /> Add Component
            </button>
          </>
        ) : null}

        {/* Always-present collapsed tail sections (visible with or without selection) */}
        <SceneSettingsPanel />
      </div>
      {adding && <AddComponentDialog onClose={() => setAdding(false)} />}
      {contextMenu.node}
      {(!entity || !meta) && <div className="ah-empty" style={{ marginTop: 32 }}>Select an entity</div>}
    </div>
  )
}

/* traits used directly in JSX above (imported alongside the rest of ecs-runtime) */
import { Transform, Animator } from '@ahengine/ecs-runtime'

/* ------------------------------------------------------------------ */
/* Entity header                                                       */
/* ------------------------------------------------------------------ */

function EntityHeader({ entity, uuid, name, enabled }: { entity: Entity; uuid: string; name: string; enabled: boolean }) {
  const isMesh = entity.has(PrimitiveMesh)
  const tris = useMemo(() => (isMesh ? primitiveTriangleCount(entity) : null), [entity, isMesh])
  const kindLabel = entity.has(LightTrait) ? 'Light' : isMesh ? 'Mesh' : 'Entity'
  return (
    <div className="ah-entity-header">
      <span className="ah-entity-icon">
        <Package size={15} />
      </span>
      <div className="ah-entity-meta">
        <input
          className="ah-entity-name"
          defaultValue={name}
          key={uuid}
          onBlur={(event) => renameEntity(uuid, event.target.value.trim() || name)}
          onKeyDown={(event) => event.key === 'Enter' && (event.target as HTMLInputElement).blur()}
        />
        <span className="ah-entity-sub">
          {kindLabel}
          {tris !== null ? ` · ${tris.toLocaleString()} tris` : ''} · {uuid.slice(0, 8)}
        </span>
      </div>
      <IconButton
        small
        icon={enabled ? <Eye size={13} /> : <EyeOff size={13} />}
        label={enabled ? 'Disable' : 'Enable'}
        onClick={() => setEnabled(uuid, !enabled)}
      />
    </div>
  )
}

function primitiveTriangleCount(entity: Entity): number {
  const mesh = entity.get(PrimitiveMesh)
  if (!mesh) return 0
  switch (mesh.shape) {
    case 'sphere':
      return Math.max(8, mesh.segments) * Math.max(6, Math.floor(mesh.segments / 2)) * 2
    case 'plane':
      return 2
    case 'cylinder':
      return Math.max(8, mesh.segments) * 4
    case 'cone':
      return Math.max(8, mesh.segments) * 2
    case 'torus':
      return Math.max(8, Math.floor(mesh.segments / 2)) * mesh.segments * 2
    default:
      return 12
  }
}

/* ------------------------------------------------------------------ */
/* Transform matrix                                                    */
/* ------------------------------------------------------------------ */

/** Transform clipboard — editor-only, never serialized. */
let transformClipboard: { position: typeof Transform.prototype.schema.position } | null = null

function transformResetData() {
  return { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } }
}

function TransformSection({ entity, uuid }: { entity: Entity; uuid: string }) {
  const transform = entity.get(Transform)!
  const def = getComponentDef('core.transform')!
  const serializeCurrent = () =>
    def.serialize(entity.get(Transform) as unknown as Record<string, unknown>)
  return (
    <InspectorSection
      title="Transform"
      actions={
        <>
          <IconButton small icon={<Copy size={12} />} label="Copy transform" onClick={() => {
            transformClipboard = JSON.parse(JSON.stringify(serializeCurrent())) as typeof transformClipboard
          }} />
          <IconButton small icon={<ClipboardPaste size={12} />} label="Paste transform" disabled={!transformClipboard} onClick={() => {
            if (!transformClipboard) return
            editComponentField(uuid, 'core.transform', transformClipboard as unknown as Record<string, unknown>)
          }} />
          <IconButton small icon={<RotateCcw size={12} />} label="Reset transform" onClick={() => {
            editComponentField(uuid, 'core.transform', def.serialize(transformResetData() as unknown as Record<string, unknown>))
          }} />
        </>
      }
    >
      <div className="ah-matrix">
        <span className="ah-matrix-label" />
        {(['X', 'Y', 'Z'] as const).map((axis) => (
          <span key={axis} className="ah-matrix-axis">
            {axis}
          </span>
        ))}

        <span className="ah-matrix-label">Position</span>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberInput
            key={axis}
            axis={axis.toUpperCase()}
            axisClass={`axis-${axis}`}
            step={0.1}
            value={transform.position[axis]}
            onCommit={(value) =>
              editComponentField(uuid, 'core.transform', {
                position: {
                  x: transform.position.x,
                  y: transform.position.y,
                  z: transform.position.z,
                  [axis]: value,
                } as typeof transform.position,
              })
            }
            onLiveNudge={(value) =>
              editComponentField(uuid, 'core.transform', {
                position: { ...transform.position, [axis]: value },
              })
            }
          />
        ))}

        <span className="ah-matrix-label">Rotation</span>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberInput
            key={axis}
            axis={axis.toUpperCase()}
            axisClass={`axis-${axis}`}
            step={1}
            value={transform.rotation[axis]}
            onCommit={(value) =>
              editComponentField(uuid, 'core.transform', {
                rotation: { ...transform.rotation, [axis]: value },
              })
            }
            onLiveNudge={(value) =>
              editComponentField(uuid, 'core.transform', {
                rotation: { ...transform.rotation, [axis]: value },
              })
            }
          />
        ))}

        <span className="ah-matrix-label">Scale</span>
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberInput
            key={axis}
            axis={axis.toUpperCase()}
            axisClass={`axis-${axis}`}
            step={0.1}
            value={transform.scale[axis]}
            onCommit={(value) =>
              editComponentField(uuid, 'core.transform', {
                scale: { ...transform.scale, [axis]: value },
              })
            }
            onLiveNudge={(value) =>
              editComponentField(uuid, 'core.transform', {
                scale: { ...transform.scale, [axis]: value },
              })
            }
          />
        ))}
      </div>
    </InspectorSection>
  )
}

/* ------------------------------------------------------------------ */
/* Material                                                            */
/* ------------------------------------------------------------------ */

function MaterialSection({
  entity,
  uuid,
  materials,
}: {
  entity: Entity
  uuid: string
  materials: import('@ahengine/project-schema').MaterialDefinition[]
}) {
  const reference = entity.get(MaterialReference)
  const materialId = reference?.slots?.[0]?.materialId ?? null
  const material = materials.find((m) => m.id === materialId) ?? null
  const [advanced, setAdvanced] = useState(false)
  const store = useEditorStore.getState

  const update = (patch: Partial<import('@ahengine/project-schema').MaterialDefinition['properties']>) => {
    if (!material) return
    void import('@ahengine/editor-core').then((m) => {
      const next = { ...material, properties: { ...material.properties, ...patch } }
      m.runCommand(new m.UpsertMaterialCommand('Edit material', next))
    })
  }

  return (
    <InspectorSection
      title="Material"
      actions={
        <IconButton
          small
          icon={<Settings2 size={13} />}
          label="Material library"
          onClick={() => store().setInspectorTab('library')}
        />
      }
    >
      <div className="ah-material-row">
        <span
          className="ah-material-sphere"
          style={{
            background: `radial-gradient(circle at 34% 28%, #ffffffaa, ${(material?.properties.baseColor ?? '#b8bec7') + 'cc'} 38%, ${(material?.properties.baseColor ?? '#4a5563')} 72%, #0c1016 100%)`,
          }}
        />
        <select
          className="ah-input"
          style={{ flex: 1 }}
          value={materialId ?? ''}
          onChange={(event) => editComponentField(uuid, 'render.material', { slot0: event.target.value || null })}
        >
          <option value="">— none —</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select
          className="ah-input"
          style={{ width: 86 }}
          value={material?.type ?? 'standard'}
          disabled={!material}
          onChange={(event) => material && update({}) /* type changes rebuild below */}
          onInput={(event) => {
            if (!material) return
            const type = (event.target as HTMLSelectElement).value as typeof material.type
            void import('@ahengine/editor-core').then((m) => {
              m.runCommand(new m.UpsertMaterialCommand('Change material type', { ...material, type }))
            })
          }}
        >
          <option value="standard">PBR</option>
          <option value="physical">Physical</option>
          <option value="unlit">Unlit</option>
        </select>
        {materialId && (
          <IconButton
            small
            icon={<PenLine size={13} />}
            label="Open in Material editor"
            onClick={() => openAsset({ kind: 'material', id: materialId })}
          />
        )}
      </div>

      {material && (
        <>
          <div className="ah-field">
            <label>Base Color</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                type="color"
                className="ah-color-chip"
                value={(material.properties.baseColor ?? '#ffffff').slice(0, 7)}
                onChange={(event) => update({ baseColor: event.target.value })}
              />
              <input
                className="ah-input"
                style={{ flex: 1 }}
                defaultValue={material.properties.baseColor ?? ''}
                key={material.id + (material.properties.baseColor ?? '')}
                onBlur={(event) => update({ baseColor: event.target.value })}
              />
            </div>
          </div>
          <SliderRow
            label="Metallic"
            min={0}
            max={1}
            value={material.properties.metalness ?? 0}
            onLive={(value) => update({ metalness: value })}
            onCommit={(value) => update({ metalness: value })}
          />
          <SliderRow
            label="Roughness"
            min={0}
            max={1}
            value={material.properties.roughness ?? 0.8}
            onLive={(value) => update({ roughness: value })}
            onCommit={(value) => update({ roughness: value })}
          />
          <SliderRow
            label="Emissive"
            min={0}
            max={4}
            step={0.05}
            value={material.properties.emissiveIntensity ?? 0}
            onLive={(value) => update({ emissiveIntensity: value })}
            onCommit={(value) => update({ emissiveIntensity: value })}
          />
          {advanced && (
            <>
              <SliderRow
                label="Opacity"
                min={0}
                max={1}
                value={material.properties.opacity ?? 1}
                onLive={(value) => update({ opacity: value, transparent: value < 1 })}
                onCommit={(value) => update({ opacity: value, transparent: value < 1 })}
              />
              <div className="ah-field">
                <label>Side</label>
                <select
                  className="ah-input"
                  value={material.properties.side ?? 'front'}
                  onChange={(event) => update({ side: event.target.value as 'front' | 'back' | 'double' })}
                >
                  <option value="front">Front</option>
                  <option value="back">Back</option>
                  <option value="double">Double</option>
                </select>
              </div>
            </>
          )}
          <button className="ah-inspector-link" onClick={() => setAdvanced(!advanced)}>
            {advanced ? 'Less' : 'More'} {advanced ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
          </button>
        </>
      )}
    </InspectorSection>
  )
}

function SliderRow({
  label,
  min,
  max,
  step = 0.01,
  value,
  onLive,
  onCommit,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onLive: (value: number) => void
  onCommit: (value: number) => void
}) {
  const [text, setText] = useState(value.toFixed(2))
  useMemo(() => setText(value.toFixed(2)), [value])
  return (
    <div className="ah-field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <EditorSlider value={value} min={min} max={max} step={step} onLiveChange={onLive} onCommit={onCommit} />
        <input
          className="ah-input"
          style={{ width: 42, textAlign: 'right' }}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onBlur={() => {
            const parsed = parseFloat(text)
            if (!Number.isNaN(parsed)) onCommit(parsed)
          }}
          onKeyDown={(event) => event.key === 'Enter' && (event.target as HTMLInputElement).blur()}
        />
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Animator                                                            */
/* ------------------------------------------------------------------ */

function AnimatorSection({ entity, uuid }: { entity: Entity; uuid: string }) {
  const controllers = useEditorStore((s) => s.controllers)
  const data = entity.get(Animator)
  const controller = controllers.find((c) => c.id === data?.controllerId) ?? null
  const entry = controller?.states.find((s) => s.id === (data?.initialState || controller?.entryStateId))
  return (
    <InspectorSection
      title="Animator"
      actions={
        controller ? (
          <IconButton
            small
            icon={<PenLine size={13} />}
            label="Open controller in Animator workspace"
            onClick={() => openAsset({ kind: 'controller', id: controller.id })}
          />
        ) : undefined
      }
    >
      <div className="ah-field">
        <label>Controller</label>
        <select
          className="ah-input"
          value={data?.controllerId ?? ''}
          onChange={(event) =>
            editComponentField(uuid, 'animation.animator', {
              controllerId: event.target.value,
              initialState: controllers.find((c) => c.id === event.target.value)?.entryStateId ?? '',
            })
          }
        >
          <option value="">— none —</option>
          {controllers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="ah-field">
        <label>State</label>
        <select
          className="ah-input"
          value={data?.initialState ?? ''}
          disabled={!controller}
          onChange={(event) => editComponentField(uuid, 'animation.animator', { initialState: event.target.value })}
        >
          {controller?.states.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
              {state.id === controller.entryStateId ? ' (Default)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="ah-field">
        <label>Speed</label>
        <input
          className="ah-input"
          type="number"
          step={0.05}
          defaultValue={data?.speed ?? 1}
          key={uuid}
          onBlur={(event) => editComponentField(uuid, 'animation.animator', { speed: parseFloat(event.target.value) || 1 })}
        />
      </div>
    </InspectorSection>
  )
}

/* ------------------------------------------------------------------ */
/* Generic registry section + light settings                           */
/* ------------------------------------------------------------------ */

function RegistrySection({
  entity,
  uuid,
  componentId,
  entityEnabled,
  onContextMenu,
}: {
  entity: Entity
  uuid: string
  componentId: string
  entityEnabled?: boolean
  onContextMenu: (event: React.MouseEvent) => void
}) {
  const def = getComponentDef(componentId)!
  const record = entity.get(def.trait) as Record<string, unknown>
  void entity
  return (
    <InspectorSection
      title={def.name}
      actions={
        <IconButton
          small
          icon={<Trash2 size={12} />}
          label="Remove component"
          onClick={(event) => {
            event.stopPropagation()
            removeComponentFrom(uuid, componentId)
          }}
        />
      }
    >
      <div onContextMenu={onContextMenu}>
        {componentId === 'render.light' && (
          <div className="ah-field" style={{ minHeight: 32 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--text-primary)' }}>
              <Lightbulb size={13} style={{ color: entityEnabled ? 'var(--accent)' : 'var(--text-tertiary)' }} />
              On
            </label>
            <label className="ah-check" style={{ justifyContent: 'flex-start' }}>
              <input
                type="checkbox"
                checked={entityEnabled !== false}
                onChange={(event) => uuid && setEnabled(uuid, event.target.checked)}
              />
              {entityEnabled !== false ? 'illuminating' : 'off — settings preserved'}
            </label>
          </div>
        )}
        {def.fields.map((field) => {
          if (field.hidden) return null
          // Type-aware filtering: hide fields irrelevant to the current light type
          if (field.showForTypes && componentId === 'render.light') {
            const currentType = String(record.type ?? 'directional')
            if (!field.showForTypes.includes(currentType)) return null
          }
          const value = record[field.key]
          return (
            <div className="ah-field" key={field.key}>
              <label>{field.label}</label>
              <RegistryField uuid={uuid} componentId={componentId} field={field} value={value} record={record} />
            </div>
          )
        })}
      </div>
    </InspectorSection>
  )
}

function RegistryField({
  uuid,
  componentId,
  field,
  value,
  record,
}: {
  uuid: string
  componentId: string
  field: import('@ahengine/ecs-runtime').FieldDef
  value: unknown
  record: Record<string, unknown>
}) {
  const materials = useEditorStore((s) => s.materials)
  const assets = useEditorStore((s) => s.assets)

  switch (field.type) {
    case 'boolean':
      return (
        <label className="ah-check" style={{ justifyContent: 'flex-start' }}>
          <input type="checkbox" checked={Boolean(value)} onChange={(event) => editComponentField(uuid, componentId, { [field.key]: event.target.checked })} />
        </label>
      )
    case 'color':
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            type="color"
            className="ah-color-chip"
            value={String(value ?? '#ffffff').slice(0, 7)}
            onChange={(event) => setComponentFieldLive(uuid, componentId, { [field.key]: event.target.value })}
            onBlur={(event) => editComponentField(uuid, componentId, { [field.key]: event.target.value })}
          />
          <input className="ah-input" style={{ flex: 1 }} defaultValue={String(value ?? '')} key={String(value)} onBlur={(event) => editComponentField(uuid, componentId, { [field.key]: event.target.value })} />
        </div>
      )
    case 'enum':
      return (
        <select className="ah-input" value={String(value ?? '')} onChange={(event) => editComponentField(uuid, componentId, { [field.key]: event.target.value })}>
          {field.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )
    case 'asset': {
      let options: { id: string; name: string }[] = []
      if (field.assetType === 'material') options = materials.map((m) => ({ id: m.id, name: m.name }))
      else options = assets.filter((a) => a.type === field.assetType).map((a) => ({ id: a.id, name: a.name }))
      const current = field.key === 'slot0'
        ? ((record.slots as { materialId: string | null }[] | undefined)?.[0]?.materialId ?? '')
        : String(value ?? '')
      return (
        <select className="ah-input" value={current} onChange={(event) => editComponentField(uuid, componentId, { [field.key]: event.target.value || null })}>
          {field.nullable !== false && <option value="">— none —</option>}
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      )
    }
    case 'slider':
      return (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <EditorSlider
            value={Number(value ?? field.min ?? 0)}
            min={field.min ?? 0}
            max={field.max ?? 1}
            step={field.step ?? 0.01}
            onLiveChange={(next) => setComponentFieldLive(uuid, componentId, { [field.key]: next })}
            onCommit={(next) => editComponentField(uuid, componentId, { [field.key]: next })}
          />
          <span className="ah-slider-value">{Number(value ?? 0).toFixed(2)}</span>
        </div>
      )
    case 'number':
    case 'integer':
      return (
        <input
          className="ah-input"
          type="number"
          step={field.step ?? (field.type === 'integer' ? 1 : 'any')}
          defaultValue={Number(value ?? 0)}
          key={componentId + field.key + String(value)}
          onBlur={(event) => {
            const parsed = field.type === 'integer' ? parseInt(event.target.value, 10) : parseFloat(event.target.value)
            if (!Number.isNaN(parsed)) editComponentField(uuid, componentId, { [field.key]: parsed })
          }}
        />
      )
    case 'string':
      return (
        <input className="ah-input" defaultValue={String(value ?? '')} key={String(value)} onBlur={(event) => editComponentField(uuid, componentId, { [field.key]: event.target.value })} />
      )
    default:
      return null
  }
}

function LightSettingsSection({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const world = useEditorStore((s) => s.world)
  const worldVersion = useEditorStore((s) => s.worldVersion)
  void worldVersion
  const lights = useMemo(() => world.query(LightTrait), [world, worldVersion])
  return (
    <InspectorSection title="Light Settings" open={open} onToggle={onToggle}>
      {lights.length === 0 && <div className="ah-empty" style={{ padding: 8 }}>No lights in scene</div>}
      {lights.map((light) => {
        const meta = light.get(EntityMeta)
        const data = light.get(LightTrait)
        const uuid = meta?.uuid
        if (!uuid || !data) return null
        return (
          <div className="ah-field" key={uuid}>
            <label title={data.type}>{meta?.name}</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <EditorSlider
                value={data.intensity}
                min={0}
                max={20}
                step={0.05}
                onLiveChange={(next) => uuid && setComponentFieldLive(uuid, 'render.light', { intensity: next })}
                onCommit={(next) => uuid && editComponentField(uuid, 'render.light', { intensity: next })}
              />
              <span className="ah-slider-value">{data.intensity.toFixed(2)}</span>
            </div>
          </div>
        )
      })}
    </InspectorSection>
  )
}

function resetComponent(uuid: string, componentId: string): void {
  const def = getComponentDef(componentId)
  if (!def) return
  const { world } = useEditorStore.getState()
  const entity = findEntityByUuid(world, uuid)
  if (!entity) return
  entity.remove(def.trait)
  entity.add([def.trait, def.deserialize({}) as never])
  useEditorStore.getState().bumpWorld()
}

function copyComponent(uuid: string, componentId: string): void {
  const { world, setClipboardComponent } = useEditorStore.getState()
  const entity = findEntityByUuid(world, uuid)
  const def = getComponentDef(componentId)
  if (!entity || !def) return
  setClipboardComponent({ componentId, data: def.serialize(entity.get(def.trait) as Record<string, unknown>) })
}

function canPaste(componentId: string): boolean {
  return useEditorStore.getState().clipboardComponent?.componentId === componentId
}

function pasteComponent(uuid: string): void {
  const { world, clipboardComponent } = useEditorStore.getState()
  if (!clipboardComponent) return
  const def = getComponentDef(clipboardComponent.componentId)
  const entity = findEntityByUuid(world, uuid)
  if (!def || !entity) return
  entity.add([def.trait, def.deserialize(clipboardComponent.data) as never])
  useEditorStore.getState().bumpWorld()
}
