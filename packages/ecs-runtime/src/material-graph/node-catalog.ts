import * as THREE from 'three'
import * as TSL from 'three/tsl'
import type { MaterialGraphNode, SocketType } from '@ahengine/project-schema'

/**
 * Node catalog — every authorable material node type, its socket signatures,
 * and its TSL compile function. Adding a new node = one entry here.
 */

const {
  color, float, vec2, vec3, vec4,
  uv, normalLocal, normalWorld, time,
  mix, clamp, min, max, pow, add, sub, mul, div,
  oneMinus, dot,
  texture, normalMap,
  mx_noise_float,
  oscSine,
  positionLocal,
} = TSL

export interface SocketDef {
  id: string
  type: SocketType
  label: string
}

export interface NodeTypeDef {
  type: string
  label: string
  category: 'Input' | 'Texture' | 'Vector' | 'Math' | 'Utility' | 'Output'
  inputs: SocketDef[]
  outputs: SocketDef[]
  /** Default authored values. */
  defaults: Record<string, unknown>
  /**
   * Compiles this node into a TSL expression. ` getInput(socketId)` returns
   * the compiled upstream node output (or a sensible default if unconnected).
   */
  compile: (node: MaterialGraphNode, getInput: (socketId: string) => TSLNode | null) => Record<string, TSLNode>
}

// TSL nodes are opaque — type them loosely (they're chained function results)
type TSLNode = unknown

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function fallbackFor(type: SocketType): TSLNode {
  switch (type) {
    case 'float': return float(0)
    case 'vec2': return vec2(0, 0)
    case 'vec3': return vec3(0, 0, 0)
    case 'vec4': return vec4(0, 0, 0, 1)
    case 'color': return color('#ffffff')
    case 'texture': return null // textures need explicit connection
    case 'normal': return normalLocal
  }
}

function coerced(node: TSLNode | null, type: SocketType): TSLNode {
  if (node === null || node === undefined) return fallbackFor(type)
  return node
}

function num(values: Record<string, unknown> | undefined, key: string, fallback: number): number {
  const v = values?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

function str(values: Record<string, unknown> | undefined, key: string, fallback: string): string {
  const v = values?.[key]
  return typeof v === 'string' ? v : fallback
}

/* ------------------------------------------------------------------ */
/* Node type definitions                                               */
/* ------------------------------------------------------------------ */

function opBin(a: unknown, b: unknown, fn: 'add' | 'sub' | 'mul' | 'div'): unknown {
  const node = (a ?? float(0)) as Record<string, (x: unknown) => unknown>
  return node[fn](b ?? float(0))
}

export const NODE_TYPES: NodeTypeDef[] = [
  /* ---- Output ---- */
  {
    type: 'output.material',
    label: 'Material Output',
    category: 'Output',
    inputs: [
      { id: 'baseColor', type: 'color', label: 'Base Color' },
      { id: 'metalness', type: 'float', label: 'Metalness' },
      { id: 'roughness', type: 'float', label: 'Roughness' },
      { id: 'normal', type: 'normal', label: 'Normal' },
      { id: 'emissive', type: 'color', label: 'Emissive' },
      { id: 'opacity', type: 'float', label: 'Opacity' },
      { id: 'alphaTest', type: 'float', label: 'Alpha Test' },
    ],
    outputs: [],
    defaults: {},
    compile: (node, getInput) => {
      // Output node just passes through — the compiler reads these.
      const result: Record<string, TSLNode> = {}
      for (const socket of ['baseColor', 'metalness', 'roughness', 'normal', 'emissive', 'opacity', 'alphaTest']) {
        result[socket] = getInput(socket)
      }
      return result
    },
  },

  /* ---- Input: constants ---- */
  {
    type: 'input.color',
    label: 'Color',
    category: 'Input',
    inputs: [],
    outputs: [{ id: 'out', type: 'color', label: '' }],
    defaults: { color: '#ffffff' },
    compile: (node) => ({ out: color(str(node.values, 'color', '#ffffff')) }),
  },
  {
    type: 'input.float',
    label: 'Float',
    category: 'Input',
    inputs: [],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { value: 0.5 },
    compile: (node) => ({ out: float(num(node.values, 'value', 0.5)) }),
  },
  {
    type: 'input.vector2',
    label: 'Vector 2',
    category: 'Input',
    inputs: [],
    outputs: [{ id: 'out', type: 'vec2', label: '' }],
    defaults: { x: 0, y: 0 },
    compile: (node) => ({ out: vec2(num(node.values, 'x', 0), num(node.values, 'y', 0)) }),
  },
  {
    type: 'input.vector3',
    label: 'Vector 3',
    category: 'Input',
    inputs: [],
    outputs: [{ id: 'out', type: 'vec3', label: '' }],
    defaults: { x: 0, y: 0, z: 0 },
    compile: (node) => ({ out: vec3(num(node.values, 'x', 0), num(node.values, 'y', 0), num(node.values, 'z', 0)) }),
  },
  {
    type: 'input.time',
    label: 'Time',
    category: 'Input',
    inputs: [],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { speed: 1 },
    compile: (node) => {
      const speed = num(node.values, 'speed', 1)
      const m = mul as unknown as (...args: unknown[]) => unknown
      return { out: speed === 1 ? time : m(time, float(speed)) }
    },
  },
  {
    type: 'input.sine',
    label: 'Sine Wave',
    category: 'Input',
    inputs: [{ id: 'input', type: 'float', label: 'In' }],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { frequency: 1, amplitude: 1 },
    compile: (node, getInput) => {
      const input = coerced(getInput('input'), 'float')
      const m = mul as unknown as (...args: unknown[]) => unknown
      const osc = oscSine as unknown as (x: unknown) => unknown
      return { out: m(osc(m(input, float(num(node.values, 'frequency', 1)))), float(num(node.values, 'amplitude', 1))) }
    },
  },

  /* ---- Input: geometry ---- */
  {
    type: 'input.uv',
    label: 'UV',
    category: 'Input',
    inputs: [],
    outputs: [{ id: 'out', type: 'vec2', label: '' }],
    defaults: {},
    compile: () => ({ out: uv }),
  },
  {
    type: 'input.normal',
    label: 'Normal',
    category: 'Input',
    inputs: [],
    outputs: [{ id: 'out', type: 'normal', label: '' }],
    defaults: { space: 'local' },
    compile: (node) => ({
      out: str(node.values, 'space', 'local') === 'world' ? normalWorld : normalLocal,
    }),
  },
  {
    type: 'input.position',
    label: 'Position',
    category: 'Input',
    inputs: [],
    outputs: [{ id: 'out', type: 'vec3', label: '' }],
    defaults: {},
    compile: () => ({ out: positionLocal }),
  },

  /* ---- Texture ---- */
  {
    type: 'texture.sample',
    label: 'Texture',
    category: 'Texture',
    inputs: [{ id: 'uv', type: 'vec2', label: 'UV' }],
    outputs: [
      { id: 'color', type: 'vec4', label: 'RGBA' },
      { id: 'r', type: 'float', label: 'R' },
      { id: 'g', type: 'float', label: 'G' },
      { id: 'b', type: 'float', label: 'B' },
      { id: 'a', type: 'float', label: 'A' },
    ],
    defaults: { assetId: '', colorSpace: 'srgb' },
    compile: (node, getInput) => {
      // Texture compilation is deferred to the compiler (needs the actual THREE.Texture).
      // The compiler intercepts texture.sample nodes and resolves them with the asset system.
      void node; void getInput
      return { color: null, r: null, g: null, b: null, a: null }
    },
  },
  {
    type: 'texture.normalMap',
    label: 'Normal Map',
    category: 'Texture',
    inputs: [
      { id: 'uv', type: 'vec2', label: 'UV' },
      { id: 'strength', type: 'float', label: 'Strength' },
    ],
    outputs: [{ id: 'out', type: 'normal', label: '' }],
    defaults: { assetId: '' },
    compile: (node, getInput) => {
      // Deferred to compiler (needs actual texture)
      void node; void getInput
      return { out: null }
    },
  },

  /* ---- Math ---- */
  {
    type: 'math.add', label: 'Add', category: 'Math',
    inputs: [{ id: 'a', type: 'float', label: 'A' }, { id: 'b', type: 'float', label: 'B' }],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { a: 0, b: 0 },
    compile: (_n, getInput) => ({ out: opBin(getInput('a'), getInput('b'), 'add') }),
  },
  {
    type: 'math.subtract', label: 'Subtract', category: 'Math',
    inputs: [{ id: 'a', type: 'float', label: 'A' }, { id: 'b', type: 'float', label: 'B' }],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { a: 0, b: 0 },
    compile: (_n, getInput) => ({ out: opBin(getInput('a'), getInput('b'), 'sub') }),
  },
  {
    type: 'math.multiply', label: 'Multiply', category: 'Math',
    inputs: [{ id: 'a', type: 'float', label: 'A' }, { id: 'b', type: 'float', label: 'B' }],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { a: 0, b: 1 },
    compile: (_n, getInput) => ({ out: opBin(getInput('a'), getInput('b'), 'mul') }),
  },
  {
    type: 'math.divide', label: 'Divide', category: 'Math',
    inputs: [{ id: 'a', type: 'float', label: 'A' }, { id: 'b', type: 'float', label: 'B' }],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { a: 1, b: 1 },
    compile: (_n, getInput) => ({ out: opBin(getInput('a'), getInput('b'), 'div') }),
  },
  {
    type: 'math.clamp',
    label: 'Clamp',
    category: 'Math',
    inputs: [
      { id: 'input', type: 'float', label: 'In' },
      { id: 'min', type: 'float', label: 'Min' },
      { id: 'max', type: 'float', label: 'Max' },
    ],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { min: 0, max: 1 },
    compile: (_node, getInput) => {
      const c = clamp as unknown as (a: unknown, b: unknown, d: unknown) => unknown
      return { out: c(coerced(getInput('input'), 'float'), coerced(getInput('min'), 'float'), coerced(getInput('max'), 'float')) }
    },
  },
  {
    type: 'math.min',
    label: 'Min',
    category: 'Math',
    inputs: [
      { id: 'a', type: 'float', label: 'A' },
      { id: 'b', type: 'float', label: 'B' },
    ],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: {},
    compile: (_n, getInput) => { const f = min as unknown as (a: unknown, b: unknown) => unknown; return { out: f(coerced(getInput('a'), 'float'), coerced(getInput('b'), 'float')) } },
  },
  {
    type: 'math.max',
    label: 'Max',
    category: 'Math',
    inputs: [
      { id: 'a', type: 'float', label: 'A' },
      { id: 'b', type: 'float', label: 'B' },
    ],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: {},
    compile: (_n, getInput) => { const f = max as unknown as (a: unknown, b: unknown) => unknown; return { out: f(coerced(getInput('a'), 'float'), coerced(getInput('b'), 'float')) } },
  },
  {
    type: 'math.power',
    label: 'Power',
    category: 'Math',
    inputs: [
      { id: 'base', type: 'float', label: 'Base' },
      { id: 'exponent', type: 'float', label: 'Exp' },
    ],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { exponent: 2 },
    compile: (_n, getInput) => { const f = pow as unknown as (a: unknown, b: unknown) => unknown; return { out: f(coerced(getInput('base'), 'float'), coerced(getInput('exponent'), 'float')) } },
  },

  /* ---- Utility ---- */
  {
    type: 'utility.mix',
    label: 'Mix / Lerp',
    category: 'Utility',
    inputs: [
      { id: 'a', type: 'color', label: 'A' },
      { id: 'b', type: 'color', label: 'B' },
      { id: 't', type: 'float', label: 'Factor' },
    ],
    outputs: [{ id: 'out', type: 'color', label: '' }],
    defaults: { t: 0.5 },
    compile: (_n, getInput) => {
      const m = mix as unknown as (a: unknown, b: unknown, t: unknown) => unknown
      return { out: m(coerced(getInput('a'), 'color'), coerced(getInput('b'), 'color'), coerced(getInput('t'), 'float')) }
    },
  },
  {
    type: 'utility.fresnel',
    label: 'Fresnel',
    category: 'Utility',
    inputs: [{ id: 'power', type: 'float', label: 'Power' }],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: { power: 3 },
    compile: (node, getInput) => {
      // fresnel = 1 - dot(normalView, vec3(0,0,1)) ^ power
      const power = getInput('power') ?? float(num(node.values, 'power', 3))
      const d = (dot as unknown as (a: unknown, b: unknown) => unknown)(TSL.normalView, vec3(0, 0, 1))
      const om = (oneMinus as unknown as (x: unknown) => unknown)(d)
      const p = (pow as unknown as (a: unknown, b: unknown) => unknown)
      return { out: p(om, power) }
    },
  },
  {
    type: 'utility.noise',
    label: 'Noise',
    category: 'Utility',
    inputs: [
      { id: 'x', type: 'float', label: 'X' },
      { id: 'y', type: 'float', label: 'Y' },
      { id: 'z', type: 'float', label: 'Z' },
    ],
    outputs: [{ id: 'out', type: 'float', label: '' }],
    defaults: {},
    compile: (_n, getInput) => { const f = mx_noise_float as unknown as (...args: unknown[]) => unknown; return { out: f(coerced(getInput('x'), 'float'), coerced(getInput('y'), 'float'), coerced(getInput('z'), 'float')) } },
  },
  {
    type: 'utility.splitVector',
    label: 'Split Vector',
    category: 'Utility',
    inputs: [{ id: 'input', type: 'vec3', label: 'In' }],
    outputs: [
      { id: 'x', type: 'float', label: 'X' },
      { id: 'y', type: 'float', label: 'Y' },
      { id: 'z', type: 'float', label: 'Z' },
    ],
    defaults: {},
    compile: (_n, getInput) => {
      const v = getInput('input') ?? vec3(0, 0, 0)
      const s = (TSL.split as unknown as (x: unknown) => { x: unknown; y: unknown; z: unknown })(v)
      return { x: s.x, y: s.y, z: s.z }
    },
  },
  {
    type: 'utility.combineVector',
    label: 'Combine Vector',
    category: 'Utility',
    inputs: [
      { id: 'x', type: 'float', label: 'X' },
      { id: 'y', type: 'float', label: 'Y' },
      { id: 'z', type: 'float', label: 'Z' },
    ],
    outputs: [{ id: 'out', type: 'vec3', label: '' }],
    defaults: {},
    compile: (_n, getInput) => { const v = vec3 as unknown as (...args: unknown[]) => unknown; return { out: v(coerced(getInput('x'), 'float'), coerced(getInput('y'), 'float'), coerced(getInput('z'), 'float')) } },
  },
]

/* ------------------------------------------------------------------ */
/* Lookup                                                              */
/* ------------------------------------------------------------------ */

const byType = new Map(NODE_TYPES.map((d) => [d.type, d]))

export function getNodeTypeDef(type: string): NodeTypeDef | undefined {
  return byType.get(type)
}

export function nodesByCategory(): Record<string, NodeTypeDef[]> {
  const result: Record<string, NodeTypeDef[]> = {}
  for (const def of NODE_TYPES) {
    ;(result[def.category] ??= []).push(def)
  }
  return result
}
