import { useMemo, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import * as THREE from 'three'
import { MeshStandardNodeMaterial, WebGPURenderer } from 'three/webgpu'
import { Plus, Trash2 } from 'lucide-react'
import type { MaterialDefinition } from '@ahengine/project-schema'
import { UpsertMaterialCommand, runCommand, useEditorStore } from '@ahengine/editor-core'
import { materialService } from '@ahengine/editor-core'
import { editComponentField } from '@ahengine/editor-core'

/** Material editor: project-owned material assets with live preview sphere. */

export function MaterialEditor() {
  const materials = useEditorStore((s) => s.materials)
  const assets = useEditorStore((s) => s.assets)
  const editingId = useEditorStore((s) => s.editingMaterialId)
  const selection = useEditorStore((s) => s.selection)
  const [selected, setSelected] = useState<string | null>(editingId)

  const activeId = selected ?? materials[0]?.id ?? null
  const material = materials.find((m) => m.id === activeId) ?? null
  const textures = assets.filter((a) => a.type === 'texture')

  const update = (patch: Partial<MaterialDefinition['properties']>) => {
    if (!material) return
    const next = { ...material, properties: { ...material.properties, ...patch } }
    runCommand(new UpsertMaterialCommand('Edit material', next))
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* List */}
      <div style={{ width: 190, flex: 'none', borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button
          className="ah-btn"
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
          <Plus size={13} /> New Material
        </button>
        {materials.map((m) => (
          <div
            key={m.id}
            className={`ah-ac-item ${m.id === activeId ? 'focused' : ''}`}
            style={{ padding: '5px 8px' }}
            onClick={() => setSelected(m.id)}
            draggable
            onDragStart={(event) => event.dataTransfer.setData('ah/material', m.id)}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 3,
                border: '1px solid var(--border-light)',
                background: m.properties.baseColor ?? '#888',
                flex: 'none',
              }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
          </div>
        ))}
      </div>

      {/* Editor */}
      {material ? (
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', display: 'flex', gap: 16, minHeight: 0 }}>
          <div style={{ width: 210, flex: 'none', display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
            <MaterialPreview materialId={material.id} />
            <input
              className="ah-input"
              style={{ width: '100%', textAlign: 'center', fontWeight: 600 }}
              defaultValue={material.name}
              key={material.id}
              onBlur={(e) => {
                const name = e.target.value.trim() || material.name
                if (name !== material.name) {
                  runCommand(new UpsertMaterialCommand('Rename material', { ...material, name }))
                }
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <div style={{ display: 'flex', gap: 6, width: '100%' }}>
              <select
                className="ah-input"
                style={{ flex: 1 }}
                value={material.type}
                onChange={(e) => {
                  const type = (e.target as HTMLSelectElement).value as MaterialDefinition['type']
                  if (type !== material.type) {
                    runCommand(new UpsertMaterialCommand('Change material type', { ...material, type }))
                  }
                }}
              >
                <option value="standard">Standard</option>
                <option value="physical">Physical</option>
                <option value="unlit">Unlit</option>
              </select>
              <button
                className="ah-btn danger"
                title="Delete material"
                onClick={() => {
                  const store = useEditorStore.getState()
                  store.setMaterials(store.materials.filter((m) => m.id !== material.id))
                  materialService.remove(material.id)
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
            {selection[0] && (
              <button
                className="ah-btn"
                style={{ width: '100%', justifyContent: 'center' }}
                onClick={() => editComponentField(selection[0], 'render.material', { slot0: material.id })}
              >
                Assign to Selection
              </button>
            )}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 460 }}>
            <div className="ah-field">
              <label>Base Color</label>
              <div className="ah-color">
                <input
                  type="color"
                  value={(material.properties.baseColor ?? '#ffffff').slice(0, 7)}
                  onChange={(e) => update({ baseColor: e.target.value })}
                />
                <span />
                <input
                  className="ah-input"
                  value={material.properties.baseColor ?? ''}
                  onChange={(e) => update({ baseColor: e.target.value })}
                />
              </div>
            </div>

            <RangeRow
              label="Metalness"
              min={0}
              max={1}
              step={0.01}
              value={material.properties.metalness ?? 0}
              onChange={(v) => update({ metalness: v })}
            />
            <RangeRow
              label="Roughness"
              min={0}
              max={1}
              step={0.01}
              value={material.properties.roughness ?? 0.8}
              onChange={(v) => update({ roughness: v })}
            />
            <RangeRow
              label="Opacity"
              min={0}
              max={1}
              step={0.01}
              value={material.properties.opacity ?? 1}
              onChange={(v) => update({ opacity: v, transparent: v < 1 })}
            />
            <RangeRow
              label="Emissive Int."
              min={0}
              max={8}
              step={0.05}
              value={material.properties.emissiveIntensity ?? 0}
              onChange={(v) => update({ emissiveIntensity: v })}
            />

            <div className="ah-field">
              <label>Emissive</label>
              <div className="ah-color">
                <input
                  type="color"
                  value={(material.properties.emissive ?? '#000000').slice(0, 7)}
                  onChange={(e) => update({ emissive: e.target.value })}
                />
                <span />
                <span />
              </div>
            </div>

            <div className="ah-field">
              <label>Side</label>
              <select
                className="ah-input"
                value={material.properties.side ?? 'front'}
                onChange={(e) => update({ side: e.target.value as 'front' | 'back' | 'double' })}
                style={{ height: 24 }}
              >
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="double">Double</option>
              </select>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
              <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: 6 }}>
                TEXTURE MAPS
              </div>
              {(
                [
                  ['baseColorTexture', 'Base Color Map'],
                  ['metalnessTexture', 'Metalness Map'],
                  ['roughnessTexture', 'Roughness Map'],
                  ['normalTexture', 'Normal Map'],
                  ['emissiveTexture', 'Emissive Map'],
                ] as const
              ).map(([key, label]) => (
                <div className="ah-field" key={key} style={{ marginBottom: 6 }}>
                  <label>{label}</label>
                  <select
                    className="ah-input"
                    style={{ height: 24 }}
                    value={material.properties[key] ?? ''}
                    onChange={(e) => update({ [key]: e.target.value || null } as Partial<MaterialDefinition['properties']>)}
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

function RangeRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
}) {
  const [live, setLive] = useState<number | null>(null)
  const shown = live ?? value
  const fill = ((shown - min) / (max - min)) * 100
  return (
    <div className="ah-slider ah-field" style={{ gridTemplateColumns: '84px 1fr' }}>
      <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={shown}
          style={{ flex: 1, ['--fill' as string]: `${fill}%` }}
          onChange={(e) => {
            setLive(parseFloat(e.target.value))
          }}
          onPointerUp={() => {
            if (live !== null) onChange(live)
            setLive(null)
          }}
        />
        <span style={{ width: 40, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text-dim)' }}>
          {shown.toFixed(2)}
        </span>
      </div>
    </div>
  )
}

/** Small live preview sphere rendering the actual material service instance. */
function MaterialPreview({ materialId }: { materialId: string }) {
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
    <div style={{ width: 210, height: 160, border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden', background: '#131820' }}>
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

  // Rebuild the live material when its definition changes so the preview matches.
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
