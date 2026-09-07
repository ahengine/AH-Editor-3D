# PROJECT FORMAT (`*.koota-project.json`)

The project file is the complete authoring document — everything the editor
exports and a host application loads. Format identifier: `koota-3d-project`.

```jsonc
{
  "format": "koota-3d-project",
  "schemaVersion": 1,
  "project": {
    "id": "project-8c1f…",          // stable id (slug + random)
    "name": "Stylized Island",
    "createdAt": "2026-01-15T09:00:00.000Z",
    "updatedAt": "2026-09-07T12:00:00.000Z"
  },
  "scene":        { /* SceneData — see SCENE_FORMAT.md */ },
  "assets":       [ /* AssetRecord[] — imported models/textures/environments */ ],
  "materials":    [ /* MaterialDefinition[] — see MATERIAL_FORMAT.md */ ],
  "prefabs":      [ /* PrefabDefinition[] — see PREFAB_FORMAT.md */ ],
  "animations":   [ /* AnimationClipData[] — see ANIMATION_FORMAT.md */ ],
  "animatorControllers": [ /* AnimatorControllerV2[] — see ANIMATOR_FORMAT.md */ ],
  "particleEffects":     [ /* ParticleEffectData[] — see PARTICLE_FORMAT.md */ ]
}
```

## Assets

```jsonc
{
  "id": "asset-ab12…",             // referenced by components (never by path)
  "type": "model | texture | environment",
  "name": "animated-box.glb",
  "uri": "idb://asset-…" | "src/game/assets/animated-box.glb",
  "metadata": {                    // optional, populated on import
    "animations": ["SpinBounce"],
    "materialSlots": ["Main"],
    "boundingBox": { "min": […], "max": […] },
    "triangleCount": 1234
  }
}
```

`uri` is infrastructure-agnostic: the standalone editor stores blobs in
IndexedDB (`idb://`), the installable editor writes real files. Host apps map
uris through their own `assetResolver`.

## Integrity rules

`validateProjectIntegrity` (in `@ahengine/project-schema`) checks before any
load replaces state:

- every entity `render.model.assetId` / material slot / animator
  `controllerId` / emitter `effectId` resolves to a real record
- `prefab.instance` targets an existing prefab; nesting has no cycles
- every controller's `entryStateId` exists in its states
- UUIDs are well-formed; the scene graph has no parent cycles

Loading order (editor import and runtime loader share it):
**parse → migrate → validate → load**. On any failure the current project
stays untouched. The standalone backend additionally keeps a one-generation
`active.backup` snapshot rotated on every successful save.

## Versioning

`schemaVersion` gates per-domain migration chains
(`packages/project-schema/src/migrations/`). A migration receives version N
data and returns version N+1 data; unknown future versions are rejected with
`UnsupportedSchemaVersionError`.
