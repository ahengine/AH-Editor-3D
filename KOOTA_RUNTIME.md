# Loading Editor Output in Your Own App

The editor is authoring software. Your game needs only:

```
koota + three (WebGPU) + @react-three/fiber (optional)
@ahengine/ecs-runtime        ← the lightweight runtime package
your exported .koota-project.json / .koota-scene.json
```

No editor package is imported at runtime — this is exactly what
`apps/runtime-demo` proves.

## Vanilla Koota (no React)

```ts
import { createWorld } from 'koota'
import { loadScene, UrlAssetResolver } from '@ahengine/ecs-runtime'

const world = createWorld()

const handle = loadScene(world, projectData, {
  // Resolve asset records to real URLs — /public, CDN, S3, R2, IPFS…
  assetResolver: new UrlAssetResolver('https://cdn.example.com/assets'),
})

handle.entitiesById.get(uuid)      // persistent-uuid → koota Entity
handle.rootEntities                // scene roots
handle.materials                   // MaterialService (NodeMaterial cache)
handle.animator                    // AnimatorRuntime
handle.dispose()                   // tears the scene down cleanly

// your systems:
for (const [pos] of world.query(Transform)) { /* … */ }
```

## React Three Fiber

```tsx
import { createWorld } from 'koota'
import { WorldProvider } from 'koota/react'
import { Canvas } from '@react-three/fiber'
import { loadScene, UrlAssetResolver } from '@ahengine/ecs-runtime'
import { KootaScene } from '@ahengine/ecs-runtime/react'

const world = createWorld()
const handle = loadScene(world, projectData, { assetResolver: new UrlAssetResolver('/assets') })
const assetById = new Map(projectData.assets.map((a) => [a.id, a]))

export function Game() {
  return (
    <Canvas
      gl={async (props) => {
        const { WebGPURenderer } = await import('three/webgpu')
        const renderer = new WebGPURenderer({ ...props, antialias: true })
        await renderer.init()
        return renderer
      }}
      shadows
    >
      <KootaScene
        world={world}
        runtime={{ materials: handle.materials, animator: handle.animator }}
        useGameCamera                       // drive R3F camera from the scene camera entity
        settings={projectData.scene.settings}
        environmentLookup={(assetId) => {
          const record = assetById.get(assetId)
          return record ? { uri: record.uri } : undefined
        }}
        resolveAssetUri={(uri) => Promise.resolve(`/assets/${uri}`)}
      />
    </Canvas>
  )
}
```

`KootaScene` synchronizes koota state → THREE objects every frame
(transforms, meshes, models, lights, cameras, animator) without React
rerenders.

## Asset resolution

Assets serialize as infrastructure-agnostic records:

```jsonc
{ "id": "asset-animated-box", "type": "model", "uri": "animated-box.glb" }
```

Implement `AssetResolver { resolve(asset): Promise<string> }` to map records to
real URLs — static hosting, CDN, S3, Cloudflare R2, IPFS, your own CMS. In the
editor, imported binaries live in IndexedDB and resolve through `idb://` blob
URLs; the exported JSON stays clean.

## What the runtime reconstructs

| Serialized | Runtime object |
| --- | --- |
| `core.transform` | local position/rotation(euler°)/scale on the entity `Object3D` |
| `render.mesh` | cached primitive geometry |
| `render.model` | GLTF via `AssetCache` (clips registered for the animator) |
| `render.material` | `MaterialService` → Node Materials (WebGPU) |
| `render.light` / `render.camera` | live lights / game camera |
| `animation.animator` | `AnimatorRuntime` mixers + controller state machine |
| `prefab.instance` | full hierarchy from the prefab + field overrides |
| scene settings | fog, background, environment (HDR), tone mapping, shadows |

Runtime-only objects (`Object3D`, materials, textures, mixers) never appear in
the JSON — `loadScene` rebuilds them deterministically.
