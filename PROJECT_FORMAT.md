# Project Format Reference

All files are JSON, versioned through a top-level `schemaVersion`
(currently `1`) and a `format` discriminator. Migration infrastructure lives in
`packages/project-schema/src/migrations.ts` (`migrations[fromVersion]` steps).

## Formats

| Extension | Format constant | Root |
| --- | --- | --- |
| `.koota-project.json` | `koota-3d-project` | `ProjectData` |
| `.koota-scene.json` | `koota-3d-scene` | `SceneData` |
| `.koota-prefab.json` | `koota-3d-prefab` | `PrefabDefinition` |
| `.koota-material.json` | `koota-3d-material` | `MaterialAsset` |

## ProjectData

```jsonc
{
  "format": "koota-3d-project",
  "schemaVersion": 1,
  "project": { "id": "project-…", "name": "Stylized Island", "createdAt": "…", "updatedAt": "…" },
  "scene": { /* SceneData */ },
  "assets": [ /* AssetRecord[] */ ],
  "materials": [ /* MaterialDefinition[] */ ],
  "prefabs": [ /* PrefabDefinition[] */ ],
  "animatorControllers": [ /* AnimatorController[] */ ]
}
```

## SerializedEntity

Components use **registry ids only** — never class names, never Koota ids.
Identity is a persistent UUID; the hierarchy references parent UUIDs.

```jsonc
{
  "id": "seed-5c2e4297-0",        // persistent UUID
  "name": "Cube",
  "enabled": true,
  "parentId": null,
  "components": {
    "core.transform":     { "position": [0, 0.5, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] },
    "render.mesh":        { "shape": "box", "size": 1, "segments": 1 },
    "render.material":    { "slots": [{ "materialId": "mat-terracotta" }] },
    "render.light":       { "type": "directional", "color": "#fff1d6", "intensity": 2.4, "…": "…" },
    "render.model":       { "assetId": "asset-animated-box", "visible": true, "castShadow": true, "receiveShadow": true },
    "render.camera":      { "fov": 55, "near": 0.1, "far": 300 },
    "animation.animator": { "controllerId": "anim-spin", "playing": true, "speed": 1, "initialState": "state-spin" },
    "prefab.instance":    { "prefabId": "prefab-…", "instanceId": "…", "overrides": { /* see below */ } }
  }
}
```

Rules:

- Vectors are `[x, y, z]` arrays (degrees for rotation) — engine independent.
- `render.material` models a **slot list** from day one so multi-material
  models stay schema compatible.
- Colors are `#rrggbb` strings.

## Prefab instances & overrides

A prefab instance serializes as its **root entity only**. Members are rebuilt
from the prefab definition plus field-level diffs:

```jsonc
"prefab.instance": {
  "prefabId": "prefab-chair",
  "instanceId": "instance-123",
  "overrides": {
    "<source entity uuid>": {          // keyed by the prefab's entity uuid
      "core.transform": { "position": [4, 0, 2] }   // only changed fields
    }
  }
}
```

## AssetRecord

```jsonc
{ "id": "asset-animated-box", "type": "model", "name": "animated-box.glb", "uri": "idb://…" }
```

`uri` is infrastructure agnostic — `idb://` inside the editor, `https://…`,
`/assets/…`, IPFS… at runtime (see KOOTA_RUNTIME.md). Types: `model`,
`texture`, `material`, `animation-controller`, `prefab`, `environment`.
Binary assets are never embedded in the JSON.

## MaterialDefinition

```jsonc
{
  "id": "mat-water",
  "name": "Water Blue",
  "type": "standard | physical | unlit",
  "properties": {
    "baseColor": "#5b98de", "baseColorTexture": null,
    "metalness": 0.1, "roughness": 0.15,
    "emissive": "#000000", "emissiveIntensity": 0,
    "opacity": 0.9, "transparent": true, "alphaTest": 0,
    "normalScale": 1, "side": "front | back | double"
    // + *Texture asset ids for metalness/roughness/normal/emissive maps
  }
}
```

The properties object is designed so a future TSL node graph can be added as a
new optional field without breaking existing materials.

## AnimatorController

```jsonc
{
  "id": "anim-spin", "name": "Spin Controller", "modelAssetId": "asset-animated-box",
  "parameters": [ { "id": "…", "name": "speed", "type": "float|int|bool|trigger", "default": 0 } ],
  "states":      [ { "id": "state-spin", "name": "Spin", "clip": "SpinBounce", "loop": true, "speed": 1 } ],
  "transitions": [ { "id": "tr-1", "from": "state-spin", "to": "state-hold",
                     "duration": 0.2, "exitTime": 0,
                     "conditions": [ { "parameterId": "…", "operator": "> < == != trigger", "value": 0.5 } ] } ],
  "entryStateId": "state-spin"
}
```

`clip` names resolve against the animations inside the referenced GLTF asset.

## Validation

`parseProject` / `parseScene` migrate + validate the envelope;
`validateSceneIntegrity` checks parent references, duplicate ids, cycles and
camera references; the registry additionally validates every component payload
(`validateSceneComponents`) — e.g. `Sun → render.light.color: expected #rrggbb`.
Import never silently accepts corrupt data.
