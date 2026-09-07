# Architecture

## The three layers (never collapse them)

```
AUTHORING DATA          KOOTA ECS STATE          THREE.JS GPU OBJECTS
(JSON, durable)         (live world)             (runtime-only)
     ▲ serialize             ▲ traits                 ▲ Object3D/Material/Texture
     │                       │                        │  in ThreeObject trait
     └─────── loadScene ─────┴────────────────────────┘  (never serialized)
```

- **Authoring data** — plain JSON with stable component ids and persistent UUIDs.
- **Koota state** — the live editing world (and temporary play-mode worlds).
- **GPU objects** — rebuilt from data; stored only in the non-serializable
  `ThreeObject` trait and the material/asset caches.

## Data flow

```
Editor UI → Actions → Command Stack → Koota World
                                           │
                    ┌──────────────────────┴──────────────────────┐
                    ▼                                             ▼
          KootaScene (R3F bridge, imperative)              Serializer
          query → Object3D sync in useFrame                 world → JSON
                    │                                             │
                    ▼                                             ▼
               WebGPU GPU                                  Any Koota project
```

## Packages

### `packages/editor` → **`@ahengine/editor`** (installable npm package)

The product-facing entry point:

```ts
// vite.config.ts of any product
import { ahengineEditor } from '@ahengine/editor'
plugins: [react(), ahengineEditor({ editorPort: 5000, projectFile: 'src/game/game.koota-project.json' })]
```

- `src/plugin.ts` — vite plugin: ensures a starter project file, serves
  `/game-assets/*` on the product's own dev server, boots the editor server.
- `src/server.ts` — zero-dependency node HTTP server: serves the packaged
  editor bundle (`dist/editor`, base `/__ah/`) + `GET/PUT /api/project`
  (writes the project file into the product's source tree) + asset
  upload/delete into the assets dir.
- `editor/` — the editor app bundled at build time (vite) from
  `@ahengine/editor-ui`.

The editor detects host mode through an injected `window.__AHENGINE_HOST__`
and swaps its persistence backend (`editor-core/backend.ts`) from IndexedDB to
the HTTP API — scenes, prefabs, materials and animator controllers saved with
Ctrl+S land in the product's repo, and Vite HMR live-updates the running
product.

`examples/product-app` is a real product installed from the packed tarballs
(`pnpm pack:all` → `npm i ../../ahengine-*.tgz`) proving the whole loop.

### `packages/project-schema`
Pure data: TypeScript interfaces, Zod schemas (v1), migration chain
(`migrations[fromVersion]`), validators (`parseProject`, `validateSceneIntegrity`).
No engine imports — usable anywhere.

### `packages/ecs-runtime`
The runtime-safe kernel. **No editor UI imports allowed.**

- `traits.ts` — Koota traits (`EntityMeta`, `Transform`, `PrimitiveMesh`,
  `ModelRenderer`, `MaterialReference`, `Light`, `Camera`, `Animator`,
  `PrefabInstance`, `InstanceMember`, `ThreeObject`).
- `relations.ts` — `ChildOf` (exclusive, orphan-auto-destroy) + cycle-safe
  reparenting helpers.
- `registry.ts` — the component registry: stable ids, Zod schemas, defaults,
  `serialize`/`deserialize`, inspector field metadata. Drives serialization,
  validation *and* the inspector UI from one definition.
- `serialize.ts` — world ↔ `SerializedEntity[]`; instance members collapse
  into the instance root on save.
- `prefabs.ts` — create/instantiate/diff (`computeInstanceOverrides` produces
  field-level patches), `applyPatch`.
- `loader.ts` — `loadScene(world, data, {assetResolver})` → `{entitiesById,
  rootEntities, materials, animator, dispose}`; validates schema + integrity +
  component data before spawning.
- `materials.ts` — `MaterialService`: definitions → Node Materials with async
  texture maps; rebuild-on-edit keeps the viewport live.
- `animation.ts` — `AnimatorRuntime`: mixers per entity, controller state
  machine, transitions with conditions/exit times.
- `react/KootaScene.tsx` — the render bridge (below).

### `packages/editor-core`
Editor domain: zustand store (selection, tools, panels, play mode), world
reactivity wiring (koota events → structural rerenders only), command stack +
all undoable commands, asset DB (`idb://` blobs + records), IndexedDB
persistence, project bootstrap/default scene, prefab operations, play mode.

### `packages/editor-ui`
The dark slate UI matching `Design/Editor Concept.png`: menu bar, toolbar with
raised transform-tools group and WebGPU chip, full-height hierarchy with the
blue-gradient selection row, viewport overlays, registry-driven inspector,
bottom dock (Assets / Materials / Animator with node graph + timeline).

## Render bridge rules (KootaScene)

1. **No React state per frame.** Structural diffing of koota queries inside
   `useFrame` adds/removes `Object3D`s; transforms stream trait → object.
2. **During gizmo drags** the object is authority: the bridge streams
   object → trait (`gizmoDragTargets`), and the editor commits ONE undo command
   on drag release.
3. **Hierarchy follows relations** — child objects are re-parented when
   `ChildOf` changes.
4. **The same bridge powers the editor and games** — the editor viewport is
   literally `KootaScene` + editor rig (grid, gizmo, picking, outline).

## Performance rules

- Gizmo drags and inspector steppers write traits directly; React rerenders
  only for structural changes (spawn/destroy/component add/remove/rename via
  `worldVersion`).
- Geometry is cached per primitive key; materials and GLTF results are cached
  per uri; disposal happens on entity/asset removal.
- Diagnostics overlay writes to DOM nodes directly from rAF — zero React cost.

## Play mode

`serialize editor world → loadScene(tempWorld) → render KootaScene(playWorld,
useGameCamera)`. Stop destroys the temp world (guarded against Koota's cascade
destroys) and restores the editor world untouched.
