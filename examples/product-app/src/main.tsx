import React, { useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { WebGPURenderer } from 'three/webgpu'
import { Canvas } from '@react-three/fiber'
import { createWorld, type World } from 'koota'
import {
  EntityMeta,
  UrlAssetResolver,
  loadScene,
  type RuntimeSceneHandle,
} from '@ahengine/ecs-runtime'
import { KootaScene } from '@ahengine/ecs-runtime/react'
import projectData from './game/game.koota-project.json'
import type { AssetRecord, ProjectData } from '@ahengine/project-schema'

/**
 * MY PRODUCT — a regular app that renders scenes authored in the AHEngine
 * editor. The editor (installed via `npm i @ahengine/editor`) runs beside it
 * on :5000; every Ctrl+S rewrites src/game/game.koota-project.json and Vite
 * HMR swaps the scene in live.
 */

interface Runtime {
  world: World
  handle: RuntimeSceneHandle
  assets: AssetRecord[]
  settings: ProjectData['scene']['settings']
}

function boot(data: ProjectData): Runtime {
  const world = createWorld()
  // Asset uris are root-relative (e.g. `game-assets/x.glb`) — served by both
  // this dev server and the editor server under /game-assets/.
  const handle = loadScene(world, data, { assetResolver: new UrlAssetResolver('') })
  return { world, handle, assets: data.assets, settings: data.scene.settings }
}

// HMR bridge — registered once; the component provides the swap callback.
let swapScene: ((data: ProjectData) => void) | null = null
if (import.meta.hot) {
  import.meta.hot.accept('./game/game.koota-project.json', (mod) => {
    const data = mod?.default as ProjectData | undefined
    ;(window as unknown as { __hmrLog?: string[] }).__hmrLog ??= []
    ;(window as unknown as { __hmrLog: string[] }).__hmrLog.push(
      `accept: entities=${data ? data.scene.entities.length : 'null'}`
    )
    if (data) swapScene?.(data)
  })
}

function ProductApp() {
  const [runtime, setRuntime] = useState<Runtime>(() => boot(projectData as ProjectData))
  const [reloads, setReloads] = useState(0)
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime

  // Live update when the editor saves the project file.
  useEffect(() => {
    swapScene = (data) => {
      runtimeRef.current.handle.dispose()
      setRuntime(boot(data))
      setReloads((count) => count + 1)
    }
    return () => {
      swapScene = null
      runtimeRef.current.handle.dispose()
    }
  }, [])

  const entityCount = runtime.world.query(EntityMeta).length
  const assetById = new Map(runtime.assets.map((asset) => [asset.id, asset]))

  const gl = async (props: unknown) => {
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
  }

  // Debug bridge for verification/support tooling.
  ;(window as unknown as { __productDebug: () => unknown }).__productDebug = () => ({
    entities: entityCount,
    reloads,
  })

  return (
    <>
      <div className="badge">
        <div>
          MY <b>PRODUCT</b> @ :3000
        </div>
        <div>runtime: @ahengine/ecs-runtime</div>
        <div>entities: {entityCount} · live reloads: {reloads}</div>
        <div>
          editor: <b>http://localhost:5000</b>
        </div>
      </div>
      <div className="hint">Edit the scene at localhost:5000 — Ctrl+S updates this app live.</div>
      <Canvas gl={gl} shadows camera={{ fov: 50, near: 0.1, far: 600, position: [9, 6, 12] }}>
        <KootaScene
          world={runtime.world}
          runtime={{ materials: runtime.handle.materials, animator: runtime.handle.animator }}
          useGameCamera
          settings={runtime.settings}
          environmentLookup={(assetId) => {
            const record = assetById.get(assetId)
            return record ? { uri: record.uri } : undefined
          }}
          resolveAssetUri={(uri) => Promise.resolve(uri.startsWith('/') ? uri : `/${uri}`)}
        />
      </Canvas>
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ProductApp />
  </React.StrictMode>
)
