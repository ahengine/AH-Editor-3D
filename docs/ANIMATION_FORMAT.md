# ANIMATION FORMAT (clips)

Format identifier: `koota-3d-animation-clip`. Clips are baked keyframe
tracks over component properties — authored per entity, referenced by
animator states.

## AnimationClipData

```jsonc
{
  "format": "koota-3d-animation-clip",
  "schemaVersion": 1,
  "id": "clip-orbit",
  "name": "Orbit",
  "duration": 4,                 // seconds
  "fps": 30,                     // authored sampling rate
  "tracks": [
    {
      "id": "track-orbit-y",
      "target": "3f9c2a10-…",     // entity UUID (scene) or localId (prefab)
      "targetName": "Shrine A",   // display only
      "component": "core.transform",
      "property": "rotation.y",   // path within the component
      "valueType": "number",      // number | vec3 | color | quaternion
      "keyframes": [
        { "id": "kf-1", "time": 0, "value": 0,   "interpolation": "linear" },
        { "id": "kf-2", "time": 4, "value": 360, "interpolation": "linear" }
      ]
    }
  ]
}
```

`interpolation`: `step` holds the previous value; `linear` interpolates.
GLTF imports map animation clips to the same shape, with `sourceAssetId`
pointing at the model asset.

## Runtime evaluation

`sampleClip` / `sampleTrack` (`@ahengine/ecs-runtime/animation-clip`) are
pure functions: track → value at time t, with step/linear semantics per
keyframe. `applyClipSample` writes sampled values onto live entities via
the component registry; scrubbing the editor timeline uses the exact same
samplers the runtime uses.

## Animator integration

Animator states reference clips by `clipId` (authored clips) or by GLTF
clip name (model-embedded animations). See ANIMATOR_FORMAT.md.
