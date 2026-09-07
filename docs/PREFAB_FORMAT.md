# PREFAB FORMAT

Format identifier: `koota-3d-prefab`. A prefab is a reusable entity subtree
with **local ids** — never scene UUIDs — so instances stay decoupled from
scene identity and nesting stays a reference, not a copy.

## PrefabDefinition

```jsonc
{
  "format": "koota-3d-prefab",
  "schemaVersion": 1,
  "id": "pfx-a",
  "name": "Shrine A",
  "rootLocalEntityId": "a-root",
  "entities": [
    {
      "localId": "a-root",           // identity INSIDE the prefab
      "parentLocalId": null,
      "name": "Shrine A",
      "enabled": true,
      "components": { "core.transform": { … }, "render.mesh": { … } }
    },
    { "localId": "a-pillar", "parentLocalId": "a-root", "name": "Shrine Pillar", … }
  ],
  "nestedInstances": [
    {
      "instanceId": "a-podium",       // unique within THIS prefab
      "prefabId": "pfx-b",            // reference to another prefab
      "parentLocalId": "a-root",      // where the nested root attaches
      "name": "Podium",               // optional display override
      "overrides": {}                 // field-level overrides
    }
  ]
}
```

## Nesting

- Nested instances are preserved as references; loading expands them
  recursively (A → B → C) with fresh scene UUIDs at every level.
- Cycles are rejected up front (`detectPrefabCycle` / `canNestPrefab`); a
  prefab can never contain itself, directly or transitively.
- The runtime loader passes the full prefab table as resolution context, so
  arbitrarily deep chains expand on load (covered by the showcase e2e test).

## Instances in scenes

A scene stores only the instance root with a structural marker:

```jsonc
{ "prefab.instance": { "prefabId": "pfx-a", "instanceId": "inst-42", "overrides": { … } } }
```

On load, `deserializeScene` expands the prefab (and its nested chain), gives
every entity a fresh scene UUID, tags interior entities `InstanceMember` and
the root `PrefabInstance`, then links the root into the authored parent.
Live edits on an instance serialize back as field-level `overrides` against
the prefab source (`computeInstanceOverrides`); reverting clears them.
