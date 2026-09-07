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
pnpm test           # 117 vitest tests (schema, runtime, editor, stress, e2e)
pnpm lint           # ESLint (typescript-eslint, flat config)
pnpm typecheck      # strict TS across all packages
pnpm build          # production build of every package + both apps
```

The standalone editor boots into a stylized test scene (camera, sun, ground,
water, trees, test cube) and persists to IndexedDB. The runtime demo loads
`showcase.koota-project.json` — environment, imported model, a TSL node
material, a nested A→B→C prefab, an animation clip + animator controller and
a particle effect — **without importing any editor package**.

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
- **Nested prefabs with overrides** — A→B→C nesting with cycle protection;
  instances store only field-level diffs; revert / unpack / apply included.
- **Node materials** — data-only definitions with a TSL node-graph editor
  (25-node catalog), live preview, texture sockets, debounced recompiles that
  react to semantics, not node drags.
- **Animation + Animator** — authored clips with keyframes and timeline
  scrub; Unity-style controllers (states, transitions, typed parameters,
  conditions, crossfades) over `AnimationMixer`.
- **Particles** — 9-module effect stacks (emission/shape/velocity/lifetime/
  forces/size/color/rotation/renderer) with curve + gradient editing and a
  live preview.
- **One product** — typed selection with deep links between every workspace,
  command palette (Ctrl+K), problems panel with validation, per-document
  undo stacks and dirty indicators, persisted preferences.
- **Undo/redo per document** — scene, prefab, material, animation and
  particle edits keep independent histories; gizmo drags commit exactly one
  command on release.
- **Play Mode** — serializes the authored world into a temporary runtime world;
  stopping discards it, authored data is never mutated.
- **Persistence** — IndexedDB (project JSON + binary asset blobs) with a
  one-generation corruption-recovery snapshot; imports run parse → migrate →
  validate before replacing state; per-domain export
  (`.koota-project.json`, `.koota-scene.json`, prefabs, materials,
  controllers, effects).

## Docs

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — layers, data flow, versions, limitations
- [`docs/EDITOR_SCOPE.md`](./docs/EDITOR_SCOPE.md) — what this is (and is not)
- [`docs/PROJECT_FORMAT.md`](./docs/PROJECT_FORMAT.md) · [`SCENE_FORMAT.md`](./docs/SCENE_FORMAT.md) · [`MATERIAL_FORMAT.md`](./docs/MATERIAL_FORMAT.md) · [`PREFAB_FORMAT.md`](./docs/PREFAB_FORMAT.md) · [`ANIMATION_FORMAT.md`](./docs/ANIMATION_FORMAT.md) · [`ANIMATOR_FORMAT.md`](./docs/ANIMATOR_FORMAT.md) · [`PARTICLE_FORMAT.md`](./docs/PARTICLE_FORMAT.md) — serialized data reference, one file per domain
- [`docs/RUNTIME_INTEGRATION.md`](./docs/RUNTIME_INTEGRATION.md) — loading editor output in your app
- [`docs/CONTRIBUTING.md`](./docs/CONTRIBUTING.md) — setup, commands, data-contract checklist

## Dev-only automation harness

Both apps support `?harness=1`, which keeps them alive inside hidden/headless
automation webviews (rAF + ResizeObserver fallbacks). It never activates in
normal browsing.
