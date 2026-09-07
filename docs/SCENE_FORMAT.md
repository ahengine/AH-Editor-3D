# SCENE FORMAT (`*.koota-scene.json`)

Format identifier: `koota-3d-scene`. A scene is a flat entity list plus
settings — hierarchy is expressed by `parentId`, never by nesting.

```jsonc
{
  "format": "koota-3d-scene",
  "schemaVersion": 1,
  "id": "main",
  "name": "Main Scene",
  "settings": { /* SceneSettings — below */ },
  "entities": [ /* SerializedEntity — below */ ]
}
```

## SerializedEntity

```jsonc
{
  "id": "3f9c2a10-…",          // persistent UUID — the entity's identity
  "name": "Cube",
  "enabled": true,             // authored enable (distinct from visibility)
  "parentId": null,            // UUID of parent, or null for a root
  "components": {
    "core.transform":   { "position": [0,0,0], "rotation": [0,0,0], "scale": [1,1,1] },
    "render.mesh":      { "shape": "box", "size": 1, "visible": true },
    "render.model":     { "assetId": "asset-…", "visible": true, "castShadow": true },
    "render.material":  { "slots": [{ "materialId": "mat-…" }] },
    "render.light":     { "type": "directional", "intensity": 2 },
    "render.camera":    { },
    "animation.animator": { "controllerId": "ac-…", "playing": true, "speed": 1 },
    "particle.emitter":   { "effectId": "fx-…" },
    "prefab.instance":    { "prefabId": "p-…", "instanceId": "i-…", "overrides": {} }
  }
}
```

Component ids are stable strings owned by the registry in
`@ahengine/ecs-runtime` (`packages/ecs-runtime/src/registry.ts`). The editor
rejects unknown ids on load. `prefab.instance` is a structural marker handled
by the instantiate path (see PREFAB_FORMAT.md), not a registry component.

## SceneSettings

```jsonc
{
  "background": "#dfe3ea",
  "environmentAssetId": null,        // HDR asset id, or null for flat color
  "environmentIntensity": 1,
  "environmentRotation": 0,
  "environmentBackground": true,     // render env as skybox
  "ambientIntensity": 0.35,          // hemisphere ambient contribution
  "ambientColor": "#c8d4e0",
  "fog": { "enabled": true, "type": "linear", "color": "#dfe3ea",
           "near": 22, "far": 85, "density": 0.02 },
  "toneMapping": "aces",
  "toneMappingExposure": 1,
  "shadowEnabled": true,
  "defaultCameraId": null
}
```

## Rules

- Identity: entity ids are UUIDs generated at creation and never reused;
  Koota's internal entity ids and THREE.Object3D uuids never serialize.
- Hierarchy: any `parentId` must reference another entity in the same list;
  cycles are rejected by integrity validation.
- Prefab instance members are not stored in the scene — the loader expands
  them from their prefab definition at load time.
