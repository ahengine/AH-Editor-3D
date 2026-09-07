# EDITOR SCOPE

## THIS IS A 3D AUTHORING EDITOR, NOT A GAME ENGINE

AHEngine is a **professional WebGPU 3D authoring editor for React Three Fiber
applications, powered by Koota ECS**. Its purpose is to visually author
reusable 3D **data** — scenes, materials, prefabs, animation, particles —
that any R3F/Koota application loads at runtime.

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

## Authoring domains — final state

| # | Domain | Status |
| --- | --- | --- |
| 1 | **Scene Editor** — hierarchy, transforms, gizmos, snapping, shortcuts | Complete |
| 2 | **Node-Based Material Editor** — TSL node graphs, live preview, texture sockets | Complete |
| 3 | **Prefab Editor** — create, instantiate, nested A→B→C, overrides, cycle protection | Complete |
| 4 | **Animation Editor** — authored clips, keyframes, timeline scrub | Complete |
| 5 | **Animator State Machine Editor** — states, transitions, typed parameters, conditions, crossfade | Complete |
| 6 | **Lighting / Environment** — lights, fog, background, HDRI, tone mapping, shadows | Complete |
| 7 | **Particle Editor** — 9-module stacks, curves/gradients, live preview | Complete |
| 8 | **Assets** — GLB/texture/HDR import, thumbnails, reference counting, type filters | Complete |
| 9 | **Cross-editor workflow** — typed selection, deep links, palette (Ctrl+K), problems panel, per-document undo/dirty, preferences | Complete |
| 10 | **Runtime consumption** — export per domain, zero-editor loader, installable vite plugin | Complete |

Supporting systems: undo/redo per document, debounced autosave with a
one-generation corruption snapshot, import validation (parse → migrate →
validate → load), WebGPU with WebGL2 fallback and an explicit fatal state
when neither is available.

## Authoring data contract (summary)

- Output is **serialized DATA** (`.koota-project.json` and per-domain
  exports) — never React code, never Three.js object dumps, never JS source.
- Persistent UUIDs; stable component ids from the registry; plain primitives.
- Runtime-only objects (`Object3D`, `NodeMaterial`, `Texture`,
  `AnimationMixer`) are rebuilt by the runtime and never serialized.

Per-domain shapes: see `docs/PROJECT_FORMAT.md`, `SCENE_FORMAT.md`,
`MATERIAL_FORMAT.md`, `PREFAB_FORMAT.md`, `ANIMATION_FORMAT.md`,
`ANIMATOR_FORMAT.md`, `PARTICLE_FORMAT.md`.
