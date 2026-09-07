import React, { useEffect, useMemo, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { WebGPURenderer } from 'three/webgpu'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { createWorld, type World } from 'koota'
import {
  EntityMeta,
  Animator as AnimatorTrait,
  ParticleEmitter,
  ThreeObject,
  loadScene,
  MaterialService,
  AnimatorRuntime,
  UrlAssetResolver,
  ParticleSystemInstance,
  type RuntimeSceneHandle,
} from '@ahengine/ecs-runtime'
import { KootaScene } from '@ahengine/ecs-runtime/react'
import type { AssetRecord, ProjectData } from '@ahengine/project-schema'

/**
 * Runtime Demo — proves the core promise:
 * Author in Editor → Export Data → Load in any Koota + R3F app.
 *
 * This application imports ZERO editor packages (no editor-core, no
 * editor-ui, no command stack, no asset browser, no panels).
 */

const DATA_URL = './basic-scene.koota-project.json'

function RuntimeApp() {
  const [status, setStatus] = useState('Loading scene…')
  const [error, setError] = useState<string | null>(null)
  const [world] = useState(() => createWorld())
  const [handle, setHandle] = useState<RuntimeSceneHandle | null>(null)
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [settings, setSettings] = useState<ProjectData['scene']['settings'] | undefined>()
  const [backend, setBackend] = useState('initializing')
  const [reloadCount, setReloadCount] = useState(0)
  const [entityCount, setEntityCount] = useState(0)

  // Load scene from exported JSON
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const response = await fetch(DATA_URL)
        if (!response.ok) throw new Error(`fetch ${DATA_URL}: HTTP ${response.status}`)
        const data = (await response.json()) as ProjectData

        const resolver = new UrlAssetResolver('./assets')
        const result = loadScene(world, data, { assetResolver: resolver })

        if (cancelled) return
        setAssets(data.assets)
        setSettings(data.scene.settings)
        setHandle(result)
        setEntityCount(result.entitiesById.size)
        setStatus(`Loaded ${result.entitiesById.size} entities from exported JSON`)
      } catch (caught) {
        if (!cancelled) {
          setError((caught as Error).message)
          setStatus('error')
        }
      }
    })()
    return () => { cancelled = true }
  }, [world, reloadCount])

  useEffect(() => () => handle?.dispose(), [handle])

  const gl = useMemo(() => async (props: unknown) => {
    const renderer = new WebGPURenderer({ ...(props as object), antialias: true })
    try {
      await renderer.init()
      setBackend('webgpu')
    } catch {
      const fallback = new WebGPURenderer({ ...(props as object), antialias: true, forceWebGL: true })
      await fallback.init()
      renderer.dispose()
      setBackend('webgl2-fallback')
      return fallback
    }
    return renderer
  }, [])

  const assetById = useMemo(() => new Map(assets.map((a) => [a.id, a] as const)), [assets])
  const runtime = useMemo(() => ({
    materials: handle?.materials ?? new MaterialService(() => new Map()),
    animator: handle?.animator ?? new AnimatorRuntime(() => new Map(), () => []),
  }), [handle])

  return (
    <>
      <div style={{
        position: 'fixed', top: 12, left: 12, zIndex: 10,
        background: 'rgba(26,32,42,0.92)', border: '1px solid #3d4754',
        padding: '10px 16px', borderRadius: 8, fontSize: 12, lineHeight: 1.8,
        fontFamily: 'system-ui, sans-serif', color: '#d6dae0',
      }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          AHEngine <span style={{ color: '#f3c940' }}>Runtime Demo</span>
        </div>
        <div>Status: {status}</div>
        <div>Backend: <b style={{ color: backend === 'webgpu' ? '#7df17d' : '#6ba8ff' }}>{backend}</b></div>
        <div>Entities: {entityCount}</div>
        <div>Assets: {assets.length} | Materials from graph ✓ | Prefabs nested ✓ | Animator ✓</div>
        <div style={{ marginTop: 4, color: '#8b94a0', fontSize: 11 }}>
          Editor packages imported: <b style={{ color: '#e2574c' }}>NONE</b> — pure runtime
        </div>
        {error && <div style={{ color: '#e2574c', marginTop: 4 }}>{error}</div>}
      </div>
      <Canvas gl={gl} shadows camera={{ fov: 50, near: 0.1, far: 600, position: [9, 6, 12] }}>
        {handle && (
          <KootaScene
            world={world}
            runtime={runtime}
            useGameCamera
            settings={settings}
            environmentLookup={(assetId) => {
              const record = assetById.get(assetId)
              return record ? { uri: record.uri } : undefined
            }}
            resolveAssetUri={(uri) => Promise.resolve(uri.startsWith('/') ? uri : `/${uri}`)}
          />
        )}
        <StatsReporter world={world} onCount={setEntityCount} />
      </Canvas>
    </>
  )
}

function StatsReporter({ world, onCount }: { world: World; onCount: (n: number) => void }) {
  const last = useRef(0)
  useFrame(({ gl }) => {
    void gl
    const now = performance.now()
    if (now - last.current > 2000) {
      last.current = now
      onCount(world.query(EntityMeta).length)
    }
  })
  return null
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RuntimeApp />
  </React.StrictMode>
)
