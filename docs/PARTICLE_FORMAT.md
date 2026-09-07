# PARTICLE FORMAT

Format identifier: `koota-3d-particle-effect`. A particle effect is a
stack of optional modules over a shared emitter definition — Unity's
system shape, authored as data.

## ParticleEffectData

```jsonc
{
  "format": "koota-3d-particle-effect",
  "schemaVersion": 1,
  "id": "fx-shrine",
  "name": "Fire",
  "modules": { /* module blocks — all optional */ }
}
```

## Modules (every module: `{ enabled, …fields }`, omit = off)

| Module | Fields |
|---|---|
| `emission` | `rate` (particles/sec), `burst`, `burstDelay`, `maxParticles` |
| `shape` | `shape` (`point \| sphere \| cone \| box`), `angle`, `radius` |
| `velocity` | `speed` curve, `direction` mode (`billboard \| world \| local`) |
| `lifetime` | `min`, `max` seconds |
| `forces` | `gravity` vec3, `drag` |
| `size` | start/end curve (`over lifetime`) |
| `color` | color + alpha gradients (`over lifetime`) |
| `rotation` | start/end angular speed |
| `renderer` | `blendMode` (`additive \| alpha`), `textureAssetId`, `billboard` |

Curves and gradients are shared primitives (`curve.ts`): arrays of
`(time, value)` keys / `(time, color, alpha)` stops with
`sampleCurve` / `sampleGradientColor` evaluators — the same samplers run in
the editor preview and the runtime.

## Scene wiring

```jsonc
"particle.emitter": { "effectId": "fx-shrine", "playing": true, "rate": 0, "seed": 0 }
```

`rate: 0` means "use the effect's own rate"; a positive value overrides it
per instance.

## Runtime

`ParticleSystemInstance` (`@ahengine/ecs-runtime`) simulates on batched
TypedArrays (SoA) and renders through THREE.Points with a shader-driven
size/fade — CPU simulation V1, structured so a GPU compute pass can replace
the update loop without touching data. `dispose()` frees geometry and
material exactly once; scene reloads dispose instances with their entities.
