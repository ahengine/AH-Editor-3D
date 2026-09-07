# ANIMATOR FORMAT (state machines)

Format identifier: `koota-3d-animator`. A controller is a graph of states
and parameter-guarded transitions — Unity-Mecanim-style, data-only.

## AnimatorControllerV2

```jsonc
{
  "format": "koota-3d-animator",
  "schemaVersion": 1,
  "id": "ac-orbit",
  "name": "Orbit Controller",
  "parameters": [
    { "id": "param-speed", "name": "speed", "type": "float", "defaultValue": 1 }
    // types: float | int | bool | trigger
  ],
  "states": [
    {
      "id": "state-orbit",
      "name": "Orbit",
      "clipId": "clip-orbit",     // authored clip id, GLTF clip name, or null
      "speed": 1,                 // playback multiplier
      "loop": true,
      "position": [280, 160]      // visual layout only (graph editor)
    }
  ],
  "transitions": [
    {
      "id": "tr-…",
      "from": "state-orbit", "to": "state-idle",
      "duration": 0.25,           // crossfade seconds
      "exitTime": 0.8,            // normalized within-clip exit point (0 = immediate)
      "conditions": [
        { "parameterId": "param-speed", "operator": "greater", "value": 0.5 }
      ]
    }
  ],
  "entryStateId": "state-orbit"
}
```

## Conditions

Operators are type-appropriate (validated by schema):
- `float` / `int`: `greater | less | equals`
- `bool`: `isTrue | isFalse`
- `trigger`: `fired` — consumed on transition, Unity-style

A transition fires when ALL its conditions pass. `exitTime > 0` additionally
gates on playback position. Crossfades blend actions over `duration`.

## Wiring

An entity animates when it carries:

```jsonc
"animation.animator": { "controllerId": "ac-orbit", "playing": true, "speed": 1, "initialState": "state-orbit" }
```

## Runtime

`AnimatorRuntime` (`@ahengine/ecs-runtime/animation`) drives per-entity
`THREE.AnimationMixer`s from controller data: parameter processing, trigger
consumption, crossfaded transitions, pause/resume via `timeScale`. Entity
destruction routes through `disposeObject`, stopping actions and dropping
mixer state so nothing leaks across scene reloads.
