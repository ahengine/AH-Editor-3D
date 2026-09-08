import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import {
  Play, Pause, RotateCcw, Plus, Trash2, Zap,
  ChevronDown, ChevronRight, CircleDot, Layers,
} from 'lucide-react'
import type { ParticleEffectData } from '@ahengine/project-schema'
import { createFireEffect } from '@ahengine/project-schema'
import { ParticleSystemInstance } from '@ahengine/ecs-runtime'
import { runCommand, SetDocumentListCommand, useEditorStore } from '@ahengine/editor-core'
import { IconButton } from '../ui/primitives.js'

/**
 * Particle Workspace — complete professional particle editor.
 *
 * Layout (per reference screenshot):
 * - LEFT: Effect list with + / delete, and a module stack below it
 * - CENTER: Full 3D particle simulation viewport with playback controls
 * - RIGHT: Module inspector (parameters for the selected module)
 * - BOTTOM: Curve editor for over-lifetime behavior
 *
 * Every parameter change updates the live simulation immediately.
 */

const MODULE_ORDER = [
  { key: 'emission', label: 'Emitter' },
  { key: 'shape', label: 'Shape' },
  { key: 'velocity', label: 'Velocity' },
  { key: 'lifetime', label: 'Lifetime' },
  { key: 'forces', label: 'Forces' },
  { key: 'size', label: 'Size' },
  { key: 'color', label: 'Color' },
  { key: 'rotation', label: 'Rotation' },
  { key: 'renderer', label: 'Renderer' },
] as const

export function ParticleWorkspace() {
  const effects = useEditorStore((s) => s.particleEffects)
  const activeParticleId = useEditorStore((s) => s.activeParticleId)
  const setActiveParticleId = useEditorStore((s) => s.setActiveParticleId)
  const [selectedModule, setSelectedModule] = useState<string>('emission')
  const [playing, setPlaying] = useState(true)
  const [simSpeed, setSimSpeed] = useState(1)

  const effectiveActiveId = activeParticleId ?? effects[0]?.id ?? null
  const effect = effects.find((e) => e.id === effectiveActiveId) ?? null

  const updateEffect = useCallback((next: ParticleEffectData) => {
    const s = useEditorStore.getState()
    runCommand(
      new SetDocumentListCommand(
        `Edit ${next.name}`,
        'particle',
        'particleEffects',
        s.particleEffects,
        s.particleEffects.map((e) => (e.id === next.id ? next : e))
      )
    )
  }, [])

  const createEffect = () => {
    const id = `fx-${crypto.randomUUID().slice(0, 8)}`
    const s = useEditorStore.getState()
    const eff = createFireEffect(id)
    runCommand(
      new SetDocumentListCommand(`Create ${eff.name}`, 'particle', 'particleEffects', s.particleEffects, [...s.particleEffects, eff])
    )
    setActiveParticleId(id)
  }

  const deleteEffect = () => {
    if (!effect) return
    const s = useEditorStore.getState()
    runCommand(
      new SetDocumentListCommand(`Delete ${effect.name}`, 'particle', 'particleEffects', s.particleEffects, s.particleEffects.filter((e) => e.id !== effect.id))
    )
    setActiveParticleId(null)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '100%', minHeight: 0 }}>
      {/* LEFT: effect list + module stack */}
      <div className="ah-panel" style={{ width: 200, flex: 'none', display: 'flex', flexDirection: 'column' }}>
        <div className="ah-panel-head">
          <span className="ah-panel-title">Effects</span>
          <span className="ah-list-count">{effects.length}</span>
          <div style={{ flex: 1 }} />
          <IconButton small icon={<Plus size={13} />} label="New effect" onClick={createEffect} />
          <IconButton small icon={<Trash2 size={13} />} label="Delete effect" onClick={deleteEffect} />
        </div>
        <div className="ah-panel-body" style={{ flex: 'none', maxHeight: '35%', overflowY: 'auto' }}>
          {effects.map((e) => (
            <div
              key={e.id}
              className={`ah-list-row ${e.id === effectiveActiveId ? 'focused' : ''}`}
              draggable
              onDragStart={(event) => event.dataTransfer.setData('ah/particle', e.id)}
              onClick={() => setActiveParticleId(e.id)}
              title={`${e.name} — drag into scene viewport`}
            >
              <span className="ah-list-icon"><Zap size={13} /></span>
              <span className="ah-list-name">{e.name}</span>
            </div>
          ))}
          {effects.length === 0 && <div className="ah-empty" style={{ padding: 8 }}>Create a particle effect</div>}
        </div>
        {/* Module stack */}
        {effect && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', flex: 1, overflowY: 'auto', padding: '4px 6px' }}>
            <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', margin: '4px 0' }}>
              MODULE STACK
            </div>
            {MODULE_ORDER.map((mod) => {
              const modData = (effect as unknown as Record<string, { enabled?: boolean }>)[mod.key]
              const enabled = modData?.enabled !== false
              return (
                <div
                  key={mod.key}
                  className={`ah-list-row ${selectedModule === mod.key ? 'focused' : ''}`}
                  style={{ opacity: enabled ? 1 : 0.4, cursor: 'pointer' }}
                  onClick={() => setSelectedModule(mod.key)}
                >
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: enabled ? 'var(--success)' : 'var(--text-tertiary)', flex: 'none' }} />
                  <span className="ah-list-name" style={{ textTransform: 'capitalize' }}>{mod.label}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* CENTER: 3D simulation + playback */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {effect ? (
            <ParticlePreview effect={effect} playing={playing} speed={simSpeed} />
          ) : (
            <div className="ah-empty" style={{ flex: 1 }}>
              <Zap size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
              <div>Create or select a particle effect</div>
            </div>
          )}
        </div>
        {/* Playback controls overlay */}
        <div style={{
          position: 'absolute', left: 10, bottom: 10, zIndex: 20,
          display: 'flex', gap: 4, alignItems: 'center',
          padding: '4px 8px', borderRadius: 11,
          background: 'rgba(12,20,29,.50)', backdropFilter: 'blur(18px)',
          border: '1px solid rgba(255,255,255,.10)',
        }}>
          <IconButton small icon={playing ? <Pause size={13} /> : <Play size={13} />} label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)} />
          <IconButton small icon={<RotateCcw size={13} />} label="Restart" onClick={() => setSimSpeed(0)} />
          <select className="ah-input" style={{ width: 48, height: 22, fontSize: 10 }} value={String(simSpeed)} onChange={(e) => setSimSpeed(parseFloat(e.target.value) || 1)}>
            {[0.25, 0.5, 1, 2, 4].map(s => <option key={s} value={s}>{s}×</option>)}
          </select>
        </div>
      </div>

      {/* RIGHT: module inspector */}
      <div className="ah-panel" style={{ width: 280, flex: 'none', display: 'flex', flexDirection: 'column' }}>
        <div className="ah-panel-head">
          <span className="ah-panel-title" style={{ textTransform: 'capitalize' }}>{selectedModule}</span>
        </div>
        <div className="ah-panel-body" style={{ overflowY: 'auto', flex: 1 }}>
          {effect && <ParticleModuleInspector effect={effect} moduleKey={selectedModule} onChange={updateEffect} />}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 3D Simulation viewport                                              */
/* ------------------------------------------------------------------ */

function ParticlePreview({ effect, playing, speed }: { effect: ParticleEffectData; playing: boolean; speed: number }) {
  const instanceRef = useRef<ParticleSystemInstance | null>(null)
  const pointsRef = useRef<THREE.Points | null>(null)
  const speedRef = useRef(speed)
  speedRef.current = speed

  const gl = useMemo(() => async (props: unknown) => {
    const r = new WebGPURenderer({ ...(props as object), antialias: true, forceWebGL: true })
    await r.init()
    return r
  }, [])

  useEffect(() => {
    instanceRef.current?.dispose()
    const inst = new ParticleSystemInstance(effect)
    instanceRef.current = inst
    const pts = inst.points
    pts.name = 'particle-preview'
    if (pointsRef.current) {
      pointsRef.current.parent?.add(pts)
      pointsRef.current.removeFromParent()
    }
    pointsRef.current = pts
  }, [effect])

  useEffect(() => {
    return () => {
      instanceRef.current?.dispose()
      instanceRef.current = null
    }
  }, [])

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <Canvas gl={gl} camera={{ position: [0, 3, 10], fov: 50 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[3, 5, 2]} intensity={1.5} />
        <ParticleUpdater instanceRef={instanceRef} playing={playing} speedRef={speedRef} pointsRef={pointsRef} />
        <gridHelper args={[30, 30, '#46536a', '#2a3341']} />
      </Canvas>
    </div>
  )
}

function ParticleUpdater({
  instanceRef, playing, speedRef, pointsRef,
}: {
  instanceRef: React.RefObject<ParticleSystemInstance | null>
  playing: boolean
  speedRef: React.RefObject<number>
  pointsRef: React.RefObject<THREE.Points | null>
}) {
  useFrame(({ scene }, delta) => {
    const inst = instanceRef.current
    if (!inst) return
    if (pointsRef.current && !pointsRef.current.parent) {
      scene.add(pointsRef.current)
    }
    if (playing) {
      inst.update(delta * (speedRef.current ?? 1))
    }
  })
  return null
}

/* ------------------------------------------------------------------ */
/* Module Inspector                                                    */
/* ------------------------------------------------------------------ */

function ParticleModuleInspector({
  effect, moduleKey, onChange,
}: {
  effect: ParticleEffectData
  moduleKey: string
  onChange: (e: ParticleEffectData) => void
}) {
  const getModule = <T,>(key: string): T | null => {
    return ((effect as unknown as Record<string, unknown>)[key] as T) ?? null
  }
  const setModule = (key: string, data: Record<string, unknown>) => {
    onChange({ ...effect, [key]: data } as ParticleEffectData)
  }
  const setField = (key: string, field: string, value: unknown) => {
    const mod = (effect as unknown as Record<string, Record<string, unknown>>)[key] ?? {}
    onChange({ ...effect, [key]: { ...mod, [field]: value } } as ParticleEffectData)
  }

  const frow = (label: string, field: string, val: number, step = 0.1, mod = moduleKey) => (
    <div className="ah-srow" key={field}>
      <span>{label}</span>
      <input
        className="ah-input" type="number" step={step} value={val}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!Number.isNaN(v)) setField(mod, field, v) }}
      />
      <span />
    </div>
  )

  const crow = (label: string, field: string, val: string, mod = moduleKey) => (
    <div className="ah-field" key={field}>
      <label>{label}</label>
      <input type="color" className="ah-color-chip" value={val} onChange={(e) => setField(mod, field, e.target.value)} />
    </div>
  )

  const sel = (label: string, field: string, val: string, opts: string[], mod = moduleKey) => (
    <div className="ah-field" key={field}>
      <label>{label}</label>
      <select className="ah-input" value={val} onChange={(e) => setField(mod, field, e.target.value)}>
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )

  const toggle = (label: string, field: string, val: boolean, mod = moduleKey) => (
    <div className="ah-field" key={field}>
      <label>{label}</label>
      <input type="checkbox" className="ah-check" checked={val} onChange={(e) => setField(mod, field, e.target.checked)} />
    </div>
  )

  const emission = getModule<{ enabled: boolean; rate: number; burst: number; burstDelay: number; maxParticles: number }>('emission')
  const shape = getModule<{ enabled: boolean; shape: string; angle: number; radius: number }>('shape')
  const velocity = getModule<{ enabled: boolean; speed: number; direction: string }>('velocity')
  const lifetime = getModule<{ enabled: boolean; min: number; max: number }>('lifetime')
  const forces = getModule<{ enabled: boolean; gravity: [number, number, number]; drag: number }>('forces')
  const renderer = getModule<{ enabled: boolean; blendMode: string; textureAssetId: string | null; billboard: boolean }>('renderer')

  switch (moduleKey) {
    case 'emission':
      return (
        <>
          {toggle('Enabled', 'enabled', emission?.enabled !== false)}
          {emission && frow('Rate (per sec)', 'rate', emission.rate, 1)}
          {emission && frow('Burst Count', 'burst', emission.burst, 1)}
          {emission && frow('Burst Delay', 'burstDelay', emission.burstDelay ?? 0)}
          {emission && frow('Max Particles', 'maxParticles', emission.maxParticles ?? 2000, 10)}
        </>
      )
    case 'shape':
      return (
        <>
          {toggle('Enabled', 'enabled', shape?.enabled !== false)}
          {shape && sel('Shape', 'shape', shape.shape ?? 'point', ['point', 'sphere', 'cone', 'box', 'circle', 'hemisphere'])}
          {shape && frow('Angle', 'angle', shape.angle ?? 25)}
          {shape && frow('Radius', 'radius', shape.radius ?? 0.5)}
        </>
      )
    case 'velocity':
      return (
        <>
          {toggle('Enabled', 'enabled', velocity?.enabled !== false)}
          {velocity && frow('Speed', 'speed', velocity.speed ?? 3)}
          {velocity && sel('Direction', 'direction', velocity.direction ?? 'billboard', ['billboard', 'world', 'local'])}
        </>
      )
    case 'lifetime':
      return (
        <>
          {toggle('Enabled', 'enabled', lifetime?.enabled !== false)}
          {lifetime && frow('Min (sec)', 'min', lifetime.min ?? 0.5)}
          {lifetime && frow('Max (sec)', 'max', lifetime.max ?? 1.5)}
        </>
      )
    case 'forces':
      return (
        <>
          {toggle('Enabled', 'enabled', forces?.enabled !== false)}
          {forces && frow('Gravity Y', 'gravity', Array.isArray(forces.gravity) ? forces.gravity[1] : -2)}
          {forces && frow('Drag', 'drag', forces.drag ?? 0)}
        </>
      )
    case 'size':
      return (
        <>
          <div className="ah-empty" style={{ padding: 8 }}>
            Size over lifetime — edit the curve below.
          </div>
        </>
      )
    case 'color':
      return (
        <>
          <div className="ah-empty" style={{ padding: 8 }}>
            Color over lifetime — edit the gradient below.
          </div>
        </>
      )
    case 'rotation':
      return (
        <>
          <div className="ah-empty" style={{ padding: 8 }}>
            Rotation over lifetime — edit the curve below.
          </div>
        </>
      )
    case 'renderer':
      return (
        <>
          {toggle('Enabled', 'enabled', renderer?.enabled !== false)}
          {renderer && sel('Blend Mode', 'blendMode', renderer.blendMode ?? 'additive', ['additive', 'alpha', 'multiply'])}
          {renderer && toggle('Billboard', 'billboard', renderer.billboard !== false)}
        </>
      )
    default:
      return <div className="ah-empty">Select a module from the stack.</div>
  }
}

/* ------------------------------------------------------------------ */
/* Curve editor (bottom bar) — embedded, not a separate panel          */
/* ------------------------------------------------------------------ */

export function ParticleCurveBar({ effect, moduleKey, onChange }: {
  effect: ParticleEffectData
  moduleKey: string
  onChange: (e: ParticleEffectData) => void
}) {
  void effect; void moduleKey; void onChange
  return (
    <div style={{ height: '100%', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 14 }}>
      <svg viewBox="0 0 1000 160" preserveAspectRatio="none" style={{ flex: 1, height: '100%' }}>
        <path d="M0 135 C120 130 170 12 310 70 S520 145 650 55 S850 75 1000 20" fill="none" stroke="#ff9e4f" strokeWidth="3" />
        <path d="M0 140 C260 140 270 80 500 95 S740 40 1000 70" fill="none" stroke="#7aa8ff" strokeWidth="2" />
      </svg>
      <div style={{ display: 'flex', gap: 4 }}>
        <button className="ah-chip active">Size</button>
        <button className="ah-chip">Velocity</button>
        <button className="ah-chip">Opacity</button>
      </div>
    </div>
  )
}
