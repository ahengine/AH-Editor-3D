import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { WebGPURenderer } from 'three/webgpu'
import { Canvas } from '@react-three/fiber'
import { createWorld } from 'koota'
import {
  loadScene,
  MaterialService,
  AnimatorRuntime,
  UrlAssetResolver,
  type RuntimeSceneHandle,
} from '@ahengine/ecs-runtime'
import { KootaScene } from '@ahengine/ecs-runtime/react'
import type { AssetRecord, ProjectData } from '@ahengine/project-schema'

/**
 * Runtime demo — proves exported editor data loads WITHOUT any editor package.
 * Only koota + three + @ahengine/ecs-runtime + the exported JSON.
 */

const SCENE_URL = './basic-scene.koota-project.json'

function RuntimeApp() {
  const [status, setStatus] = useState('loading scene…')
  const [error, setError] = useState<string | null>(null)
  const [world] = useState(() => createWorld())
  const [handle, setHandle] = useState<RuntimeSceneHandle | null>(null)
  const [assets, setAssets] = useState<AssetRecord[]>([])
  const [settings, setSettings] = useState<ProjectData['scene']['settings'] | undefined>()
  const [backend, setBackend] = useState('initializing')

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(SCENE_URL)
        if (!response.ok) throw new Error(`fetch ${SCENE_URL} failed: HTTP ${response.status}`)
        const data = (await response.json()) as ProjectData
        const resolver = new UrlAssetResolver('./assets')
        const result = loadScene(world, data, { assetResolver: resolver })
        setAssets(data.assets)
        setSettings(data.scene.settings)
        setHandle(result)
        setStatus(`loaded ${result.entitiesById.size} entities from exported JSON`)
      } catch (caught) {
        setError((caught as Error).message)
        setStatus('error')
      }
    })()
  }, [world])

  useEffect(() => () => handle?.dispose(), [handle])

  const gl = async (props: unknown) => {
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
  }

  const assetById = new Map(assets.map((asset) => [asset.id, asset]))
  const runtime = {
    materials: handle?.materials ?? new MaterialService(() => new Map()),
    animator: handle?.animator ?? new AnimatorRuntime(() => new Map(), () => []),
  }

  return (
    <>
      <div className="hud">
        <div>
          AHEngine <b>Runtime Demo</b>
        </div>
        <div>status: {status}</div>
        <div>backend: {backend}</div>
        <div>
          editor packages: <b>none</b>
        </div>
      </div>
      {error && <div className="err">{error}</div>}
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
            resolveAssetUri={(uri) => Promise.resolve(uri)}
          />
        )}
      </Canvas>
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RuntimeApp />
  </React.StrictMode>
)
