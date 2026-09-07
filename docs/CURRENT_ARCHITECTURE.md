# CURRENT ARCHITECTURE — AHEngine Editor (Audit Baseline)

> Audited 2026-09-07 on branch `dev`. Every version and API below was read from
> the installed `node_modules` / `pnpm-lock.yaml`, not from memory.

## 1. Repository Facts

| Item | Value |
| --- | --- |
| Package manager | pnpm 11.4.0 (workspace, frozen lockfile green) |
| Workspace globs | `apps/*`, `packages/*` (`examples/product-app` is npm-installed from tarballs, outside the workspace) |
| React / ReactDOM | 19.2.8 |
| TypeScript | 5.9.3, `strict: true`, `moduleResolution: bundler`, project references |
| @react-three/fiber | 9.7.0 |
| three | 0.185.1 (`three/webgpu` + `three/tsl` verified present) |
| koota | 0.6.6 |
| zod | 4.5.4 |
| zustand | 5.0.15 |
| vite | 8.2.2 |
| Lint | **not configured** (no ESLint config in repo) |
| Tests | vitest, 5 files / 29 tests, all passing |
| Source size | ~10.1k LOC TS/TSX across 6 workspace packages |

### Koota API surface actually used (all verified against installed 0.6.6)

- Core: `createWorld`, `trait`, `relation`, `Entity`, `World`, `Trait` (types);
  entity methods `add([Trait, value])`, `set`, `get`, `remove`, `has`, `destroy`,
  `isAlive`, `targetFor(ChildOf)`; `world.spawn`, `world.query(…)` incl.
  relation pairs `world.query(ChildOf(parent))`, `world.onAdd/onRemove/onChange`.
- `koota/react` (`WorldProvider`, `useTrait`, `useQuery`, …) is **installed but
  intentionally unused** — the editor drives React reactivity through a
  `worldVersion` counter bumped by koota subscriptions, and per-frame work
  imperatively inside `useFrame`. This is a deliberate performance decision,
  not an omission.

### three/webgpu + TSL surface verified

- `three/webgpu`: `WebGPURenderer`, `MeshStandardNodeMaterial`,
  `MeshPhysicalNodeMaterial`, `MeshBasicNodeMaterial`, `NodeMaterial`,
  `PostProcessing` — all present.
- `three/tsl`: `texture`, `time`, `uv`, `vec3`, `float`, `color`, `uniform`,
  `positionLocal`, `mx_noise_float` present (`equirectTexture` **not** exported
  in 0.185.1 — do not use it).
- No `onBeforeCompile`, no `RawShaderMaterial`, no legacy `EffectComposer`
  anywhere in the codebase.

## 2. Workspace Structure

```
apps/editor (pkg @ahengine/editor-dev)   standalone editor (IndexedDB persistence) → :5173
apps/runtime-demo                        loads exported JSON w/o editor packages    → :5174
packages/project-schema (@ahengine/project-schema)   pure data: types, zod v1 schemas,
                                                     migrations, validators (tsup → dist, publishable)
packages/ecs-runtime (@ahengine/ecs-runtime)         runtime kernel: traits, registry,
                                                     serializer, loadScene, materials,
                                                     animation, R3F bridge (tsup, publishable)
packages/editor-core                     editor domain: zustand store, commands/undo,
                                         asset db, persistence backends, prefab ops,
                                         play mode (source-consumed, not published)
packages/editor-ui                       React UI (source-consumed; bundled into @ahengine/editor)
packages/editor (@ahengine/editor)       installable vite plugin + node server +
                                         prebuilt editor bundle (tsup+vite, publishable)
examples/product-app                     real product installed from tarballs (:3001 product,
                                         :5000 editor) — proves `npm i @ahengine/editor`
examples/basic-scene.*.json              serializer-generated example data
tests/                                   5 vitest suites (schema, ecs, prefab, loader, animation)
```

## 3. The Three-Layer Boundary (current state)

```
AUTHORING DATA (JSON)      KOOTA ECS STATE           THREE.JS / WEBGPU OBJECTS
SerializedEntity           live world entities       Object3D / NodeMaterial /
stable component ids       ChildOf relations         Texture / AnimationMixer
persistent UUIDs           trait values (plain)      — held ONLY in the
                           ThreeObject trait (non-   non-serializable ThreeObject
                           serializable bridge)      trait + service caches
```

Enforcement points that exist today:

- `serializeSceneEntities` walks **registry-serializable traits only**;
  `ThreeObject`, `PrefabInstance`, `InstanceMember` never leak (InstanceMember
  skipped as prefab member; PrefabInstance serialized as `prefab.instance`).
- Component data is plain (numbers/strings/arrays) — `core.transform` exports
  `position:[x,y,z]`, never THREE vectors.
- `loadScene` rebuilds runtime objects from data; `MaterialService` /
  `AssetCache` / `AnimatorRuntime` are the only constructors of GPU objects.
- Editor-only state lives in the zustand store (`selection`, `hovered`, `tool`,
  `space`, snap, tabs, `worldVersion`, play mode, `viewportScale`,
  `gridVisible`, clipboard) — none of it appears in exported JSON (verified by
  round-trip tests + generated example files).

## 4. Renderer Flow

1. `Viewport` (editor-ui) creates an R3F `<Canvas>` with an async `gl` factory:
   `new WebGPURenderer({antialias}) → renderer.init()`; on throw, retries with
   `forceWebGL: true` (WebGL2 backend of the same renderer) and sets the
   backend chip accordingly. Same pattern in runtime-demo, product-app and the
   MaterialEditor preview sphere.
2. `KootaScene` (`ecs-runtime/react`) is the single render bridge used by BOTH
   the editor viewport and runtime products: inside one `useFrame` it
   diff-syncs `world.query(Transform)` → `Object3D` tree, hierarchy via
   `ChildOf`, meshes/models/lights/cameras, streams trait→object (or
   object→trait for entities in `gizmoDragTargets`), then advances
   `AnimatorRuntime`. Zero React state per frame.
3. Editor rig (grid, OrbitControls, TransformControls gizmo, raycast picking,
   BoxHelper outline, focus, camera presets, stats) lives in editor-ui and is
   NOT part of the published runtime.

## 5. Editor State Flow

```
UI events → editor-core actions/commands (undo stack) → Koota world
                                      │
                 world.onAdd/onRemove/onChange(registered traits)
                                      ↓
                  store.bumpWorld() → worldVersion++ (structural rerenders only)
                                      ↓
        Hierarchy / Inspector / Timeline re-render from world queries
```

- High-frequency values (transform drag, sliders) write traits directly; undo
  commands capture before/after (gizmo = ONE command per drag).
- Play mode: serialize authored world → `loadScene` into a temporary world →
  render that world with game camera; stop destroys it. Authored data never
  mutated.

## 6. Asset Flow

- Imported files → `ProjectBackend.importAsset`:
  - standalone: IndexedDB blob, uri `idb://<id>` (resolved via object URLs)
  - host mode (`@ahengine/editor` plugin): POSTed to the dev server, written
    into the product repo, root-relative uri (e.g. `game-assets/x.glb`)
- `AssetRecord` (id/type/name/uri) lives in project JSON; binaries never embedded.
- `AssetCache` (GLTFLoader / TextureLoader / RGBELoader) is the only loader,
  keyed by URL; `modelAnimationRegistry` publishes GLTF clips for the animator.

## 7. Serialization Flow

`world → serializeSceneEntities (registry defs) → SceneData/ProjectData →
parseProject/parseScene (zod + migrations) → validateSceneIntegrity +
validateSceneComponents (registry schemas) → loadScene/deserializeScene
(two-pass: spawn all → link ChildOf)`.

Prefab instances serialize as their root + field-level `overrides`; members are
rebuilt from the prefab definition. UUIDs are persistent; koota entity ids are
never serialized.

## 8. Persistence

- Standalone editor: IndexedDB (`ahengine` DB: `projects` + `blobs` stores),
  autosave every 30 s when dirty.
- Host mode: HTTP API of the plugin's node server — `GET/PUT /api/project`
  writes `src/game/game.koota-project.json` into the host product; assets
  `POST/DELETE /api/asset`; both dev servers serve `/game-assets/*`.

## 9. Existing Problems & Technical Debt (editor-relevant)

1. **No lint** — no ESLint config; only `tsc --strict` guards quality.
2. **findEntityByUuid is O(n)** — uuid→entity lookup walks `query(EntityMeta)`
   per call (editor hot paths: gizmo attach, inspector, picking). Fine at
   current scale; needs an index before thousands of entities.
3. **Two animation edit surfaces** — timeline tracks (TimelinePanel) and the
   controller node graph (AnimatorPanel) share data but not selection state;
   the state-machine editor is basic (no condition editor UI wiring for
   parameters beyond first parameter).
4. **Material system is property-list only** — Node Materials are built from
   fixed properties; no node graph yet (schema is designed to extend, TSL
   available, nothing built).
5. **Prefabs: no nested prefab authoring** — data model reserves it, editor
   only supports flat instances; user-added children under an instance root are
   dropped on save.
6. **Particles: absent** — no trait, no UI (in scope, not started).
7. **GLB import via file dialog only** — no drag-from-OS; GLTF node→entity
   explosion intentionally deferred.
8. **Play-mode pause UI** exists but play-mode systems are minimal (no authored
   gameplay behaviour — by design, out of scope).
9. **Editor bundle duplication** — MaterialEditor preview creates a second
   WebGPU context; acceptable but worth a shared preview renderer later.
10. **`window.__ahDebug` / `?harness=1`** debug affordances ship in dev bundles
    (gated by query param; not active in normal use).
11. **Tests cover data layer only** — 29 tests for schema/serialize/prefab/
    loader/animator-runtime; zero component/UI tests.

## 10. Baseline Status (end of audit)

- `pnpm install --frozen-lockfile` — OK
- `tsc -b` (whole workspace, strict) — exit 0
- `vitest` — 29/29 passing
- Production builds: editor-dev ✓, runtime-demo ✓, @ahengine/editor ✓ (tarball)
- Browser run: WebGPU backend active, `navigator.gpu` present, **0 console
  errors** across selection/inspect/timeline/material flows
- Dead code removed during audit: stale `editor-ui/src/index.ts` placeholder,
  unused `Toolbar.tsx`
