# CONTRIBUTING

## Setup

```bash
pnpm install
pnpm --filter @ahengine/project-schema build   # workspace deps build from src
pnpm dev          # editor standalone  → http://localhost:5173
pnpm demo         # runtime demo       → http://localhost:5174
```

## Commands

| Command | What it does |
|---|---|
| `pnpm test` | Full vitest suite (schema, runtime, editor, stress, showcase e2e) |
| `pnpm lint` | ESLint (typescript-eslint recommended, zero-any policy) |
| `pnpm typecheck` | `tsc --noEmit` across every package |
| `pnpm build` | Production build of every package + both apps |
| `pnpm generate:example` | Regenerate the editor's example project JSON |

All three must be green before review — lint errors are fixed, never
disabled. We do not silence TypeScript with `any`; the few external-edge
casts that exist are narrow and commented.

## Architecture map

```
packages/project-schema   zod schemas, migrations, integrity validation (deps: zod only)
packages/ecs-runtime      traits, registry, serialize, prefabs, loader, materials,
                          material-graph compiler, animation, particles, R3F bridge
packages/editor-core      zustand store, commands/undo, navigation, project io (editor-only)
packages/editor-ui        React editor shell + workspaces (editor-only)
packages/editor           npm-installable vite plugin + dev server
apps/editor-dev           standalone editor harness
apps/runtime-demo         ZERO-editor-imports proof: loads exported JSON
```

**The boundary rule:** `ecs-runtime` and `project-schema` must never import
anything from `editor-core`/`editor-ui`. A host application loads exported
data without the editor — the demo app enforces this by construction.

## Data-contract checklist for new features

1. Author the zod schema + types in `project-schema` (with integrity rules).
2. Register version + migration slot if the shape can evolve.
3. Wire traits/registry ids in `ecs-runtime`; keep serialization lossless.
4. Editor surfaces go through the command stack (per-document undo) and
   `openAsset` navigation in `editor-core`, UI in `editor-ui`.
5. Tests: schema round-trip, integrity rejection, runtime load, and — for
   anything users author — a showcase/e2e assertion.

## Performance ground rules

- Profile before optimizing; keep Diagnostics (View ▸ Diagnostics) numbers
  honest (per-frame draw calls/triangles are interval deltas).
- No per-frame allocations in the render bridge's sync loop.
- Transform edits stream trait ↔ Object3D imperatively inside `useFrame`;
  React state changes only on structural edits.
- Shared GPU resources (primitive geometry cache, MaterialService, asset
  cache) are never disposed by their users — ownership stays with the cache.

## Commit style

`feat|fix|docs|test(scope): summary` — one logical change per commit, on
`dev`. Phases land as single commits after their QA audit passes.
