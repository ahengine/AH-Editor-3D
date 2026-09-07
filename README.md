# AHEngine — Installable WebGPU 3D Editor for React Three Fiber + Koota ECS

A real, browser-based scene editor built for **React 19 + Three.js WebGPU (TSL/Node Materials) + Koota ECS**.
The editor authors **data, not code**: exported JSON loads in any Koota application through a lightweight
runtime package — the editor is never required at runtime.

## Install the editor into YOUR product (`npm i`)

```bash
npm i @ahengine/editor          # vite plugin + full editor UI
npm i @ahengine/ecs-runtime    # runtime (traits, loader, render bridge)
```

```ts
// vite.config.ts of your product
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ahengineEditor } from '@ahengine/editor'

export default defineConfig({
  plugins: [
    react(),
    ahengineEditor({ editorPort: 5000, projectFile: 'src/game/game.koota-project.json' }),
  ],
})
```

```ts
// src/main.tsx of your product — render the authored scene
import { createWorld } from 'koota'
import { loadScene, UrlAssetResolver } from '@ahengine/ecs-runtime'
import { KootaScene } from '@ahengine/ecs-runtime/react'
import projectData from './game/game.koota-project.json'

const world = createWorld()
const scene = loadScene(world, projectData, { assetResolver: new UrlAssetResolver('') })
```

`npm run dev` then serves:

- **your product → http://localhost:3000** (its own port)
- **the AHEngine editor → http://localhost:5000**

Build scenes, prefabs, materials, animations and animator controllers in the
editor; **Ctrl+S writes them into your product's source tree**
(`src/game/game.koota-project.json` + `game-assets/`) — Vite HMR updates your
running product live. Scene/prefab/material/animator data all live in that one
versioned project file; commit it with your code.

A complete working example lives in [`examples/product-app`](./examples/product-app)
(a plain Vite app installed from the packed tarballs — product + editor + live
HMR round trip).

### Building/packing the packages locally

```bash
pnpm build:packages   # tsup + vite builds for schema/runtime/editor
pnpm pack:all         # ahengine-*.tgz tarballs at the repo root
```

The tarballs are self-contained (the runtime bundles the schema; the editor
bundle ships inside `@ahengine/editor/dist`) — publish them to your registry
of choice or install straight from the `.tgz` files.

```
┌──────────────────────────────────────────────────────┐
│ Toolbar (logo · project · menus · WebGPU status)     │
├──────────────┬─────────────────────────┬─────────────┤
│ Hierarchy    │        Viewport         │  Inspector  │
│  (full       │   WebGPU · gizmo ·      │  registry-  │
│   height)    │   grid · picking        │  driven     │
│              ├─────────────────────────┴─────────────┤
│              │ Assets │ Materials │ Animator         │
└──────────────┴───────────────────────────────────────┘
```

## Editor workspace (this repo)

```bash
pnpm install
pnpm dev            # standalone editor      → http://localhost:5173
pnpm dev:runtime    # runtime demo           → http://localhost:5174
pnpm test           # 29 vitest tests
pnpm typecheck      # strict TS across all packages
pnpm generate:example   # regenerate examples/*.json through the real serializer
```

The standalone editor boots into a stylized test scene (camera, sun, ground,
water, trees, test cube) and persists to IndexedDB. The runtime demo loads
`examples/basic-scene.koota-project.json` (including an animated GLB +
animator controller) **without importing any editor package**.

## Workspace

| Package | Purpose |
| --- | --- |
| `apps/editor-dev` | Standalone editor playground (IndexedDB persistence) |
| `apps/runtime-demo` | Proves exported data loads editor-free |
| `packages/project-schema` | Types, Zod schemas, migrations, validation (**publishable**) |
| `packages/ecs-runtime` | Koota traits, component registry, serializer, `loadScene`, R3F render bridge (**publishable**) |
| `packages/editor` | **`@ahengine/editor`** — installable vite plugin: serves the editor beside your product and saves into your repo (**publishable**) |
| `packages/editor-core` | Selection, commands/undo, assets, prefabs, persistence, play mode |
| `packages/editor-ui` | Hierarchy / viewport / inspector / bottom dock UI |
| `examples/product-app` | A real product consuming the packed tarballs (:3000 + editor :5000) |

## Feature highlights

- **WebGPU-first viewport** — `WebGPURenderer` via async R3F `gl`, automatic
  WebGL2 fallback, status chip in the toolbar, diagnostics overlay
  (FPS / frame time / draw calls / triangles / entity count).
- **Koota ECS as the single source of truth** — hierarchy via the `ChildOf`
  relation, every editor action mutates the world; UI never keeps a shadow tree.
- **Component registry** — stable ids (`core.transform`, `render.light`, …)
  drive serialization, validation and the entire inspector UI (number / vec3 /
  color / enum / slider / asset fields, add/remove/copy/paste/reset).
- **Persistent UUIDs** — Koota entity ids never leave the session; all
  references (hierarchy, cameras, prefabs) use authored UUIDs.
- **Prefabs with overrides** — instances store only field-level diffs;
  revert / unpack / apply-override-to-prefab included.
- **Materials as project assets** — data-only `MaterialDefinition`s built into
  Node Materials (`MeshStandardNodeMaterial` …), live preview sphere,
  texture maps, future TSL-graph compatible.
- **Animator** — Unity-style controllers (states, transitions, conditions,
  parameters) with a functional node graph, timeline preview and an
  `AnimationMixer` runtime covered by unit tests.
- **Undo/redo everywhere** — command stack; gizmo drags commit exactly one
  command on release.
- **Play Mode** — serializes the authored world into a temporary runtime world;
  stopping discards it, authored data is never mutated.
- **Persistence** — IndexedDB (project JSON + binary asset blobs), autosave,
  import/export of `.koota-project.json` / `.koota-scene.json`.

## Docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — layers, data flow, performance rules
- [`PROJECT_FORMAT.md`](./PROJECT_FORMAT.md) — serialized data reference
- [`KOOTA_RUNTIME.md`](./KOOTA_RUNTIME.md) — loading editor output in your app

## Dev-only automation harness

Both apps support `?harness=1`, which keeps them alive inside hidden/headless
automation webviews (rAF + ResizeObserver fallbacks). It never activates in
normal browsing.
