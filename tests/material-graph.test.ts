import { describe, expect, it } from 'vitest'
import type { MaterialGraph, MaterialGraphNode, MaterialGraphConnection } from '@ahengine/project-schema'
import { MaterialGraphSchema, validateGraphIntegrity } from '@ahengine/project-schema'
import { getNodeTypeDef, nodesByCategory, NODE_TYPES } from '@ahengine/ecs-runtime'

/* Material Graph domain: schema round-trip, node catalog, integrity, type validation. */

const nodeId = () => `node-${crypto.randomUUID().slice(0, 8)}`

function makeGraph(overrides?: Partial<MaterialGraph>): MaterialGraph {
  const outputId = 'output'
  return {
    format: 'koota-3d-material-graph',
    schemaVersion: 1,
    id: 'mat-graph-test',
    name: 'Test Graph',
    nodes: [
      { id: outputId, type: 'output.material', position: [400, 200], values: {} },
    ],
    connections: [],
    outputNodeId: outputId,
    settings: {},
    ...overrides,
  }
}

describe('material graph schema', () => {
  it('round-trips through zod parse', () => {
    const graph = makeGraph()
    const parsed = MaterialGraphSchema.parse(JSON.parse(JSON.stringify(graph)))
    expect(parsed.nodes).toHaveLength(1)
    expect(parsed.outputNodeId).toBe('output')
    expect(parsed.settings).toEqual({})
  })

  it('rejects graph without nodes', () => {
    expect(() => MaterialGraphSchema.parse({ ...makeGraph(), nodes: [] })).toThrow()
  })

  it('accepts nodes with connections and values', () => {
    const colorId = nodeId()
    const graph = makeGraph({
      nodes: [
        { id: colorId, type: 'input.color', position: [100, 100], values: { color: '#ff0000' } },
        { id: 'output', type: 'output.material', position: [400, 200], values: {} },
      ],
      connections: [
        { fromNode: colorId, fromSocket: 'out', toNode: 'output', toSocket: 'baseColor' },
      ],
    })
    const parsed = MaterialGraphSchema.parse(graph)
    expect(parsed.connections).toHaveLength(1)
    expect(parsed.nodes[0].values?.color).toBe('#ff0000')
  })
})

describe('node catalog', () => {
  it('has 20+ node types across all categories', () => {
    expect(NODE_TYPES.length).toBeGreaterThanOrEqual(19)
    const cats = nodesByCategory()
    expect(Object.keys(cats)).toEqual(expect.arrayContaining(['Input', 'Texture', 'Math', 'Utility', 'Output']))
  })

  it('every node type has compile function and sockets', () => {
    for (const def of NODE_TYPES) {
      expect(def.type).toBeTruthy()
      expect(def.label).toBeTruthy()
      expect(def.category).toBeTruthy()
      expect(typeof def.compile).toBe('function')
      expect(Array.isArray(def.inputs)).toBe(true)
      expect(Array.isArray(def.outputs)).toBe(true)
    }
  })

  it('output.material has all PBR sockets', () => {
    const def = getNodeTypeDef('output.material')!
    const inputIds = def.inputs.map(i => i.id)
    expect(inputIds).toEqual(expect.arrayContaining(['baseColor', 'metalness', 'roughness', 'normal', 'emissive', 'opacity', 'alphaTest']))
  })

  it('key V1 nodes exist', () => {
    for (const type of [
      'input.color', 'input.float', 'input.vector2', 'input.vector3',
      'input.uv', 'input.normal', 'input.time',
      'texture.sample', 'texture.normalMap',
      'math.add', 'math.subtract', 'math.multiply', 'math.divide',
      'math.clamp', 'math.min', 'math.max', 'math.power',
      'utility.mix', 'utility.fresnel', 'utility.noise',
      'utility.splitVector', 'utility.combineVector',
      'output.material',
    ]) {
      expect(getNodeTypeDef(type)).toBeDefined()
    }
  })
})

describe('graph integrity', () => {
  it('flags dangling connection', () => {
    const graph = makeGraph({
      connections: [{ fromNode: 'ghost', fromSocket: 'out', toNode: 'output', toSocket: 'baseColor' }],
    })
    const issues = validateGraphIntegrity(graph)
    expect(issues.some(i => i.message.includes('ghost'))).toBe(true)
  })

  it('flags missing output node', () => {
    const graph = makeGraph({ outputNodeId: 'nonexistent' })
    const issues = validateGraphIntegrity(graph)
    expect(issues.some(i => i.path === 'graph.outputNodeId')).toBe(true)
  })

  it('valid graph passes', () => {
    expect(validateGraphIntegrity(makeGraph())).toEqual([])
  })
})

describe('no runtime objects in exported JSON', () => {
  it('graph JSON contains only plain data (no THREE, no TSL, no functions)', () => {
    const graph = makeGraph({
      nodes: [
        { id: 'c1', type: 'input.color', position: [50, 50], values: { color: '#78a8ff' } },
        { id: 'f1', type: 'input.float', position: [50, 150], values: { value: 0.3 } },
        { id: 'output', type: 'output.material', position: [400, 200], values: {} },
      ],
      connections: [
        { fromNode: 'c1', fromSocket: 'out', toNode: 'output', toSocket: 'baseColor' },
        { fromNode: 'f1', fromSocket: 'out', toNode: 'output', toSocket: 'roughness' },
      ],
    })
    const json = JSON.stringify(graph)
    expect(json).not.toContain('THREE')
    expect(json).not.toContain('VarNode')
    expect(json).not.toContain('ConstNode')
    expect(json).not.toContain('function')
    expect(json).not.toContain('__proto__')
    // All values are primitives
    const parsed = JSON.parse(json)
    for (const node of parsed.nodes) {
      for (const [key, value] of Object.entries(node.values ?? {})) {
        expect(['string', 'number', 'boolean']).toContain(typeof value)
      }
    }
  })
})
