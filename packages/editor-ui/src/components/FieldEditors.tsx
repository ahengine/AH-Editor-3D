import { useEffect, useState } from 'react'
import type { FieldDef } from '@ahengine/ecs-runtime'
import { editComponentField, setComponentFieldLive, useEditorStore } from '@ahengine/editor-core'

/**
 * Registry-driven field editors. Values commit through editComponentField
 * (undoable) with live preview while typing.
 */

interface FieldProps {
  uuid: string
  componentId: string
  field: FieldDef
  value: unknown
}

export function FieldEditor(props: FieldProps): React.ReactNode {
  switch (props.field.type) {
    case 'number':
    case 'integer':
      return <NumberField {...props} integer={props.field.type === 'integer'} />
    case 'boolean':
      return <BooleanField {...props} />
    case 'string':
      return <StringField {...props} />
    case 'vec3':
      return <Vector3Field {...props} />
    case 'color':
      return <ColorField {...props} />
    case 'enum':
      return <EnumField {...props} />
    case 'asset':
      return <AssetField {...props} />
    case 'slider':
      return <SliderField {...props} />
    default:
      return null
  }
}

/* ------------------------------------------------------------------ */

function NumberField({ uuid, componentId, field, value, integer }: FieldProps & { integer?: boolean }) {
  const [text, setText] = useState(String(value ?? 0))
  useEffect(() => setText(String(value ?? 0)), [value])
  const commit = (next: string) => {
    const parsed = integer ? parseInt(next, 10) : parseFloat(next)
    if (Number.isNaN(parsed)) return
    const clamped = Math.min(field.max ?? Infinity, Math.max(field.min ?? -Infinity, parsed))
    editComponentField(uuid, componentId, { [field.key]: clamped })
  }
  return (
    <input
      className="ah-input"
      type="number"
      value={text}
      step={field.step ?? (integer ? 1 : 'any')}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && commit((e.target as HTMLInputElement).value)}
    />
  )
}

function StringField({ uuid, componentId, field, value }: FieldProps) {
  return (
    <input
      className="ah-input"
      value={String(value ?? '')}
      onChange={(e) => setComponentFieldLive(uuid, componentId, { [field.key]: e.target.value })}
      onBlur={(e) => editComponentField(uuid, componentId, { [field.key]: e.target.value })}
    />
  )
}

function BooleanField({ uuid, componentId, field, value }: FieldProps) {
  return (
    <label className="ah-check" style={{ justifyContent: 'flex-start' }}>
      <input
        type="checkbox"
        checked={Boolean(value)}
        onChange={(e) => editComponentField(uuid, componentId, { [field.key]: e.target.checked })}
      />
    </label>
  )
}

function Vector3Field({ uuid, componentId, field, value }: FieldProps) {
  const v = (value ?? { x: 0, y: 0, z: 0 }) as { x: number; y: number; z: number }
  const axes = ['x', 'y', 'z'] as const
  const [text, setText] = useState({ x: String(v.x), y: String(v.y), z: String(v.z) })
  useEffect(() => setText({ x: String(v.x), y: String(v.y), z: String(v.z) }), [v.x, v.y, v.z])
  return (
    <div className="ah-vec3">
      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>{field.label}</label>
      {axes.map((axis) => (
        <div className={`axis ${axis}`} key={axis}>
          <span>{axis.toUpperCase()}</span>
          <input
            type="number"
            step={field.step ?? 'any'}
            value={text[axis]}
            onChange={(e) => setText((prev) => ({ ...prev, [axis]: e.target.value }))}
            onBlur={() => {
              const parsed = parseFloat(text[axis])
              if (!Number.isNaN(parsed)) {
                editComponentField(uuid, componentId, {
                  [field.key]: { ...v, [axis]: parsed },
                })
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              // Stepper arrows nudge live for immediate viewport feedback.
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                const step = (field.step ?? 0.1) * (e.key === 'ArrowUp' ? 1 : -1)
                const next = (parseFloat(text[axis]) || 0) + step
                setText((prev) => ({ ...prev, [axis]: String(next) }))
                setComponentFieldLive(uuid, componentId, { [field.key]: { ...v, [axis]: next } })
              }
            }}
          />
        </div>
      ))}
    </div>
  )
}

function ColorField({ uuid, componentId, field, value }: FieldProps) {
  const color = String(value ?? '#ffffff')
  return (
    <div className="ah-color">
      <input
        type="color"
        value={color.slice(0, 7)}
        onChange={(e) => setComponentFieldLive(uuid, componentId, { [field.key]: e.target.value })}
        onBlur={(e) => editComponentField(uuid, componentId, { [field.key]: e.target.value })}
      />
      <input
        className="ah-input"
        value={color}
        onChange={(e) => setComponentFieldLive(uuid, componentId, { [field.key]: e.target.value })}
        onBlur={(e) => editComponentField(uuid, componentId, { [field.key]: e.target.value })}
      />
    </div>
  )
}

function EnumField({ uuid, componentId, field, value }: FieldProps) {
  return (
    <select
      className="ah-input"
      value={String(value ?? '')}
      onChange={(e) => editComponentField(uuid, componentId, { [field.key]: e.target.value })}
      style={{ height: 24 }}
    >
      {field.options?.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

function AssetField({ uuid, componentId, field, value }: FieldProps) {
  const assets = useEditorStore((s) => s.assets)
  const materials = useEditorStore((s) => s.materials)
  let options: { id: string; name: string }[] = []
  if (field.assetType === 'material') options = materials.map((m) => ({ id: m.id, name: m.name }))
  else options = assets.filter((a) => a.type === field.assetType).map((a) => ({ id: a.id, name: a.name }))

  const current = value === null || value === undefined ? '' : String(value)
  return (
    <select
      className="ah-input"
      value={current}
      onChange={(e) => editComponentField(uuid, componentId, { [field.key]: e.target.value || null })}
      style={{ height: 24 }}
    >
      {field.nullable !== false && <option value="">— none —</option>}
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  )
}

function SliderField({ uuid, componentId, field, value }: FieldProps) {
  const min = field.min ?? 0
  const max = field.max ?? 1
  const numeric = Number(value ?? min)
  const fill = ((numeric - min) / (max - min)) * 100
  return (
    <div className="ah-slider">
      <input
        type="range"
        min={min}
        max={max}
        step={field.step ?? 0.01}
        value={numeric}
        style={{ ['--fill' as string]: `${fill}%` }}
        onChange={(e) => setComponentFieldLive(uuid, componentId, { [field.key]: parseFloat(e.target.value) })}
        onPointerUp={(e) =>
          editComponentField(uuid, componentId, {
            [field.key]: parseFloat((e.target as HTMLInputElement).value),
          })
        }
        onKeyUp={(e) =>
          editComponentField(uuid, componentId, {
            [field.key]: parseFloat((e.target as HTMLInputElement).value),
          })
        }
      />
      <input
        className="ah-input"
        type="number"
        step={field.step ?? 0.01}
        value={numeric}
        onChange={(e) => setComponentFieldLive(uuid, componentId, { [field.key]: parseFloat(e.target.value) || 0 })}
        onBlur={(e) => editComponentField(uuid, componentId, { [field.key]: parseFloat(e.target.value) || 0 })}
      />
    </div>
  )
}
