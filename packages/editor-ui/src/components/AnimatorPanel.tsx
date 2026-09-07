import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Entity } from 'koota'
import type { AnimatorController, AnimatorState, AnimatorTransition } from '@ahengine/project-schema'
import {
  Animator as AnimatorTrait,
  EntityMeta,
  ModelRenderer,
  findEntityByUuid,
  modelAnimationRegistry,
} from '@ahengine/ecs-runtime'
import { useEditorStore } from '@ahengine/editor-core'
import { Plus, Trash2, Link2 } from 'lucide-react'

/**
 * Animator tab: state machine graph + preview timeline.
 * Functional, not decorative — nodes and transitions edit real controller data.
 */

interface NodePosition {
  x: number
  y: number
}

export function AnimatorPanel({ hideTimeline = false }: { hideTimeline?: boolean }) {
  const controllers = useEditorStore((s) => s.controllers)
  const assets = useEditorStore((s) => s.assets)
  const world = useEditorStore((s) => s.world)
  const selection = useEditorStore((s) => s.selection)
  const [activeControllerId, setActiveControllerId] = useState<string | null>(null)
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null)
  const [selectedTransitionId, setSelectedTransitionId] = useState<string | null>(null)
  const [linkFrom, setLinkFrom] = useState<string | null>(null)
  const [positions, setPositions] = useState<Record<string, NodePosition>>({})
  const positionsRef = useRef(positions)
  positionsRef.current = positions

  const controller = controllers.find((c) => c.id === activeControllerId) ?? controllers[0] ?? null

  // Selected entity with an Animator drives the preview.
  const previewEntity: Entity | undefined = useMemo(() => {
    void selection
    for (const entity of world.query(AnimatorTrait)) return entity
    return undefined
  }, [world, selection])

  const modelAssetId = previewEntity?.get(ModelRenderer)?.assetId ?? ''
  const modelAsset = assets.find((a) => a.id === modelAssetId)

  const setController = useCallback(
    (next: AnimatorController) => {
      const store = useEditorStore.getState()
      store.setControllers(store.controllers.map((c) => (c.id === next.id ? next : c)))
    },
    []
  )

  const createController = () => {
    const store = useEditorStore.getState()
    const controller: AnimatorController = {
      format: 'koota-3d-animator',
      schemaVersion: 1,
      id: `anim-${crypto.randomUUID().slice(0, 8)}`,
      name: `Controller ${store.controllers.length + 1}`,
      parameters: [],
      states: [
        { id: 'state-entry', name: 'Idle', clipId: null, loop: true, speed: 1 },
      ],
      transitions: [],
      entryStateId: 'state-entry',
    }
    store.setControllers([...store.controllers, controller])
    setActiveControllerId(controller.id)
    setPositions({ 'state-entry': { x: 300, y: 90 } })
  }

  const addState = () => {
    if (!controller) return
    const id = `state-${crypto.randomUUID().slice(0, 6)}`
    const state: AnimatorState = { id, name: `State ${controller.states.length + 1}`, clipId: null, loop: true, speed: 1 }
    setController({ ...controller, states: [...controller.states, state] })
    setPositions((prev) => ({ ...prev, [id]: { x: 160 + controller.states.length * 190, y: 200 } }))
    setSelectedStateId(id)
  }

  const addTransition = (from: string, to: string) => {
    if (!controller || from === to) return
    const transition: AnimatorTransition = {
      id: `tr-${crypto.randomUUID().slice(0, 6)}`,
      from,
      to,
      duration: 0.2,
      exitTime: 0,
      conditions: [],
    }
    setController({ ...controller, transitions: [...controller.transitions, transition] })
  }

  return (
    <div style={{ display: 'flex', height: '100%', minHeight: 0 }}>
      {/* Controller list */}
      <div className="ah-ctl-list">
        <button className="ah-btn" onClick={createController}>
          <Plus size={13} /> New Controller
        </button>
        {controllers.map((c) => (
          <div
            key={c.id}
            className={`ah-ac-item ${controller?.id === c.id ? 'focused' : ''}`}
            style={{ padding: '5px 8px' }}
            onClick={() => {
              setActiveControllerId(c.id)
              setSelectedStateId(null)
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
            <button
              className="ah-icon-btn"
              style={{ width: 20, height: 20 }}
              onClick={(e) => {
                e.stopPropagation()
                const store = useEditorStore.getState()
                store.setControllers(store.controllers.filter((x) => x.id !== c.id))
              }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
        {controllers.length === 0 && <div className="ah-empty">No controllers</div>}
        {controller && (
          <input
            className="ah-input"
            style={{ marginTop: 4 }}
            defaultValue={controller.name}
            key={controller.id}
            onBlur={(e) => setController({ ...controller, name: e.target.value.trim() || controller.name })}
          />
        )}
      </div>

      {/* Node canvas */}
      <div className="ah-node-canvas">
        {controller ? (
          <>
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
              <defs>
                <marker id="ah-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#8b94a0" />
                </marker>
              </defs>
              {controller.transitions.map((transition) => {
                const from = positions[transition.from] ?? { x: 100, y: 100 }
                const to = positions[transition.to] ?? { x: 300, y: 100 }
                return (
                  <g key={transition.id}>
                    <line
                      x1={from.x + 62}
                      y1={from.y + 22}
                      x2={to.x + 62}
                      y2={to.y + 22}
                      stroke={selectedTransitionId === transition.id ? '#f3c940' : '#8b94a0'}
                      strokeWidth={selectedTransitionId === transition.id ? 2 : 1.2}
                      markerEnd="url(#ah-arrow)"
                    />
                  </g>
                )
              })}
              <line
                x1={60}
                y1={100}
                x2={(positions[controller.entryStateId]?.x ?? 200) + 40}
                y2={(positions[controller.entryStateId]?.y ?? 90) + 10}
                stroke="#7df17d"
                strokeWidth={1.4}
                markerEnd="url(#ah-arrow)"
              />
            </svg>

            <div className="ah-node entry" style={{ left: 20, top: 78 }}>
              Entry
            </div>

            {controller.states.map((state) => {
              const pos = positions[state.id] ?? { x: 160 + controller.states.indexOf(state) * 190, y: 160 }
              return (
                <div
                  key={state.id}
                  className={`ah-node ${selectedStateId === state.id ? 'selected' : ''} ${linkFrom === state.id ? 'selected' : ''}`}
                  style={{ left: pos.x, top: pos.y }}
                  onMouseDown={(event) => {
                    if (linkFrom && linkFrom !== state.id) {
                      addTransition(linkFrom, state.id)
                      setLinkFrom(null)
                      return
                    }
                    // Drag to move node
                    const startX = event.clientX - pos.x
                    const startY = event.clientY - pos.y
                    const move = (e: MouseEvent) => {
                      setPositions((prev) => ({
                        ...prev,
                        [state.id]: { x: Math.max(0, e.clientX - startX), y: Math.max(0, e.clientY - startY) },
                      }))
                    }
                    const up = () => {
                      window.removeEventListener('mousemove', move)
                      window.removeEventListener('mouseup', up)
                    }
                    window.addEventListener('mousemove', move)
                    window.addEventListener('mouseup', up)
                    setSelectedStateId(state.id)
                    setSelectedTransitionId(null)
                  }}
                >
                  <div className="ah-node-title">
                    <span>{state.name}</span>
                    {controller.entryStateId === state.id && (
                      <span style={{ color: 'var(--accent-green)', fontSize: 9 }}>ENTRY</span>
                    )}
                  </div>
                  <div className="ah-node-meta">
                    <span>{state.clipId ? `▸ ${state.clipId}` : 'no clip'}</span>
                    <span>
                      {state.speed.toFixed(2)}× {state.loop ? '· loop' : ''}
                    </span>
                  </div>
                </div>
              )
            })}

            <div style={{ position: 'absolute', left: 12, bottom: 12, display: 'flex', gap: 6 }}>
              <button className="ah-btn" onClick={addState}>
                <Plus size={12} /> State
              </button>
              <button
                className="ah-btn"
                disabled={!selectedStateId}
                onClick={() => selectedStateId && setLinkFrom(selectedStateId)}
                title="Click, then click the target state to connect"
              >
                <Link2 size={12} /> {linkFrom ? 'Pick target…' : 'Connect'}
              </button>
            </div>
          </>
        ) : (
          <div className="ah-empty" style={{ marginTop: 50 }}>
            Create an animator controller
            <div style={{ fontSize: 10.5, marginTop: 4 }}>
              Import a GLB with animations, select its entity, then create a controller
            </div>
          </div>
        )}
      </div>

      {/* State / transition inspector */}
      {controller && (
        <div className="ah-ctl-inspector">
          {selectedTransitionId ? (
            <TransitionInspector
              controller={controller}
              transitionId={selectedTransitionId}
              onChange={setController}
              onDelete={() => {
                setController({
                  ...controller,
                  transitions: controller.transitions.filter((t) => t.id !== selectedTransitionId),
                })
                setSelectedTransitionId(null)
              }}
            />
          ) : selectedStateId ? (
            <StateInspector
              controller={controller}
              stateId={selectedStateId}
              onChange={setController}
              onDelete={() => {
                setController({
                  ...controller,
                  states: controller.states.filter((s) => s.id !== selectedStateId),
                  transitions: controller.transitions.filter(
                    (t) => t.from !== selectedStateId && t.to !== selectedStateId
                  ),
                })
                if (controller.entryStateId === selectedStateId) {
                  setController({ ...controller, entryStateId: controller.states[0]?.id ?? '' })
                }
                setSelectedStateId(null)
              }}
            />
          ) : (
            <div className="ah-empty">Select a state node</div>
          )}
        </div>
      )}

      {/* Timeline preview (only in standalone mode — the docked Timeline has its own transport) */}
    </div>
  )
}

/* ------------------------------------------------------------------ */

function StateInspector({
  controller,
  stateId,
  onChange,
  onDelete,
}: {
  controller: AnimatorController
  stateId: string
  onChange: (next: AnimatorController) => void
  onDelete: () => void
}) {
  const state = controller.states.find((s) => s.id === stateId)
  if (!state) return null
  const clips = modelClipNames(controller)
  const patch = (partial: Partial<AnimatorState>) =>
    onChange({
      ...controller,
      states: controller.states.map((s) => (s.id === stateId ? { ...s, ...partial } : s)),
    })
  return (
    <>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>STATE</div>
      <div className="ah-field">
        <label>Name</label>
        <input className="ah-input" defaultValue={state.name} onBlur={(e) => patch({ name: e.target.value.trim() || state.name })} />
      </div>
      <div className="ah-field">
        <label>Clip</label>
        <select className="ah-input" style={{ height: 24 }} value={state.clipId ?? ''} onChange={(e) => patch({ clipId: e.target.value || null })}>
          <option value="">— none —</option>
          {clips.map((clip) => (
            <option key={clip} value={clip}>
              {clip}
            </option>
          ))}
        </select>
      </div>
      <label className="ah-check">
        <input type="checkbox" checked={state.loop} onChange={(e) => patch({ loop: e.target.checked })} />
        Loop
      </label>
      <div className="ah-field">
        <label>Speed</label>
        <input
          className="ah-input"
          type="number"
          step={0.05}
          defaultValue={state.speed}
          onBlur={(e) => patch({ speed: parseFloat(e.target.value) || 1 })}
        />
      </div>
      <label className="ah-check">
        <input
          type="checkbox"
          checked={controller.entryStateId === stateId}
          onChange={(e) => e.target.checked && onChange({ ...controller, entryStateId: stateId })}
        />
        Entry state
      </label>
      <button className="ah-btn danger" onClick={onDelete}>
        <Trash2 size={12} /> Delete State
      </button>
    </>
  )
}

function TransitionInspector({
  controller,
  transitionId,
  onChange,
  onDelete,
}: {
  controller: AnimatorController
  transitionId: string
  onChange: (next: AnimatorController) => void
  onDelete: () => void
}) {
  const transition = controller.transitions.find((t) => t.id === transitionId)
  if (!transition) return null
  const patch = (partial: Partial<AnimatorTransition>) =>
    onChange({
      ...controller,
      transitions: controller.transitions.map((t) => (t.id === transitionId ? { ...t, ...partial } : t)),
    })
  return (
    <>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-muted)' }}>TRANSITION</div>
      <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
        {controller.states.find((s) => s.id === transition.from)?.name} →{' '}
        {controller.states.find((s) => s.id === transition.to)?.name}
      </div>
      <div className="ah-field">
        <label>Duration</label>
        <input
          className="ah-input"
          type="number"
          step={0.05}
          defaultValue={transition.duration}
          onBlur={(e) => patch({ duration: Math.max(0, parseFloat(e.target.value) || 0) })}
        />
      </div>
      <div className="ah-field">
        <label>Exit Time</label>
        <input
          className="ah-input"
          type="number"
          step={0.05}
          min={0}
          max={1}
          defaultValue={transition.exitTime}
          onBlur={(e) => patch({ exitTime: Math.min(1, Math.max(0, parseFloat(e.target.value) || 0)) })}
        />
      </div>
      <div style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-muted)', marginTop: 4 }}>CONDITIONS</div>
      {transition.conditions.map((condition, index) => (
        <div key={index} style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', gap: 4 }}>
          <span style={{ flex: 1 }}>
            {controller.parameters.find((p) => p.id === condition.parameterId)?.name ?? condition.parameterId}{' '}
            {condition.operator} {String(condition.value ?? '')}
          </span>
          <button
            className="ah-icon-btn"
            style={{ width: 18, height: 18 }}
            onClick={() =>
              patch({ conditions: transition.conditions.filter((_, i) => i !== index) })
            }
          >
            <Trash2 size={10} />
          </button>
        </div>
      ))}
      {controller.parameters.length > 0 && (
        <button
          className="ah-btn"
          onClick={() => {
            const parameter = controller.parameters[0]
            patch({
              conditions: [
                ...transition.conditions,
                { parameterId: parameter.id, operator: parameter.type === 'trigger' ? 'activated' : '>', value: 0.5 },
              ],
            })
          }}
        >
          <Plus size={12} /> Condition
        </button>
      )}
      <button className="ah-btn danger" onClick={onDelete}>
        <Trash2 size={12} /> Delete Transition
      </button>
    </>
  )
}

function modelClipNames(controller: AnimatorController): string[] {
  void controller
  return []
}

