# EDITOR SCOPE

## THIS IS A 3D AUTHORING EDITOR, NOT A GAME ENGINE

AHEngine is a **professional WebGPU 3D authoring editor for React Three Fiber
applications, powered by Koota ECS**. Its purpose is to visually author
reusable 3D **data** — scenes, materials, prefabs, animation — that any
R3F/Koota application loads at runtime.

The editor itself must **never be required in production applications**.
The exported JSON (+ the lightweight `@ahengine/ecs-runtime` loader) is the
product.

## Out of scope — permanently, unless explicitly requested in a later task

- game loop architecture
- gameplay scripting engine
- physics engine
- networking / multiplayer
- AI systems
- navigation / pathfinding
- game build system
- world partitioning / streaming
- any Unreal/Unity-like engine architecture

Nothing in this repository may grow toward that list.

## Supported authoring domains

| # | Domain | Status at baseline |
| --- | --- | --- |
| 1 | **Scene Editor** — entities, hierarchy, transforms, gizmos, viewport | Working |
| 2 | **Node-Based Material Editor** — TSL node graphs | Planned (property-based material authoring works today; schema is graph-ready, `three/tsl` verified available) |
| 3 | **Prefab Editor with Nested Prefabs** — reusable entity hierarchies, overrides | Working flat (create/instantiate/revert/unpack/apply-override); nested prefab authoring planned |
| 4 | **Animation Editor** — clips, timeline, keyframes | Clips + timeline preview working (from GLTF); authored keyframes planned |
| 5 | **Animator State Machine Editor** — states, transitions, parameters, conditions | Working (basic): node graph, entry state, clip assignment, transitions; condition editing minimal |
| 6 | **Scene Lighting / Environment Settings** — lights, fog, background, HDRI, tone mapping | Working |
| 7 | **Particle Editor** | Planned (no trait/UI yet) |

Also in scope as supporting systems: asset database (GLB/textures/HDR),
undo/redo, save/load (IndexedDB + host-repo file writes via the installable
`@ahengine/editor` vite plugin), import/export validation, play-mode preview
of authored data.

## Authoring data contract (summary)

- Output is **serialized DATA** (`.koota-project.json`, `.koota-scene.json`,
  `.koota-prefab.json`, `.koota-material.json`) — never React code, never
  Three.js object dumps, never JS source.
- Persistent UUIDs; stable component ids from the registry; plain primitive
- Runtime-only objects (`Object3D`, `NodeMaterial`, `Texture`,
  `AnimationMixer`) are rebuilt by the runtime and never serialized.
