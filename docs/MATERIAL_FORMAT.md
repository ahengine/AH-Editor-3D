# MATERIAL FORMAT

Materials are data-only documents: a flat PBR property set for quick work,
plus an optional **node graph** compiled to TSL/NodeMaterial at runtime.
No GLSL, no `onBeforeCompile`, no ShaderMaterial — WebGPU-first by contract.

## Flat material (`MaterialDefinition`)

```jsonc
{
  "id": "mat-terracotta",
  "name": "Terracotta",
  "type": "standard | physical | unlit",
  "properties": {
    "baseColor": "#c05b4d",
    "roughness": 0.8,
    "metalness": 0.0,
    "opacity": 1, "transparent": false,
    "emissive": "#000000", "emissiveIntensity": 0,
    "side": "front | back | double",
    // texture map slots reference texture ASSET ids:
    "baseColorTexture": null, "metalnessTexture": null,
    "roughnessTexture": null, "normalTexture": null, "emissiveTexture": null
  },
  "graph": null                     // or MaterialGraph — below
}
```

## Node graph (`MaterialGraph`, format `koota-3d-material-graph`)

```jsonc
{
  "format": "koota-3d-material-graph",
  "schemaVersion": 1,
  "id": "graph-copper",
  "name": "Copper Graph",
  "nodes": [
    { "id": "color", "type": "input.color",  "position": [80, 140],
      "values": { "color": "#c97b43" } },
    { "id": "output", "type": "output.material", "position": [420, 220],
      "values": {} }
  ],
  "connections": [
    { "fromNode": "color", "fromSocket": "out",
      "toNode": "output", "toSocket": "baseColor" }
  ],
  "outputNodeId": "output",
  "settings": {}
}
```

- Node `position` is visual layout only — the compiler ignores it. (The
  editor likewise only recompiles when node types, values, or edges change.)
- `connections` bind output sockets to input sockets; one wire per input.
- Socket types: `float | vec2 | vec3 | vec4 | color`. float widens to any
  numeric input; color/vec widen within their families.

## Node catalog

Defined in `packages/ecs-runtime/src/material-graph/node-catalog.ts`
(25 nodes across Input / Math / UV / Texture / Output categories —
`input.color`, `input.float`, `input.uv`, `math.mix`, `math.clamp`,
`texture.sample`, `output.material`, …). The catalog is the extension point:
registering a node definition (id, sockets, defaults, TSL compile function)
makes it available in both the editor's palette and the runtime compiler.

## Runtime compilation

`compileMaterialGraphAsync(graph)` (in `@ahengine/ecs-runtime`) walks from
`outputNodeId` through connections, composing verified `three/tsl` exports
into a `MeshStandardNodeMaterial`. Missing textures fall back to neutral
values and surface as compile errors rather than throwing. The material
editor debounces recompiles (500 ms) and reports errors in-graph.
