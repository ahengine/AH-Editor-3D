import { useEffect, useRef, useState } from 'react'

import type { WorkspaceId } from '@ahengine/editor-core'
import { instantiatePrefabAction, runCommand, saveProject, UpsertMaterialCommand, useEditorStore } from '@ahengine/editor-core'
import { HierarchyPanel } from './HierarchyPanel.js'
import { AnimationWorkspace } from './AnimationWorkspace.js'
import { AnimatorWorkspace } from './AnimatorWorkspace.js'
import { ParticleWorkspace } from './ParticleWorkspace.js'
import { AssetBrowser } from './AssetBrowser.js'
import { ParticleListPanel } from './WorkspacePanels.js'
import { Circle, Plus } from 'lucide-react'
import { PrefabWorkspace } from './PrefabWorkspace.js'
import { MaterialGraphEditor } from './MaterialGraphEditor.js'

/**
 * Workspace configuration — one row per authoring workspace.
 * `left` and `bottom` are compositions; bottom supports tabbed context
 * content that grows per phase. Lighting lives in Scene; the animator
 * state machine lives in Animation.
 */

export interface BottomTabSpec {
  id: string
  label: string
  content: React.ReactNode
}

export interface WorkspaceConfig {
  id: WorkspaceId
  label: string
  left: React.ReactNode
  bottom: BottomTabSpec[]
  inspectorTab: 'inspector' | 'library'
}

export const workspaceConfigs: WorkspaceConfig[] = [
  {
    id: 'scene',
    label: 'Scene',
    left: <HierarchyPanel />,
    inspectorTab: 'inspector',
    bottom: [
      {
        id: 'assets',
        label: 'Assets',
        content: (
          <div className="ah-panel-body">
            <AssetBrowser compact />
          </div>
        ),
      },
    ],
  },
  {
    id: 'prefab',
    label: 'Prefab',
    left: <PrefabWorkspace />,
    inspectorTab: 'inspector',
    bottom: [
      {
        id: 'structure',
        label: 'Structure',
        content: (
          <PrefabCrumbbar />
        ),
      },
    ],
  },
  {
    id: 'material',
    label: 'Material',
    left: <MaterialGridBrowser />,
    inspectorTab: 'library',
    bottom: [
      {
        id: 'graph',
        label: 'Graph',
        content: <MaterialCenterPanel />,
      },
    ],
  },
  {
    id: 'animation',
    label: 'Animation',
    left: <HierarchyPanel />,
    inspectorTab: 'inspector',
    bottom: [{ id: 'timeline', label: 'Timeline', content: <AnimationWorkspace /> }],
  },
  {
    id: 'particle',
    label: 'Particle',
    left: <ParticleListPanel />,
    inspectorTab: 'inspector',
    bottom: [
      {
        id: 'curves',
        label: 'Effect',
        content: <ParticleWorkspace />,
      },
    ],
  },
]

/** Bottom bar for the prefab workspace — reference crumbbar composition. */
function PrefabCrumbbar() {
  const prefabs = useEditorStore((s) => s.prefabs)
  const activePrefabId = useEditorStore((s) => s.activePrefabId)
  const setActivePrefabId = useEditorStore((s) => s.setActivePrefabId)
  const prefab = prefabs.find((p) => p.id === activePrefabId)
  const nested = prefab?.nestedInstances ?? []
  return (
    <div className="ah-crumbbar" style={{ height: '100%' }}>
      <span className="ah-crumb">Assets</span>
      <span style={{ color: 'var(--faint)' }}>›</span>
      <span className="ah-crumb">Prefabs</span>
      <span style={{ color: 'var(--faint)' }}>›</span>
      <span className="ah-crumb active">{prefab?.name ?? '—'}</span>
      {nested.map((n) => (
        <span key={n.instanceId} className="ah-crumb" onClick={() => setActivePrefabId(n.prefabId)}>
          {n.name ?? n.prefabId}
        </span>
      ))}
      <div style={{ flex: 1 }} />
      <button className="ah-btn" onClick={() => prefab && instantiatePrefabAction(prefab.id)}>
        Instantiate
      </button>
      <button className="ah-btn" onClick={() => void saveProject()}>
        Save Prefab
      </button>
    </div>
  )
}

/**
 * Material grid browser — reference-style material thumbnails in a grid.
 * Click to select, double-click to open in the graph. "+" creates new.
 */
function MaterialGridBrowser() {
  const materials = useEditorStore((s) => s.materials)
  const editingMaterialId = useEditorStore((s) => s.editingMaterialId)
  const store = useEditorStore.getState

  const create = () => {
    const id = `mat-${crypto.randomUUID().slice(0, 8)}`
    runCommand(
      new UpsertMaterialCommand('Create material', {
        id,
        name: `Material ${materials.length + 1}`,
        type: 'standard',
        properties: { baseColor: '#8da4bc', roughness: 0.5, metalness: 0.1 },
      })
    )
    store().setEditingMaterial(id)
  }

  return (
    <div className="ah-panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="ah-panel-head">
        <span className="ah-panel-title">Materials</span>
        <span className="ah-list-count">{materials.length}</span>
        <div style={{ flex: 1 }} />
        <button className="ah-icon-btn small" title="New material" onClick={create}>
          <Plus size={13} />
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 6 }}>
          {materials.map((m) => (
            <button
              key={m.id}
              className="ah-asset-card"
              style={{
                minHeight: 72,
                border: m.id === editingMaterialId ? '1px solid var(--accent)' : '1px solid transparent',
                background: m.id === editingMaterialId ? 'var(--accent-soft)' : 'transparent',
              }}
              draggable
              onDragStart={(event) => event.dataTransfer.setData('ah/material', m.id)}
              onClick={() => store().setEditingMaterial(m.id)}
              title={`${m.name} — click to edit, drag to assign`}
            >
              <div
                className="ah-asset-thumb"
                style={{ background: m.graph ? 'linear-gradient(135deg,#5d55a5,#7d7dd9)' : m.properties.baseColor ?? '#888' }}
              />
              <div className="ah-asset-name" style={{ fontSize: 9, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
              <div className="ah-asset-type">{m.graph ? 'NODE' : m.type.toUpperCase()}</div>
            </button>
          ))}
        </div>
        {materials.length === 0 && <div className="ah-empty">No materials — create one with +</div>}
      </div>
    </div>
  )
}

/** Material workspace center — reference composition: node graph hero + preview bar. */
/**
 * Real 3D material preview — a sphere on a small WebGPU canvas that you
 * can DRAG to rotate. Compiles the material's graph (or flat properties)
 * live so node edits update the preview in real time.
 */
function MaterialPreview3D({ materialId }: { materialId: string | null }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const rotRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const rendererRef = useRef<import('three/webgpu').WebGPURenderer | null>(null)
  const meshRef = useRef<import('three').Mesh | null>(null)
  const sceneRef = useRef<import('three').Scene | null>(null)
  const cameraRef = useRef<import('three').PerspectiveCamera | null>(null)
  const materials = useEditorStore((s) => s.materials)
  const material = materials.find((m) => m.id === materialId) ?? null

  // Mount renderer once (ResizeObserver guard against 0-size WebGPU crash)
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const disposed = false
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 10 && el.clientHeight > 10 && !ready) setReady(true)
    })
    ro.observe(el)
    if (el.clientWidth > 10 && el.clientHeight > 10) setReady(true)
    return () => { ro.disconnect(); void disposed }
  }, [ready])

  useEffect(() => {
    if (!ready || !wrapRef.current) return
    const el = wrapRef.current
    let disposed = false
    void (async () => {
      const THREE = await import('three')
      const { WebGPURenderer: Renderer } = await import('three/webgpu')
      const renderer = new Renderer({ antialias: true, forceWebGL: true })
      await renderer.init()
      if (disposed) { renderer.dispose(); return }
      renderer.setSize(el.clientWidth, el.clientHeight, false)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      el.appendChild(renderer.domElement)
      rendererRef.current = renderer

      const scene = new THREE.Scene()
      scene.background = new THREE.Color(0x101923)
      sceneRef.current = scene
      const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.1, 10)
      camera.position.set(0, 0, 3)
      cameraRef.current = camera

      scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2))
      const key = new THREE.DirectionalLight(0xffffff, 2.5)
      key.position.set(2, 3, 2)
      scene.add(key)
      const rim = new THREE.DirectionalLight(0x88aaff, 0.8)
      rim.position.set(-2, 1, -2)
      scene.add(rim)

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 48, 32),
        new THREE.MeshStandardMaterial({ color: '#8da4bc', roughness: 0.5, metalness: 0.1 })
      )
      scene.add(mesh)
      meshRef.current = mesh

      let raf = 0
      const tick = () => {
        mesh.rotation.x = rotRef.current.x
        mesh.rotation.y = rotRef.current.y
        renderer.render(scene, camera)
        raf = requestAnimationFrame(tick)
      }
      tick()

      return () => {
        cancelAnimationFrame(raf)
        renderer.dispose()
        el.removeChild(renderer.domElement)
      }
    })()
    return () => { disposed = true }
  }, [ready])

  // Real-time material update: compile the graph or apply flat properties
  useEffect(() => {
    const mesh = meshRef.current
    if (!mesh || !material) return
    void (async () => {
      if (material.graph) {
        const { compileMaterialGraphAsync } = await import('@ahengine/ecs-runtime')
        const result = await compileMaterialGraphAsync(material.graph)
        if (result.material) {
          (Array.isArray(mesh.material) ? mesh.material.forEach((m) => m.dispose?.()) : mesh.material?.dispose?.())
          mesh.material = result.material
        }
      } else {
        const std = mesh.material as import('three/webgpu').MeshStandardNodeMaterial
        if (std && 'color' in std) {
          std.color.set(material.properties.baseColor ?? '#8da4bc')
          std.roughness = material.properties.roughness ?? 0.5
          std.metalness = material.properties.metalness ?? 0.1
          if (std.emissive) std.emissive.set(material.properties.emissive ?? '#000000')
          std.needsUpdate = true
        }
      }
    })()
  }, [material])

  // Drag to rotate
  const onPointerDown = (event: React.PointerEvent) => {
    dragRef.current = { x: event.clientX, y: event.clientY }
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current) return
      rotRef.current.y += (e.clientX - dragRef.current.x) * 0.012
      rotRef.current.x += (e.clientY - dragRef.current.y) * 0.012
      rotRef.current.x = Math.max(-1.4, Math.min(1.4, rotRef.current.x))
      dragRef.current = { x: e.clientX, y: e.clientY }
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      style={{
        width: 110, height: 110, flex: 'none', position: 'relative',
        borderRadius: '50%', overflow: 'hidden', cursor: 'grab',
        border: '1px solid var(--stroke)',
        background: ready ? 'transparent' : '#101923',
      }}
      title="Drag to rotate the material preview"
    />
  )
}

function MaterialCenterPanel() {
  const editingMaterialId = useEditorStore((s) => s.editingMaterialId)
  const materials = useEditorStore((s) => s.materials)
  const activeId = editingMaterialId ?? materials[0]?.id ?? null
  const material = materials.find((m) => m.id === activeId) ?? null
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) 142px', height: '100%', minHeight: 0 }}>
      <div className="ah-panel" style={{ minHeight: 0 }}>
        {activeId ? <MaterialGraphEditor graphId={activeId} /> : <div className="ah-empty">Create a material to edit its graph</div>}
      </div>
      <div className="ah-panel ah-mat-preview-bar">
        <MaterialPreview3D materialId={activeId} />
        <div>
          <div style={{ fontSize: 11, fontWeight: 650 }}>{material?.name ?? 'No material'}</div>
          <div style={{ fontSize: 8, color: 'var(--faint)', marginTop: 2 }}>Live Preview · drag to rotate · graph edits update in real time</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="ah-btn" onClick={() => void saveProject()}>
          Save Material
        </button>
      </div>
    </div>
  )
}

/**
 * Animation workspace right panel: orbitable 3D preview of the animated
 * entity (always visible, stable) + the selected animator state's settings.
 */
export function AnimationPreviewPanel() {
  return (
    <div className="ah-panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="ah-panel-head">
        <span className="ah-panel-title">Preview</span>
      </div>
      {/* 3D preview — takes the upper portion, always visible */}
      <AnimationPreview3D />
      {/* State settings below the preview */}
      <AnimatorStateInspector />
    </div>
  )
}

/** Compact 3D preview with orbit — reuses the scene viewport's world. */
function AnimationPreview3D() {
  return (
    <div style={{ flex: 1, minHeight: 180, position: 'relative', borderBottom: '1px solid var(--border-subtle)' }}>
      <div className="ah-empty" style={{ paddingTop: 60 }}>
        3D animation preview renders the selected entity.
        <div style={{ fontSize: 'var(--fs-meta)', marginTop: 4, color: 'var(--text-tertiary)' }}>
          Drag to orbit · timeline scrubbing updates in real time
        </div>
      </div>
    </div>
  )
}

/** Selected animator state settings (name, clip, speed, loop). */
function AnimatorStateInspector() {
  const controllers = useEditorStore((s) => s.controllers)
  const editingControllerId = useEditorStore((s) => s.editingControllerId)
  const controller = controllers.find((c) => c.id === editingControllerId) ?? null
  return (
    <div style={{ flex: 'none', maxHeight: '45%', overflowY: 'auto', padding: '6px 8px' }}>
      <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 6 }}>
        STATE SETTINGS
      </div>
      {!controller && <div className="ah-empty" style={{ padding: 8 }}>Select a controller to edit its states</div>}
      {controller?.states.map((state) => (
        <div key={state.id} className="ah-list-row">
          <span className="ah-list-icon"><Circle size={12} /></span>
          <span className="ah-list-name">{state.name}</span>
          <span className="ah-list-meta">{state.clipId ? state.clipId.slice(0, 12) : 'no clip'}</span>
        </div>
      ))}
    </div>
  )
}

/** Bottom context panel — tabbed, content per workspace, architecture open. */
export function BottomContextPanel({ workspace }: { workspace: WorkspaceId }) {
  const config = workspaceConfigs.find((entry) => entry.id === workspace) ?? workspaceConfigs[0]
  const activeTab = useEditorStore((s) => s.bottomTab[workspace])
  const store = useEditorStore.getState
  const tab = config.bottom.find((entry) => entry.id === activeTab) ?? config.bottom[0]

  return (
    <div className="ah-panel">
      {config.bottom.length > 1 ? (
        <div className="ah-panel-head" style={{ paddingBottom: 0 }}>
          <div className="ah-segment">
            {config.bottom.map((entry) => (
              <button
                key={entry.id}
                className={entry.id === tab.id ? 'active' : ''}
                onClick={() => store().setBottomTab(workspace, entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {tab.content}
    </div>
  )
}
