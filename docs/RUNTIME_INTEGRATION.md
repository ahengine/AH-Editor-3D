# RUNTIME INTEGRATION — Loading Editor Data in Your Application

The editor's product is **data**, not code. Any Koota + React Three Fiber
application can load exported scenes/materials/prefabs/animation without
importing any editor package.

## Package Boundary

| Package | Runtime? | Depends on |
|---|---|---|
| `@ahengine/project-schema` | ✓ | zod |
| `@ahengine/ecs-runtime` | ✓ | koota, three, @react-three/fiber (peer) |
| `@ahengine/editor` (vite plugin) | dev only | vite |
| `@ahengine/editor-core` | editor only | editor ecosystem |
| `@ahengine/editor-ui` | editor only | React, editor-core, lucide-react |

Your runtime application needs **only** the first two.

## Quick Start (R3F)

```tsx
import { createWorld } from 'koota'
import { Canvas } from '@react-three/fiber'
import {
  loadScene,
  MaterialService,
  AnimatorRuntime,
  UrlAssetResolver,
} from '@ahengine/ecs-runtime'
import { KootaScene } from '@ahengine/ecs-runtime/react'
import type { ProjectData } from '@ahengine/project-schema'
import { WebGPURenderer } from 'three/webgpu'

const world = createWorld()

// 1. Load exported data
const response = await fetch('/scenes/main.koota-project.json')
const data: ProjectData = await response.json()

// 2. Provide an asset resolver (your app decides where assets live)
const resolver = new UrlAssetResolver('/assets')

// 3. Load — validates, spawns Koota entities, resolves hierarchy/prefabs
const handle = await loadScene(world, data, { assetResolver: resolver })

// 4. Render
export function App() {
  return (
    <Canvas
      gl={async (props) => {
        const renderer = new WebGPURenderer({ ...props, antialias: true })
        await renderer.init()
        return renderer
      }}
      shadows
    >
      <KootaScene
        world={world}
        runtime={{ materials: handle.materials, animator: handle.animator }}
        useGameCamera
        settings={data.scene.settings}
        environmentLookup={(assetId) => {
          const asset = data.assets.find(a => a.id === assetId)
          return asset ? { uri: asset.uri } : undefined
        }}
        resolveAssetUri={(uri) => Promise.resolve(`/assets/${uri}`)}
      />
    </Canvas>
  )
}
```

## Quick Start (Vanilla Koota, no R3F)

```ts
import { createWorld } from 'koota'
import { loadScene, UrlAssetResolver } from '@ahengine/ecs-runtime'

const world = createWorld()
const handle = loadScene(world, projectData, {
  assetResolver: new UrlAssetResolver('/cdn/assets'),
})

// Access entities by persistent UUID
const player = handle.entitiesById.get('f71e...')

// Your own systems iterate Koota queries
for (const [transform] of world.query(Transform)) {
  // gameplay logic
}

// Clean teardown
handle.dispose()
```

## What loadScene Does

1. **Validates** — Zod schema + integrity (parent refs, cycles, asset refs)
2. **Migrates** — schemaVersion chain (v1 → vN)
3. **Spawns entities** — Koota entities with persistent UUIDs
4. **Applies traits** — from the component registry (`core.transform`, `render.light`, etc.)
5. **Resolves hierarchy** — `ChildOf` relations from `parentId` data
6. **Instantiates prefabs** — recursive, with nested instances and overrides
7. **Builds materials** — MaterialService creates Node Materials (WebGPU TSL)
8. **Initializes animator** — AnimatorRuntime for state machine playback
9. **Returns handle** — `{ entitiesById, rootEntities, materials, animator, dispose() }`

## Asset Resolution

Assets serialize as infrastructure-agnostic records:

```json
{ "id": "asset-model", "type": "model", "name": "player.glb", "uri": "player.glb" }
```

Implement `AssetResolver` to map records to real URLs:

```ts
class S3Resolver {
  async resolve(asset: AssetRecord): Promise<string> {
    return `https://my-bucket.s3.amazonaws.com/assets/${asset.uri}`
  }
}
```

The editor uses IndexedDB (`idb://` URIs) internally — exported data never
references editor storage.

## Per-Domain Export APIs

Each authoring domain exports as a standalone JSON file:

```ts
import {
  exportProject, exportScene, exportMaterial, exportPrefab,
  exportAnimationClip, exportAnimatorController, exportParticleEffect,
  downloadJson,
} from '@ahengine/ecs-runtime'

// Editor usage (runtime apps never call these)
downloadJson(exportScene(sceneData), 'main.koota-scene.json')
downloadJson(exportMaterial(matDef), 'gold.koota-material.json')
```

## Format Extensions

| Domain | Extension |
|---|---|
| Project | `.koota-project.json` |
| Scene | `.koota-scene.json` |
| Material | `.koota-material.json` |
| Prefab | `.koota-prefab.json` |
| Animation Clip | `.koota-animation.json` |
| Animator Controller | `.koota-animator.json` |
| Particle Effect | `.koota-particle.json` |

## What Never Serializes

- `THREE.Object3D`, `THREE.Material`, `THREE.Texture` instances
- GPU buffers, WebGPU resources
- `AnimationMixer` runtime objects
- Koota internal entity IDs
- React components or editor UI state
- JavaScript functions

All runtime objects are reconstructed by `loadScene` and the render bridge.

## Verification

The runtime demo (`apps/runtime-demo`) proves the boundary:
- Imports only `@ahengine/ecs-runtime` + `@ahengine/project-schema`
- Zero editor packages
- Bundle analysis: no `editor-core`, `editor-ui`, `AssetBrowser`,
  `commandStack`, `Inspector`, `Hierarchy` references
- Loads exported project JSON → identical scene renders
