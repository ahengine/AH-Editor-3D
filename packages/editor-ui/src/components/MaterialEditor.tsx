import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import { MeshStandardNodeMaterial, WebGPURenderer } from 'three/webgpu'
import { Plus, Trash2 } from 'lucide-react'
import type { MaterialDefinition } from '@ahengine/project-schema'
import { UpsertMaterialCommand, runCommand, useEditorStore } from '@ahengine/editor-core'
import { materialService } from '@ahengine/editor-core'
import { editComponentField } from '@ahengine/editor-core'
import { IconButton } from '../ui/primitives.js'

/**
 * Material editor — the Inspector's Library tab. Material assets are project
 * data; edits rebuild the live NodeMaterial so the viewport updates.
 */
export function MaterialEditor() {
  const materials = useEditorStore((s) => s.materials)
  const assets = useEditorStore((s) => s.assets)
  const selection = useEditorStore((s) => s.selection)
  const [selected, setSelected] = useState<string | null>(null)

  const activeId = selected ?? materials[0]?.id ?? null
  const material = materials.find((m) => m.id === activeId) ?? null
  const textures = assets.filter((a) => a.type === 'texture')

  const update = (patch: Partial<MaterialDefinition['properties']>) => {
    if (!material) return
    const next = { ...material, properties: { ...material.properties, ...patch } }
    runCommand(new UpsertMaterialCommand('Edit material', next))
  }

  return (
    <div className="ah-lib">
      {/* List — wrapping chips (fits the 352px inspector) */}
      <div className="ah-lib-list">
        <button
          className="ah-btn"
          style={{ justifyContent: 'center' }}
          onClick={() => {
            const id = `mat-${crypto.randomUUID().slice(0, 8)}`
            const def: MaterialDefinition = {
              id,
              name: `Material ${materials.length + 1}`,
              type: 'standard',
              properties: { baseColor: '#b8bec7', roughness: 0.8, metalness: 0 },
            }
            runCommand(new UpsertMaterialCommand('Create material', def))
            setSelected(id)
          }}
        >
          <Plus size={13} /> New
        </button>
        {materials.map((m) => (
          <div
            key={m.id}
            className={`ah-mat-item ${m.id === activeId ? 'focused' : ''}`}
            onClick={() => setSelected(m.id)}
            draggable
            onDragStart={(event) => event.dataTransfer.setData('ah/material', m.id)}
          >
            <span
              className="ah-mat-swatch"
              style={{ background: m.properties.baseColor ?? '#888' }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
          </div>
        ))}
      </div>

      {/* Editor */}
      {material ? (
        <div className="ah-mat-editor">
          <div style={{ flex: 'none', display: 'flex', gap: 10, alignItems: 'center' }}>
            <MaterialPreview materialId={material.id} size={96} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              className="ah-input"
              style={{ width: '100%', fontWeight: 600 }}
              defaultValue={material.name}
              key={material.id}
              onBlur={(event) => {
                const name = event.target.value.trim() || material.name
                if (name !== material.name) {
                  runCommand(new UpsertMaterialCommand('Rename material', { ...material, name }))
                }
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                className="ah-input"
                style={{ flex: 1 }}
                value={material.type}
                onChange={(event) => {
                  const type = (event.target as HTMLSelectElement).value as MaterialDefinition['type']
                  if (type !== material.type) {
                    runCommand(new UpsertMaterialCommand('Change material type', { ...material, type }))
                  }
                }}
              >
                <option value="standard">Standard</option>
                <option value="physical">Physical</option>
                <option value="unlit">Unlit</option>
              </select>
              <IconButton
                small
                icon={<Trash2 size={13} />}
                label="Delete material"
                onClick={() => {
                  const store = useEditorStore.getState()
                  store.setMaterials(store.materials.filter((m) => m.id !== material.id))
                  materialService.remove(material.id)
                }}
              />
            </div>
            {selection[0] && (
              <button
                className="ah-btn"
                style={{ justifyContent: 'center' }}
                onClick={() => editComponentField(selection[0], 'render.material', { slot0: material.id })}
              >
                Assign to Selection
              </button>
            )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: '100%' }}>
            <div className="ah-field">
              <label>Base Color</label>
              <div style={{ display: 'flex', gap: 6 }}>
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

            <SliderRow label="Metalness" value={material.properties.metalness ?? 0} min={0} max={1} onChange={(v) => update({ metalness: v })} />
            <SliderRow label="Roughness" value={material.properties.roughness ?? 0.8} min={0} max={1} onChange={(v) => update({ roughness: v })} />
            <SliderRow label="Opacity" value={material.properties.opacity ?? 1} min={0} max={1} onChange={(v) => update({ opacity: v, transparent: v < 1 })} />
            <SliderRow label="Emissive I." value={material.properties.emissiveIntensity ?? 0} min={0} max={8} step={0.05} onChange={(v) => update({ emissiveIntensity: v })} />

            <div className="ah-field">
              <label>Emissive</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="color"
                  className="ah-color-chip"
                  value={(material.properties.emissive ?? '#000000').slice(0, 7)}
                  onChange={(event) => update({ emissive: event.target.value })}
                />
                <span />
              </div>
            </div>

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

            <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4 }}>
              <div style={{ fontSize: 'var(--fs-tiny)', letterSpacing: '0.08em', color: 'var(--text-tertiary)', marginBottom: 6 }}>
                TEXTURE MAPS
              </div>
              {(
                [
                  ['baseColorTexture', 'Base Color'],
                  ['metalnessTexture', 'Metalness'],
                  ['roughnessTexture', 'Roughness'],
                  ['normalTexture', 'Normal'],
                  ['emissiveTexture', 'Emissive'],
                ] as const
              ).map(([key, label]) => (
                <div className="ah-field" key={key} style={{ marginBottom: 4 }}>
                  <label>{label}</label>
                  <select
                    className="ah-input"
                    value={material.properties[key] ?? ''}
                    onChange={(event) => update({ [key]: event.target.value || null } as Partial<MaterialDefinition['properties']>)}
                  >
                    <option value="">— none —</option>
                    {textures.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="ah-empty" style={{ flex: 1, marginTop: 30 }}>
          Create a material to get started
        </div>
      )}
    </div>
  )
}

function SliderRow({
  label,
  min,
  max,
  step = 0.01,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step?: number
  value: number
  onChange: (value: number) => void
}) {
  const [live, setLive] = useState<number | null>(null)
  const shown = live ?? value
  return (
    <div className="ah-field" style={{ gridTemplateColumns: '92px 1fr' }}>
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <EditorSliderLazy
          value={shown}
          min={min}
          max={max}
          step={step}
          onLive={setLive}
          onCommit={(v) => { setLive(null); onChange(v) }}
        />
        <span className="ah-slider-value">{shown.toFixed(2)}</span>
      </div>
    </div>
  )
}

import { EditorSlider } from '../ui/primitives.js'
function EditorSliderLazy(props: {
  value: number
  min: number
  max: number
  step?: number
  onLive: (v: number) => void
  onCommit: (v: number) => void
}) {
  return <EditorSlider value={props.value} min={props.min} max={props.max} step={props.step} onLiveChange={props.onLive} onCommit={props.onCommit} />
}

/** Live preview sphere rendering the actual material service instance. */
function MaterialPreview({ materialId, size = 190 }: { materialId: string; size?: number }) {
  const gl = useMemo(
    () => async (props: unknown) => {
      const renderer = new WebGPURenderer({ ...(props as object), antialias: true })
      try {
        await renderer.init()
      } catch {
        const fallback = new WebGPURenderer({ ...(props as object), antialias: true, forceWebGL: true })
        await fallback.init()
        renderer.dispose()
        return fallback
      }
      return renderer
    },
    []
  )
  return (
    <div style={{ width: size, height: size, flex: 'none', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', overflow: 'hidden', background: '#131820' }}>
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0.6, 2.6], fov: 40 }} gl={gl}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 4, 2]} intensity={2.2} />
        <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#8fb4ff" />
        <PreviewSphere materialId={materialId} />
      </Canvas>
    </div>
  )
}

function PreviewSphere({ materialId }: { materialId: string }) {
  const materials = useEditorStore((s) => s.materials)
  const fallback = useMemo(() => {
    const m = new MeshStandardNodeMaterial()
    m.color.set('#b8bec7')
    return m
  }, [])

  useMemo(() => {
    void materials
    materialService.update(materialId)
    return null
  }, [materialId, materials])

  const material = materialService.get(materialId) ?? fallback
  return (
    <mesh material={material}>
      <sphereGeometry args={[1, 48, 32]} />
    </mesh>
  )
}
