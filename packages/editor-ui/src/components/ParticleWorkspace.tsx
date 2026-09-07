import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Play, Pause, Square, RotateCcw, Plus, Trash2, Zap } from 'lucide-react'
import type { ParticleEffectData } from '@ahengine/project-schema'
import { createFireEffect, sampleCurve } from '@ahengine/project-schema'
import { ParticleSystemInstance } from '@ahengine/ecs-runtime'
import { useEditorStore } from '@ahengine/editor-core'
import { IconButton, InspectorSection } from '../ui/primitives.js'

/**
 * Particle Effect Authoring workspace.
 * Left: effect list + module tree. Center: 3D preview. Right: module inspector.
 * Bottom: curve/gradient editor for selected module.
 */

export function ParticleWorkspace() {
  const effects = useEditorStore((s) => s.particleEffects)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [selectedModule, setSelectedModule] = useState<string>('emission')
  const [playing, setPlaying] = useState(true)
  const [simSpeed, setSimSpeed] = useState(1)

  const effect = effects.find((e) => e.id === activeId) ?? null

  const updateEffect = useCallback((next: ParticleEffectData) => {
    const s = useEditorStore.getState()
    s.setParticleEffects(s.particleEffects.map((e) => (e.id === next.id ? next : e))
      .map((e) => e as ParticleEffectData))
  }, [])

  const createEffect = () => {
    const id = `fx-${crypto.randomUUID().slice(0, 8)}`
    const s = useEditorStore.getState()
    s.setParticleEffects([...s.particleEffects, createFireEffect(id)])
    setActiveId(id)
  }

  return (
    <div className="ah-anim-workspace" style={{ flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left: effect list + modules */}
        <div className="ah-panel" style={{ width: 190, flex: 'none' }}>
          <div className="ah-panel-head">
            <span className="ah-panel-title">Effects</span>
            <IconButton small icon={<Plus size={13} />} label="New effect" onClick={createEffect} />
          </div>
          <div className="ah-panel-body">
            {effects.map((e) => (
              <div key={e.id} className={`ah-list-row ${e.id === activeId ? 'focused' : ''}`}
                onClick={() => setActiveId(e.id)}>
                <span className="ah-list-icon"><Zap size={13} /></span>
                <span className="ah-list-name">{e.name}</span>
              </div>
            ))}
            {effects.length === 0 && <div className="ah-empty">Create a particle effect</div>}
          </div>
          {/* Module list */}
          {effect && (
            <div style={{ borderTop: '1px solid var(--border-subtle)', flex: 1, overflowY: 'auto', padding: 'var(--sp-2)' }}>
              <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', marginBottom: 4 }}>MODULES</div>
              {(['emission','shape','velocity','lifetime','forces','size','color','rotation','renderer'] as const).map((mod) => {
                const enabled = ((effect as unknown as Record<string, { enabled?: boolean }>)[mod])?.enabled !== false
                return (
                  <div key={mod} className={`ah-list-row ${selectedModule === mod ? 'focused' : ''}`}
                    style={{ cursor: 'pointer', opacity: enabled ? 1 : 0.4 }}
                    onClick={() => setSelectedModule(mod)}>
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: enabled ? 'var(--accent-green)' : 'var(--text-tertiary)', flex: 'none' }} />
                    <span className="ah-list-name" style={{ textTransform: 'capitalize' }}>{mod}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Center: 3D preview */}
        {effect ? (
          <ParticlePreview effect={effect} playing={playing} speed={simSpeed} />
        ) : (
          <div className="ah-empty" style={{ flex: 1 }}>
            <Zap size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
            <div>Create or select a particle effect</div>
          </div>
        )}

        {/* Right: module inspector */}
        {effect && (
          <ParticleModuleInspector
            effect={effect}
            moduleKey={selectedModule}
            onChange={updateEffect}
          />
        )}
      </div>

      {/* Bottom: transport + curve editor */}
      {effect && (
        <div style={{ flex: 'none', height: 120, borderTop: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 var(--sp-4)' }}>
          <IconButton small icon={playing ? <Pause size={13} /> : <Play size={13} />} label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying(!playing)} />
          <IconButton small icon={<RotateCcw size={13} />} label="Restart" onClick={() => setSimSpeed(1)} />
          <select className="ah-input" style={{ width: 52, height: 24 }} value={String(simSpeed)} onChange={(e) => setSimSpeed(parseFloat(e.target.value) || 1)}>
            {[0.25, 0.5, 1, 2, 4].map(s => <option key={s} value={s}>{s}×</option>)}
          </select>
          <div style={{ flex: 1 }} />
          <CurveEditor effect={effect} moduleKey={selectedModule} onChange={updateEffect} />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 3D Preview — particle system rendering with orbit camera            */
/* ------------------------------------------------------------------ */

function ParticlePreview({ effect, playing, speed }: { effect: ParticleEffectData; playing: boolean; speed: number }) {
  const instanceRef = useRef<ParticleSystemInstance | null>(null)
  const pointsRef = useRef<THREE.Points | null>(null)

  const gl = useMemo(() => async (props: unknown) => {
    const r = new WebGPURenderer({ ...(props as object), antialias: true, forceWebGL: true })
    await r.init()
    return r
  }, [])

  // Create/recreate instance when effect changes
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

  return (
    <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
      <Canvas gl={gl} camera={{ position: [0, 2, 6], fov: 50 }}>
        <ambientLight intensity={1} />
        <directionalLight position={[3, 5, 2]} intensity={1.5} />
        <ParticleUpdater instanceRef={instanceRef} playing={playing} speed={speed} pointsRef={pointsRef} />
        <gridHelper args={[20, 20, '#46536a', '#2a3341']} position={[0, 0, 0]} />
      </Canvas>
    </div>
  )
}

function ParticleUpdater({
  instanceRef, playing, speed, pointsRef,
}: {
  instanceRef: React.RefObject<ParticleSystemInstance | null>
  playing: boolean
  speed: number
  pointsRef: React.RefObject<THREE.Points | null>
}) {
  const sceneRef = useRef<THREE.Group | null>(null)
  const { scene } = useFrame((_, dt) => ({ scene: null })) as never

  useEffect(() => {
    // Mount points to scene on first frame
  }, [])

  useFrame(({ scene }, delta) => {
    const inst = instanceRef.current
    if (!inst) return
    // Ensure points are in scene
    if (pointsRef.current && !pointsRef.current.parent) {
      scene.add(pointsRef.current)
    }
    if (playing) {
      inst.update(delta * speed)
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
  const module = (effect as unknown as Record<string, unknown>)[moduleKey] as Record<string, unknown> | undefined
  if (!module) return <div className="ah-empty">Unknown module</div>

  const setModule = (partial: Record<string, unknown>) => {
    onChange({ ...(effect as unknown as object), [moduleKey]: { ...module, ...partial } } as unknown as ParticleEffectData)
  }

  const moduleLabels: Record<string, string> = {
    emission: 'Emission', shape: 'Shape', velocity: 'Velocity', lifetime: 'Lifetime',
    forces: 'Forces', size: 'Size', color: 'Color', rotation: 'Rotation', renderer: 'Renderer',
  }

  const num = (label: string, key: string, step = 0.1, min?: number) => (
    <div className="ah-field">
      <label>{label}</label>
      <input className="ah-input" type="number" step={step} min={min} defaultValue={Number(module[key] ?? 0)}
        key={moduleKey + key} onBlur={(e) => setModule({ [key]: parseFloat(e.target.value) || 0 })} />
    </div>
  )

  return (
    <div className="ah-mat-graph-inspector" style={{ width: 210 }}>
      <div className="ah-panel-head"><span className="ah-panel-title">{moduleLabels[moduleKey] ?? moduleKey}</span></div>
      <div className="ah-panel-body" style={{ padding: '8px 12px', gap: 4 }}>
        <label className="ah-check">
          <input type="checkbox" checked={module.enabled !== false} onChange={(e) => setModule({ enabled: e.target.checked })} />
          Enabled
        </label>
        <div className="ah-menu-sep" />

        {moduleKey === 'emission' && (<>
          {num('Rate', 'rate', 1, 0)}
          {num('Burst', 'burst', 1, 0)}
          {num('Max Particles', 'maxParticles', 100, 1)}
        </>)}
        {moduleKey === 'shape' && (<>
          <div className="ah-field">
            <label>Shape</label>
            <select className="ah-input" value={String(module.shape)} onChange={(e) => setModule({ shape: e.target.value })}>
              <option value="point">Point</option>
              <option value="box">Box</option>
              <option value="sphere">Sphere</option>
              <option value="cone">Cone</option>
            </select>
          </div>
          {num('Radius', 'radius')}
          {num('Cone Height', 'coneHeight')}
          {num('Cone Angle', 'coneAngle', 0.05)}
        </>)}
        {moduleKey === 'velocity' && (<>
          {num('Speed Min', 'speedMin')}
          {num('Speed Max', 'speedMax')}
          {num('Spread', 'spread', 0.05, 0)}
        </>)}
        {moduleKey === 'lifetime' && (<>
          {num('Min', 'min', 0.1, 0.01)}
          {num('Max', 'max', 0.1, 0.01)}
        </>)}
        {moduleKey === 'forces' && (<>
          {num('Gravity Y', 'gravity.1')}
          {num('Drag', 'drag', 0.05, 0)}
        </>)}
        {moduleKey === 'size' && (<>
          {num('Base Size', 'size', 0.01)}
          <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)' }}>Curve editor below</div>
        </>)}
        {moduleKey === 'color' && (<>
          <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)' }}>Gradient editor below</div>
        </>)}
        {moduleKey === 'rotation' && (<>
          {num('Init Min', 'initialMin', 5)}
          {num('Init Max', 'initialMax', 5)}
          {num('Speed Min', 'speedMin', 5)}
          {num('Speed Max', 'speedMax', 5)}
        </>)}
        {moduleKey === 'renderer' && (<>
          <div className="ah-field">
            <label>Blend</label>
            <select className="ah-input" value={String(module.blendMode)} onChange={(e) => setModule({ blendMode: e.target.value })}>
              <option value="alpha">Alpha</option>
              <option value="additive">Additive</option>
              <option value="multiply">Multiply</option>
            </select>
          </div>
          <label className="ah-check">
            <input type="checkbox" checked={module.depthWrite === true} onChange={(e) => setModule({ depthWrite: e.target.checked })} />
            Depth Write
          </label>
        </>)}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Curve Editor — SVG visualization + key manipulation                 */
/* ------------------------------------------------------------------ */

function CurveEditor({ effect, moduleKey, onChange }: { effect: ParticleEffectData; moduleKey: string; onChange: (e: ParticleEffectData) => void }) {
  const curve = moduleKey === 'size'
    ? (effect.size?.sizeOverLifetime as { keys: { time: number; value: number }[] } | undefined)
    : undefined
  const gradient = moduleKey === 'color'
    ? effect.color?.colorOverLifetime
    : undefined

  if (!curve && !gradient) return null

  return (
    <div style={{ width: 300, height: 100, background: 'var(--panel-bg)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-card)', overflow: 'hidden', padding: 4 }}>
      <svg width="100%" height="100%" viewBox="0 0 300 90">
        {curve && curve.keys.map((key, i) => (
          <g key={i}>
            <circle
              cx={key.time * 290 + 5}
              cy={90 - key.value * 80 - 5}
              r="4"
              fill="var(--accent)"
              stroke="var(--panel-bg)"
              strokeWidth="1.5"
              style={{ cursor: 'ew-resize' }}
            />
          </g>
        ))}
        {curve && curve.keys.length > 1 && (
          <polyline
            points={curve.keys.map(k => `${k.time * 290 + 5},${90 - k.value * 80 - 5}`).join(' ')}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="1.5"
            opacity="0.6"
          />
        )}
        {gradient && gradient.colorStops.map((stop, i) => (
          <rect key={i} x={stop.time * 290} y="70" width="10" height="20" fill={stop.color} />
        ))}
        {gradient && (
          <rect x="0" y="70" width="300" height="20" fill="url(#grad)" opacity="0.8" />
        )}
        {gradient && (
          <defs>
            <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
              {gradient.colorStops.map((stop, i) => (
                <stop key={i} offset={stop.time} stopColor={stop.color} />
              ))}
            </linearGradient>
          </defs>
        )}
      </svg>
      <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', paddingLeft: 8 }}>
        {curve ? 'Size over Lifetime' : 'Color over Lifetime'}
      </div>
    </div>
  )
}
