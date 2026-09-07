import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Square, Plus, Trash2, Zap, ChevronRight, Circle } from 'lucide-react'
import type {
  AnimatorControllerV2, AnimatorState, AnimatorTransition, AnimatorParameter,
  AnimatorConditionOperator,
} from '@ahengine/project-schema'
import { validOperatorsFor } from '@ahengine/project-schema'
import { useEditorStore } from '@ahengine/editor-core'
import { IconButton } from '../ui/primitives.js'

/**
 * Animator State Machine workspace — graph of states with transitions.
 * Left: parameters. Center: state graph. Right: state/transition inspector.
 * Same visual language as Material graph (dark, compact, bezier edges).
 */

const stateId = () => `state-${crypto.randomUUID().slice(0, 8)}`
const transId = () => `tr-${crypto.randomUUID().slice(0, 8)}`
const paramId = () => `param-${crypto.randomUUID().slice(0, 8)}`

export function AnimatorWorkspace() {
  const controllers = useEditorStore((s) => s.controllers)
  const animationClips = useEditorStore((s) => s.animations)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null)
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState<{ fromStateId: string } | null>(null)
  const [previewState, setPreviewState] = useState<string | null>(null)

  const controller = controllers.find((c) => c.id === activeId) ?? null

  const updateController = useCallback((next: AnimatorControllerV2) => {
    const s = useEditorStore.getState()
    s.setControllers(s.controllers.map((c) => (c.id === next.id ? next : c)))
  }, [])

  return (
    <div className="ah-anim-workspace" style={{ flexDirection: 'row' }}>
      {/* Left: Parameters + controller list */}
      <div className="ah-panel" style={{ width: 200, flex: 'none' }}>
        <div className="ah-panel-head">
          <span className="ah-panel-title">Animator</span>
          <IconButton small icon={<Plus size={13} />} label="New controller" onClick={() => {
            const id = `ac-${crypto.randomUUID().slice(0, 8)}`
            const entryId = stateId()
            const s = useEditorStore.getState()
            const newCtrl: AnimatorControllerV2 = {
              format: 'koota-3d-animator',
              schemaVersion: 1,
              id,
              name: `Controller ${s.controllers.length + 1}`,
              parameters: [{ id: paramId(), name: 'speed', type: 'float', defaultValue: 0 }],
              states: [{ id: entryId, name: 'Idle', clipId: null, speed: 1, loop: true, position: [300, 180] }],
              transitions: [],
              entryStateId: entryId,
            }
            s.setControllers([...s.controllers, newCtrl])
            setActiveId(id)
          }} />
        </div>
        <div className="ah-panel-body" style={{ overflow: 'visible' }}>
          {controllers.map((c) => (
            <div key={c.id} className={`ah-list-row ${c.id === activeId ? 'focused' : ''}`}
              onClick={() => { setActiveId(c.id); setSelectedStateId(null); setSelectedTransitionId(null) }}>
              <span className="ah-list-name">{c.name}</span>
              <span className="ah-list-meta">{(c as AnimatorControllerV2).states?.length ?? 0} st</span>
            </div>
          ))}
          {controllers.length === 0 && <div className="ah-empty">Create a controller</div>}
        </div>

        {/* Parameters section */}
        {controller && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', padding: 'var(--sp-2)', flex: 1, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
              <span style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', flex: 1 }}>PARAMETERS</span>
              <IconButton small icon={<Plus size={11} />} label="Add parameter" onClick={() => {
                updateController({ ...controller, parameters: [...controller.parameters, { id: paramId(), name: `param${controller.parameters.length}`, type: 'float', defaultValue: 0 }] })
              }} />
            </div>
            {controller.parameters.map((param) => (
              <div key={param.id} className="ah-list-row" style={{ cursor: 'default', paddingLeft: 8 }}>
                <span style={{ fontSize: 'var(--fs-tiny)', color: param.type === 'trigger' ? '#e2a44c' : param.type === 'bool' ? '#6ba8ff' : 'var(--text-tertiary)', width: 36 }}>
                  {param.type}
                </span>
                <span className="ah-list-name">{param.name}</span>
                <button className="ah-icon-btn small" style={{ width: 16, height: 16 }} onClick={() => {
                  updateController({ ...controller, parameters: controller.parameters.filter((p) => p.id !== param.id) })
                }}><Trash2 size={9} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Center: state graph */}
      {controller ? (
        <AnimatorGraph
          controller={controller}
          clips={animationClips}
          selectedStateId={selectedStateId}
          selectedTransitionId={selectedTransitionId}
          previewStateId={previewState}
          connecting={connecting}
          onSelectState={setSelectedStateId}
          onSelectTransition={setSelectedTransitionId}
          onConnectStart={(id) => setConnecting({ fromStateId: id })}
          onConnectEnd={(toId) => {
            if (connecting && connecting.fromStateId !== toId) {
              const tr: AnimatorTransition = { id: transId(), from: connecting.fromStateId, to: toId, duration: 0.2, exitTime: -1, conditions: [] }
              updateController({ ...controller, transitions: [...controller.transitions, tr] })
            }
            setConnecting(null)
          }}
          onMoveState={(id, pos) => updateController({ ...controller, states: controller.states.map((s) => (s.id === id ? { ...s, position: pos } : s)) })}
          onControllerChange={updateController}
        />
      ) : (
        <div className="ah-empty" style={{ flex: 1 }}>
          <Zap size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>Create or select an animator controller</div>
        </div>
      )}

      {/* Right: state/transition inspector */}
      {controller && (
        <AnimatorInspector
          controller={controller}
          clips={animationClips}
          selectedStateId={selectedStateId}
          selectedTransitionId={selectedTransitionId}
          previewStateId={previewState}
          onPreviewState={setPreviewState}
          onControllerChange={updateController}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* State Graph — nodes + bezier edges (same visual language as Material) */
/* ------------------------------------------------------------------ */

function AnimatorGraph({
  controller, clips, selectedStateId, selectedTransitionId, previewStateId,
  connecting, onSelectState, onSelectTransition, onConnectStart, onConnectEnd,
  onMoveState, onControllerChange,
}: {
  controller: AnimatorControllerV2
  clips: unknown[]
  selectedStateId: string | null
  selectedTransitionId: string | null
  previewStateId: string | null
  connecting: { fromStateId: string } | null
  onSelectState: (id: string | null) => void
  onSelectTransition: (id: string | null) => void
  onConnectStart: (id: string) => void
  onConnectEnd: (id: string) => void
  onMoveState: (id: string, pos: [number, number]) => void
  onControllerChange: (c: AnimatorControllerV2) => void
}) {
  const dragRef = useRef<{ stateId: string; startX: number; startY: number; origX: number; origY: number } | null>(null)
  const states = controller.states as (AnimatorState & { position?: [number, number] })[]

  const addState = () => {
    const id = stateId()
    onControllerChange({
      ...controller,
      states: [...states, { id, name: `State ${states.length + 1}`, clipId: null, speed: 1, loop: true, position: [100 + Math.random() * 200, 120 + Math.random() * 120] }],
    })
    onSelectState(id)
  }

  return (
    <div className="ah-anim-timeline" style={{ flex: 1, position: 'relative', overflow: 'hidden', cursor: connecting ? 'crosshair' : 'default' }}>
      {/* Add State button */}
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}>
        <button className="ah-btn" onClick={addState}><Plus size={12} /> Add State</button>
      </div>

      {/* SVG edges */}
      <svg className="ah-graph-edges" width="100%" height="100%">
        <defs>
          <marker id="anim-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
            <path d="M0,0 L8,4 L0,8 Z" fill="var(--accent)" opacity="0.7" />
          </marker>
        </defs>
        {/* Entry → entryState edge */}
        {(() => {
          const entryState = states.find((s) => s.id === controller.entryStateId)
          if (!entryState?.position) return null
          return (
            <line
              x1={60} y1={100}
              x2={entryState.position[0]} y2={entryState.position[1] + 20}
              stroke="#7dd8a8" strokeWidth="1.4" markerEnd="url(#anim-arrow)" opacity="0.6"
            />
          )
        })()}
        {/* Transitions */}
        {controller.transitions.map((tr) => {
          const from = states.find((s) => s.id === tr.from)
          const to = states.find((s) => s.id === tr.to)
          if (!from?.position || !to?.position) return null
          const x1 = from.position[0] + 160, y1 = from.position[1] + 18
          const x2 = to.position[0], y2 = to.position[1] + 18
          const midX = (x1 + x2) / 2
          const isSel = selectedTransitionId === tr.id
          return (
            <path
              key={tr.id}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              stroke={isSel ? 'var(--accent)' : 'var(--text-tertiary)'}
              strokeWidth={isSel ? 2 : 1.2}
              fill="none" markerEnd="url(#anim-arrow)" opacity="0.7"
              style={{ cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onSelectTransition(tr.id); onSelectState(null) }}
            />
          )
        })}
      </svg>

      {/* Entry node */}
      <div className="ah-graph-node entry" style={{ left: 20, top: 82 }}>
        Entry
      </div>

      {/* State nodes */}
      {states.map((state) => {
        const pos = state.position ?? [100, 100]
        const isEntry = state.id === controller.entryStateId
        const isPreview = previewStateId === state.id
        return (
          <div
            key={state.id}
            className={`ah-graph-node ${selectedStateId === state.id ? 'selected' : ''} ${isPreview ? 'preview-active' : ''}`}
            style={{ left: pos[0], top: pos[1], borderColor: isEntry ? '#7dd8a8' : undefined }}
            onPointerDown={(e) => {
              onSelectState(state.id); onSelectTransition(null)
              dragRef.current = { stateId: state.id, startX: e.clientX, startY: e.clientY, origX: pos[0], origY: pos[1] }
              const move = (ev: PointerEvent) => {
                if (!dragRef.current) return
                onMoveState(state.id, [
                  dragRef.current.origX + (ev.clientX - dragRef.current.startX),
                  dragRef.current.origY + (ev.clientY - dragRef.current.startY),
                ])
              }
              const up = () => {
                dragRef.current = null
                window.removeEventListener('pointermove', move)
                window.removeEventListener('pointerup', up)
              }
              window.addEventListener('pointermove', move)
              window.addEventListener('pointerup', up)
            }}
            onDoubleClick={() => onConnectStart(state.id)}
            onClick={() => {
              if (connecting && connecting.fromStateId !== state.id) onConnectEnd(state.id)
            }}
          >
            <div className="ah-graph-node-header" style={{ borderColor: isEntry ? 'rgba(125, 216, 168, 0.3)' : undefined }}>
              <span>{state.name}</span>
              {isEntry && <span style={{ color: '#7dd8a8', fontSize: 9, fontWeight: 700 }}>ENTRY</span>}
              {isPreview && <Circle size={8} fill="#e2a44c" style={{ color: '#e2a44c' }} />}
            </div>
            <div className="ah-graph-node-body" style={{ padding: '4px 10px' }}>
              <span style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)' }}>
                {state.clipId ? clips.find((c) => (c as { id: string }).id === state.clipId)?.['name'] ?? state.clipId : 'no clip'}
              </span>
            </div>
            {/* Connect handle (right edge) */}
            <div
              className="ah-port"
              style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)' }}
              onPointerDown={(e) => { e.stopPropagation(); onConnectStart(state.id) }}
              onPointerUp={(e) => { e.stopPropagation(); onConnectEnd(state.id) }}
              title="Drag to connect to another state"
            />
          </div>
        )
      })}

      {connecting && (
        <div style={{ position: 'absolute', bottom: 8, left: '50%', transform: 'translateX(-50%)', fontSize: 'var(--fs-meta)', color: 'var(--accent)' }}>
          Click target state to connect… (Esc to cancel)
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inspector — state/transition editing                                */
/* ------------------------------------------------------------------ */

function AnimatorInspector({
  controller, clips, selectedStateId, selectedTransitionId,
  previewStateId, onPreviewState, onControllerChange,
}: {
  controller: AnimatorControllerV2
  clips: { id: string; name: string }[]
  selectedStateId: string | null
  selectedTransitionId: string | null
  previewStateId: string | null
  onPreviewState: (id: string | null) => void
  onControllerChange: (c: AnimatorControllerV2) => void
}) {
  const state = controller.states.find((s) => s.id === selectedStateId)
  const transition = controller.transitions.find((t) => t.id === selectedTransitionId)

  if (transition) {
    return (
      <div className="ah-mat-graph-inspector">
        <div className="ah-panel-head"><span className="ah-panel-title">Transition</span></div>
        <div className="ah-panel-body" style={{ padding: '8px 12px', gap: 6 }}>
          <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-dim)' }}>
            {controller.states.find((s) => s.id === transition.from)?.name} → {controller.states.find((s) => s.id === transition.to)?.name}
          </div>
          <div className="ah-field">
            <label>Duration</label>
            <input className="ah-input" type="number" step="0.05" defaultValue={transition.duration}
              onBlur={(e) => onControllerChange({ ...controller, transitions: controller.transitions.map((t) => t.id === transition.id ? { ...t, duration: Math.max(0, parseFloat(e.target.value) || 0) } : t) })} />
          </div>
          <div className="ah-field">
            <label>Exit Time</label>
            <input className="ah-input" type="number" step="0.05" min="-1" max="1" defaultValue={transition.exitTime}
              onBlur={(e) => onControllerChange({ ...controller, transitions: controller.transitions.map((t) => t.id === transition.id ? { ...t, exitTime: Math.max(-1, parseFloat(e.target.value) || -1) } : t) })} />
          </div>
          <div className="ah-menu-sep" />
          <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)' }}>CONDITIONS</div>
          {transition.conditions.map((cond, i) => {
            const param = controller.parameters.find((p) => p.id === cond.parameterId)
            return (
              <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--fs-meta)', flex: 1 }}>{param?.name ?? cond.parameterId} {cond.operator} {String(cond.value ?? '')}</span>
                <button className="ah-icon-btn small" style={{ width: 18, height: 18 }} onClick={() => {
                  onControllerChange({ ...controller, transitions: controller.transitions.map((t) => t.id === transition.id ? { ...t, conditions: t.conditions.filter((_, j) => j !== i) } : t) })
                }}><Trash2 size={10} /></button>
              </div>
            )
          })}
          {/* Add condition */}
          {controller.parameters.length > 0 && (
            <div style={{ display: 'flex', gap: 4 }}>
              <select className="ah-input" style={{ flex: 1 }} defaultValue={controller.parameters[0].id} onChange={(e) => {
                const param = controller.parameters.find((p) => p.id === e.target.value)
                if (!param) return
                const ops = validOperatorsFor(param.type)
                const cond = { parameterId: param.id, operator: ops[0] as AnimatorConditionOperator, value: param.type === 'bool' ? true : 0.5 }
                onControllerChange({ ...controller, transitions: controller.transitions.map((t) => t.id === transition.id ? { ...t, conditions: [...t.conditions, cond] } : t) })
              }}>
                {controller.parameters.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <button className="ah-btn" style={{ padding: '0 8px' }}><Plus size={11} /></button>
            </div>
          )}
          <div className="ah-menu-sep" />
          <button className="ah-menu-item" style={{ color: '#e2574c' }} onClick={() => {
            onControllerChange({ ...controller, transitions: controller.transitions.filter((t) => t.id !== transition.id) })
          }}><Trash2 size={12} /> Delete Transition</button>
        </div>
      </div>
    )
  }

  if (state) {
    return (
      <div className="ah-mat-graph-inspector">
        <div className="ah-panel-head"><span className="ah-panel-title">State</span></div>
        <div className="ah-panel-body" style={{ padding: '8px 12px', gap: 6 }}>
          <div className="ah-field">
            <label>Name</label>
            <input className="ah-input" defaultValue={state.name} key={state.id}
              onBlur={(e) => onControllerChange({ ...controller, states: controller.states.map((s) => s.id === state.id ? { ...s, name: e.target.value.trim() || s.name } : s) })} />
          </div>
          <div className="ah-field">
            <label>Clip</label>
            <select className="ah-input" value={state.clipId ?? ''} onChange={(e) => {
              const clipId = e.target.value || null
              onControllerChange({ ...controller, states: controller.states.map((s) => s.id === state.id ? { ...s, clipId } : s) })
            }}>
              <option value="">— none —</option>
              {clips.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="ah-field">
            <label>Speed</label>
            <input className="ah-input" type="number" step="0.05" defaultValue={state.speed} key={state.id + 'spd'}
              onBlur={(e) => onControllerChange({ ...controller, states: controller.states.map((s) => s.id === state.id ? { ...s, speed: parseFloat(e.target.value) || 1 } : s) })} />
          </div>
          <label className="ah-check">
            <input type="checkbox" checked={state.loop} onChange={(e) =>
              onControllerChange({ ...controller, states: controller.states.map((s) => s.id === state.id ? { ...s, loop: e.target.checked } : s) })
            } /> Loop
          </label>
          <div className="ah-menu-sep" />
          {controller.entryStateId !== state.id && (
            <button className="ah-btn" style={{ width: '100%', justifyContent: 'center' }} onClick={() =>
              onControllerChange({ ...controller, entryStateId: state.id })
            }>Set as Default</button>
          )}
          <button className={`ah-btn ${previewStateId === state.id ? 'primary' : ''}`} style={{ width: '100%', justifyContent: 'center' }} onClick={() =>
            onPreviewState(previewStateId === state.id ? null : state.id)
          }>
            <Play size={11} /> {previewStateId === state.id ? 'Previewing' : 'Preview State'}
          </button>
          <button className="ah-menu-item" style={{ color: '#e2574c' }} onClick={() => {
            onControllerChange({ ...controller, states: controller.states.filter((s) => s.id !== state.id), transitions: controller.transitions.filter((t) => t.from !== state.id && t.to !== state.id) })
          }}><Trash2 size={12} /> Delete State</button>
        </div>
      </div>
    )
  }

  return (
    <div className="ah-mat-graph-inspector">
      <div className="ah-empty" style={{ marginTop: 20 }}>Select a state or transition</div>
    </div>
  )
}
