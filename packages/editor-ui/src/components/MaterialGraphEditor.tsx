import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WebGPURenderer, MeshStandardNodeMaterial } from 'three/webgpu'
import { Plus, Search, Trash2, Copy, X } from 'lucide-react'
import type { MaterialGraph, MaterialGraphNode, MaterialGraphConnection, SocketType } from '@ahengine/project-schema'
import { getNodeTypeDef, nodesByCategory, compileMaterialGraphAsync, type NodeTypeDef } from '@ahengine/ecs-runtime'
import { useEditorStore, materialService } from '@ahengine/editor-core'
import { IconButton } from '../ui/primitives.js'

/**
 * Material Graph Editor — node-based TSL material authoring.
 * Dark spatial canvas matching the editor design. Custom SVG edges (no React Flow).
 * Left: material list. Center: node canvas. Right: node inspector.
 * Bottom of center: live preview (sphere/cube/plane + env toggle).
 */

/* ---- Type compatibility for connections ---- */
function socketCompatible(from: SocketType, to: SocketType): boolean {
  if (from === to) return true
  // float → anything numeric
  if (from === 'float' && ['float', 'vec2', 'vec3', 'vec4', 'color'].includes(to)) return true
  // color → vec3/vec4
  if (from === 'color' && ['vec3', 'vec4', 'color'].includes(to)) return true
  // vec → wider vec
  if (from === 'vec2' && ['vec2', 'vec3', 'vec4'].includes(to)) return true
  if (from === 'vec3' && ['vec3', 'vec4', 'color'].includes(to)) return true
  if (from === 'vec4' && ['vec4', 'color'].includes(to)) return true
  return false
}

export function MaterialGraphWorkspace() {
  const materials = useEditorStore((s) => s.materials)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const activeId = selectedId ?? materials[0]?.id ?? null
  const material = materials.find((m) => m.id === activeId)

  return (
    <div className="ah-panel-body" style={{ flexDirection: 'row' }}>
      {/* Left: material chips */}
      <div className="ah-lib-list" style={{ width: 140 }}>
        <button className="ah-btn" style={{ justifyContent: 'center' }} onClick={() => {
          const id = `mat-${crypto.randomUUID().slice(0, 8)}`
          const s = useEditorStore.getState()
          s.setMaterials([...s.materials, { id, name: `Graph ${s.materials.length + 1}`, type: 'standard' as const, properties: {}, graph: undefined } as never])
          setSelectedId(id)
        }}>
          <Plus size={13} /> New Graph
        </button>
        {materials.map((m) => (
          <div key={m.id} className={`ah-list-row ${m.id === activeId ? 'focused' : ''}`} onClick={() => setSelectedId(m.id)}>
            <span className="ah-mat-swatch" style={{ background: (m as { graph?: MaterialGraph }).graph ? 'linear-gradient(135deg,#5d55a5,#7d7dd9)' : '#888' }} />
            <span className="ah-list-name">{m.name}</span>
          </div>
        ))}
      </div>
      {activeId ? <MaterialGraphEditor graphId={activeId} /> : <div className="ah-empty" style={{ flex: 1 }}>Create a material graph</div>}
    </div>
  )
}

export function MaterialGraphEditor({ graphId }: { graphId: string }) {
  const materials = useEditorStore((s) => s.materials)
  const material = materials.find((m) => m.id === graphId)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [connections, setConnections] = useState<MaterialGraphConnection[]>([])
  const [nodes, setNodes] = useState<MaterialGraphNode[]>([])
  const [connecting, setConnecting] = useState<{ nodeId: string; socketId: string; type: 'out' | 'in' } | null>(null)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [addMenuQuery, setAddMenuQuery] = useState('')
  const [compileErrors, setCompileErrors] = useState<string[]>([])
  const canvasRef = useRef<HTMLDivElement>(null)

  // Initialize from material's graph (or create default output node)
  useEffect(() => {
    if (material?.graph) {
      setNodes(material.graph.nodes)
      setConnections(material.graph.connections)
    } else {
      // Default: output node only
      setNodes([{
        id: 'output',
        type: 'output.material',
        position: [400, 200],
        inputs: getNodeTypeDef('output.material')?.inputs?.map(i => ({ type: i.type, label: i.label })),
        outputs: [],
        values: {},
      }])
      setConnections([])
    }
  }, [graphId, material?.graph])

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId), [nodes, selectedNodeId])
  const outputNode = nodes.find((n) => n.type === 'output.material')

  /* ---- Node operations ---- */
  const addNode = useCallback((type: string) => {
    const def = getNodeTypeDef(type)
    if (!def) return
    const id = `node-${crypto.randomUUID().slice(0, 8)}`
    const newNode: MaterialGraphNode = {
      id,
      type,
      position: [100 + Math.random() * 200, 100 + Math.random() * 200],
      inputs: def.inputs.map(i => ({ type: i.type, label: i.label })),
      outputs: def.outputs.map(o => ({ type: o.type, label: o.label })),
      values: { ...def.defaults },
    }
    setNodes(prev => [...prev, newNode])
    setSelectedNodeId(id)
    setShowAddMenu(false)
  }, [])

  const deleteNode = useCallback((nodeId: string) => {
    if (nodeId === 'output') return // can't delete output
    setNodes(prev => prev.filter(n => n.id !== nodeId))
    setConnections(prev => prev.filter(c => c.fromNode !== nodeId && c.toNode !== nodeId))
    if (selectedNodeId === nodeId) setSelectedNodeId(null)
  }, [selectedNodeId])

  const moveNode = useCallback((nodeId: string, position: [number, number]) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, position } : n))
  }, [])

  const connect = useCallback((fromNode: string, fromSocket: string, toNode: string, toSocket: string) => {
    // Type check
    const fromDef = nodes.find(n => n.id === fromNode)
    const toDef = nodes.find(n => n.id === toNode)
    const fromType = getNodeTypeDef(fromDef?.type ?? '')?.outputs.find(o => o.id === fromSocket)?.type
    const toType = getNodeTypeDef(toDef?.type ?? '')?.inputs.find(i => i.id === toSocket)?.type
    if (fromType && toType && !socketCompatible(fromType, toType)) {
      setCompileErrors([`Cannot connect ${fromType} → ${toType}`])
      return
    }
    // Remove existing connection to same input (one wire per input)
    setConnections(prev => [
      ...prev.filter(c => !(c.toNode === toNode && c.toSocket === toSocket)),
      { fromNode, fromSocket, toNode, toSocket },
    ])
    setCompileErrors([])
  }, [nodes])

  const disconnect = useCallback((fromNode: string, fromSocket: string, toNode: string, toSocket: string) => {
    setConnections(prev => prev.filter(c => !(c.fromNode === fromNode && c.fromSocket === fromSocket && c.toNode === toNode && c.toSocket === toSocket)))
  }, [])

  /* ---- Compile + save graph back to material ---- */
  const compileNow = useCallback(async () => {
    if (!outputNode || !material) return
    const graph: MaterialGraph = {
      format: 'koota-3d-material-graph',
      schemaVersion: 1,
      id: material.id,
      name: material.name,
      nodes,
      connections,
      outputNodeId: outputNode.id,
      settings: {},
    }
    const result = await compileMaterialGraphAsync(graph)
    setCompileErrors(result.errors)
    // Update the material's graph data (editor-only; MaterialService rebuilds on next frame)
    const updated = { ...material, graph } as typeof material
    const s = useEditorStore.getState()
    s.setMaterials(s.materials.map(m => m.id === material.id ? updated : m))
  }, [nodes, connections, outputNode, material])

  // Debounced compile (not during node drag)
  const compileTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scheduleCompile = useCallback(() => {
    if (compileTimer.current) clearTimeout(compileTimer.current)
    compileTimer.current = setTimeout(() => void compileNow(), 500)
  }, [compileNow])

  useEffect(() => { scheduleCompile() }, [nodes, connections])

  /* ---- Keyboard ---- */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ' && !showAddMenu) { e.preventDefault(); setShowAddMenu(true) }
      if (e.key === 'Delete' && selectedNodeId) deleteNode(selectedNodeId)
      if (e.key === 'Escape') setShowAddMenu(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedNodeId, showAddMenu, deleteNode])

  const categories = useMemo(() => nodesByCategory(), [])

  return (
    <div className="ah-mat-graph-editor">
      {/* Center: node canvas + preview */}
      <div className="ah-mat-graph-center">
        <div
          className="ah-node-canvas"
          ref={canvasRef}
          onContextMenu={(e) => { e.preventDefault(); setShowAddMenu(true) }}
          style={{ flex: 1 }}
        >
          {/* SVG edges */}
          <svg className="ah-graph-edges" width="100%" height="100%">
            {connections.map((conn, i) => {
              const from = nodes.find(n => n.id === conn.fromNode)
              const to = nodes.find(n => n.id === conn.toNode)
              if (!from || !to) return null
              const fromDef = getNodeTypeDef(from.type)
              const toDef = getNodeTypeDef(to.type)
              const outIdx = fromDef?.outputs.findIndex(o => o.id === conn.fromSocket) ?? 0
              const inIdx = toDef?.inputs.findIndex(o => o.id === conn.toSocket) ?? 0
              const x1 = from.position[0] + 180 // node width
              const y1 = from.position[1] + 24 + outIdx * 24
              const x2 = to.position[0]
              const y2 = to.position[1] + 24 + inIdx * 24
              const midX = (x1 + x2) / 2
              return (
                <path
                  key={i}
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  stroke="var(--accent)"
                  strokeWidth="1.5"
                  fill="none"
                  opacity="0.7"
                  onClick={() => disconnect(conn.fromNode, conn.fromSocket, conn.toNode, conn.toSocket)}
                  style={{ cursor: 'pointer' }}
                />
              )
            })}
          </svg>

          {/* Nodes */}
          {nodes.map((node) => (
            <GraphNode
              key={node.id}
              node={node}
              selected={node.id === selectedNodeId}
              onSelect={() => setSelectedNodeId(node.id)}
              onMove={(pos) => moveNode(node.id, pos)}
              onConnectStart={(socketId, dir) => setConnecting({ nodeId: node.id, socketId, type: dir })}
              onConnectEnd={(socketId, dir) => {
                if (!connecting) return
                if (connecting.type === 'out' && dir === 'in') {
                  connect(connecting.nodeId, connecting.socketId, node.id, socketId)
                } else if (connecting.type === 'in' && dir === 'out') {
                  connect(node.id, socketId, connecting.nodeId, connecting.socketId)
                }
                setConnecting(null)
              }}
              onDelete={() => deleteNode(node.id)}
            />
          ))}

          {/* Add menu */}
          {showAddMenu && (
            <div className="ah-add-node-menu">
              <div className="ah-search" style={{ margin: 8 }}>
                <Search size={12} />
                <input autoFocus placeholder="Search nodes…" value={addMenuQuery} onChange={e => setAddMenuQuery(e.target.value)} />
              </div>
              {Object.entries(categories).map(([cat, defs]) => {
                const filtered = defs.filter(d => d.label.toLowerCase().includes(addMenuQuery.toLowerCase()) || d.type.includes(addMenuQuery.toLowerCase()))
                if (filtered.length === 0) return null
                return (
                  <div key={cat}>
                    <div className="ah-menu-label">{cat}</div>
                    {filtered.map(def => (
                      <button key={def.type} className="ah-menu-item" onClick={() => addNode(def.type)}>
                        {def.label}
                      </button>
                    ))}
                  </div>
                )
              })}
              <div className="ah-menu-sep" />
              <button className="ah-menu-item" onClick={() => setShowAddMenu(false)}>Close (Esc)</button>
            </div>
          )}

          {/* Errors */}
          {compileErrors.length > 0 && (
            <div className="ah-graph-errors">
              {compileErrors.map((err, i) => <div key={i}>{err}</div>)}
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="ah-mat-preview-bar">
          <MaterialPreview graph={useMemo(() => ({
            format: 'koota-3d-material-graph',
            schemaVersion: 1,
            id: material?.id ?? 'preview',
            name: material?.name ?? 'Preview',
            nodes, connections,
            outputNodeId: outputNode?.id ?? 'output',
            settings: {},
          }), [nodes, connections, outputNode, material])} />
        </div>
      </div>

      {/* Right: node inspector */}
      <div className="ah-mat-graph-inspector">
        {selectedNode ? (
          <NodeInspector node={selectedNode} onChange={(values) => {
            setNodes(prev => prev.map(n => n.id === selectedNode.id ? { ...n, values: { ...n.values, ...values } } : n))
          }} />
        ) : (
          <div className="ah-empty">Select a node to edit</div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* GraphNode — visual node on the canvas                               */
/* ------------------------------------------------------------------ */

function GraphNode({
  node, selected, onSelect, onMove, onConnectStart, onConnectEnd, onDelete,
}: {
  node: MaterialGraphNode
  selected: boolean
  onSelect: () => void
  onMove: (position: [number, number]) => void
  onConnectStart: (socketId: string, dir: 'in' | 'out') => void
  onConnectEnd: (socketId: string, dir: 'in' | 'out') => void
  onDelete: () => void
}) {
  const def = getNodeTypeDef(node.type)
  const dragRef = useRef<{ startX: number; startY: number; nodeX: number; nodeY: number } | null>(null)

  const handlePointerDown = (e: React.PointerEvent) => {
    onSelect()
    dragRef.current = { startX: e.clientX, startY: e.clientY, nodeX: node.position[0], nodeY: node.position[1] }
    const move = (ev: PointerEvent) => {
      if (!dragRef.current) return
      const dx = ev.clientX - dragRef.current.startX
      const dy = ev.clientY - dragRef.current.startY
      onMove([dragRef.current.nodeX + dx, dragRef.current.nodeY + dy])
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div
      className={`ah-graph-node ${selected ? 'selected' : ''}`}
      style={{ left: node.position[0], top: node.position[1] }}
      onPointerDown={handlePointerDown}
    >
      <div className="ah-graph-node-header">
        <span>{def?.label ?? node.type}</span>
        {node.id !== 'output' && (
          <button className="ah-icon-btn small" onPointerDown={e => e.stopPropagation()} onClick={onDelete}>
            <X size={11} />
          </button>
        )}
      </div>
      <div className="ah-graph-node-body">
        {def?.inputs.map((input, i) => (
          <div key={input.id} className="ah-graph-socket in" style={{ top: 24 + i * 24 }}>
            <span
              className="ah-port"
              data-type={input.type}
              onPointerDown={(e) => { e.stopPropagation(); onConnectStart(input.id, 'in') }}
              onPointerUp={(e) => { e.stopPropagation(); onConnectEnd(input.id, 'in') }}
            />
            <span className="ah-socket-label">{input.label || input.id}</span>
          </div>
        ))}
        {def?.outputs.map((output, i) => (
          <div key={output.id} className="ah-graph-socket out" style={{ top: 24 + i * 24 }}>
            <span className="ah-socket-label">{output.label || output.id}</span>
            <span
              className="ah-port"
              data-type={output.type}
              onPointerDown={(e) => { e.stopPropagation(); onConnectStart(output.id, 'out') }}
              onPointerUp={(e) => { e.stopPropagation(); onConnectEnd(output.id, 'out') }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* NodeInspector — edit selected node values                           */
/* ------------------------------------------------------------------ */

function NodeInspector({ node, onChange }: { node: MaterialGraphNode; onChange: (values: Record<string, unknown>) => void }) {
  const def = getNodeTypeDef(node.type)
  if (!def) return <div className="ah-empty">Unknown node type</div>

  const fields: React.ReactNode[] = []
  for (const [key, defaultVal] of Object.entries(def.defaults)) {
    const value = node.values?.[key] ?? defaultVal
    if (typeof defaultVal === 'string' && defaultVal.startsWith('#')) {
      fields.push(
        <div className="ah-field" key={key}>
          <label>{key}</label>
          <input type="color" value={String(value)} onChange={e => onChange({ [key]: e.target.value })} />
        </div>
      )
    } else if (typeof defaultVal === 'number') {
      fields.push(
        <div className="ah-field" key={key}>
          <label>{key}</label>
          <input className="ah-input" type="number" step="0.01" value={Number(value)} onChange={e => onChange({ [key]: parseFloat(e.target.value) || 0 })} />
        </div>
      )
    } else if (typeof defaultVal === 'string') {
      fields.push(
        <div className="ah-field" key={key}>
          <label>{key}</label>
          <input className="ah-input" value={String(value)} onChange={e => onChange({ [key]: e.target.value })} />
        </div>
      )
    }
  }

  return (
    <>
      <div className="ah-panel-head"><span className="ah-panel-title">{def.label}</span></div>
      <div className="ah-panel-body" style={{ padding: '8px 12px' }}>
        <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-tertiary)', marginBottom: 8 }}>{node.type}</div>
        {fields.length > 0 ? fields : <div className="ah-empty" style={{ padding: 8 }}>No editable values</div>}
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* MaterialPreview — live sphere/cube/plane render                     */
/* ------------------------------------------------------------------ */

function MaterialPreview({ graph }: { graph: MaterialGraph }) {
  const [shape, setShape] = useState<'sphere' | 'cube' | 'plane'>('sphere')
  const materialRef = useRef<MeshStandardNodeMaterial | null>(null)
  const [material, setMaterial] = useState<MeshStandardNodeMaterial | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  // Wait for the container to have real dimensions before mounting the
  // WebGPU Canvas — mounting at the default 300×150 then resizing causes a
  // depth-stencil size mismatch in WebGPURenderer.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    if (el.clientWidth > 10 && el.clientHeight > 10) {
      setReady(true)
      return
    }
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 10 && el.clientHeight > 10) {
        setReady(true)
        ro.disconnect()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    void compileMaterialGraphAsync(graph).then(result => {
      if (cancelled) return
      if (result.material) setMaterial(result.material)
      else if (result.errors.length > 0) console.warn('[material-preview]', result.errors)
    })
    return () => { cancelled = true }
  }, [graph])

  useEffect(() => { materialRef.current = material }, [material])

  const gl = useMemo(() => async (props: unknown) => {
    // Material preview uses the WebGL2 backend — WebGPURenderer's depth
    // buffer doesn't resize on CSS-only canvas resizes (three 0.185.1 bug),
    // which floods the console with GPUValidationErrors on this small panel.
    // Materials compile identically on both backends (TSL/NodeMaterial).
    const r = new WebGPURenderer({ ...(props as object), antialias: true, forceWebGL: true })
    await r.init()
    return r
  }, [])

  const geometry = useMemo(() => {
    switch (shape) {
      case 'cube': return <boxGeometry args={[1.4, 1.4, 1.4]} />
      case 'plane': return <planeGeometry args={[2, 2]} />
      default: return <sphereGeometry args={[1, 48, 32]} />
    }
  }, [shape])

  return (
    <div className="ah-mat-preview">
      <div className="ah-mat-preview-shape-bar">
        {(['sphere', 'cube', 'plane'] as const).map(s => (
          <button key={s} className={shape === s ? 'active' : ''} onClick={() => setShape(s)}>{s}</button>
        ))}
      </div>
      <div className="ah-mat-preview-canvas" ref={containerRef}>
        {ready ? (
          <Canvas gl={gl} camera={{ position: [0, 0.6, 3], fov: 40 }}>
            <ambientLight intensity={1.2} />
            <directionalLight position={[3, 4, 2]} intensity={2.2} />
            <directionalLight position={[-3, 2, -2]} intensity={0.6} color="#8fb4ff" />
            {material && <mesh material={material}>{geometry}</mesh>}
          </Canvas>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: 'var(--fs-meta)' }}>
            Preview…
          </div>
        )}
      </div>
    </div>
  )
}
