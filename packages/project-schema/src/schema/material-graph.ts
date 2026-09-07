import { z } from 'zod'

/**
 * Material Graph domain — node-based authoring for TSL/Node Materials.
 * The graph is pure authored DATA; TSL node instances are runtime-only and
 * created by the graph compiler (never serialized).
 */

export const MATERIAL_GRAPH_FORMAT = 'koota-3d-material-graph'

/* ---- Socket semantic types ---- */

export type SocketType =
  | 'float'
  | 'vec2'
  | 'vec3'
  | 'vec4'
  | 'color'
  | 'texture'
  | 'normal'

export const SocketTypeSchema = z.enum([
  'float', 'vec2', 'vec3', 'vec4', 'color', 'texture', 'normal',
])

/* ---- Node ---- */

export interface MaterialNodePort {
  /** Socket semantic type. */
  type: SocketType
  /** Human label (short). */
  label?: string
}

export interface MaterialGraphNode {
  id: string
  /** Registry node type, e.g. 'input.color', 'math.add', 'output.material'. */
  type: string
  /** Editor canvas position [x, y] — never triggers shader rebuild. */
  position: [number, number]
  /** Input socket definitions (order matters for connections). */
  inputs?: MaterialNodePort[]
  /** Output socket definitions. */
  outputs?: MaterialNodePort[]
  /** Authored values (hex color strings, numbers, asset IDs). */
  values?: Record<string, unknown>
}

export const MaterialGraphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  position: z.tuple([z.number(), z.number()]),
  inputs: z.array(z.object({ type: SocketTypeSchema, label: z.string().optional() })).optional(),
  outputs: z.array(z.object({ type: SocketTypeSchema, label: z.string().optional() })).optional(),
  values: z.record(z.string(), z.unknown()).optional(),
})

/* ---- Connection ---- */

export interface MaterialGraphConnection {
  fromNode: string
  fromSocket: string
  toNode: string
  toSocket: string
}

export const MaterialGraphConnectionSchema = z.object({
  fromNode: z.string().min(1),
  fromSocket: z.string().min(1),
  toNode: z.string().min(1),
  toSocket: z.string().min(1),
})

/* ---- Graph ---- */

export interface MaterialGraphSettings {
  /** Side rendering. */
  side?: 'front' | 'back' | 'double'
  /** Transparency. */
  transparent?: boolean
  opacity?: number
  alphaTest?: number
}

export const MaterialGraphSettingsSchema = z.object({
  side: z.enum(['front', 'back', 'double']).optional(),
  transparent: z.boolean().optional(),
  opacity: z.number().min(0).max(1).optional(),
  alphaTest: z.number().min(0).max(1).optional(),
})

export interface MaterialGraph {
  format: typeof MATERIAL_GRAPH_FORMAT
  schemaVersion: number
  id: string
  name: string
  nodes: MaterialGraphNode[]
  connections: MaterialGraphConnection[]
  /** The material output node. */
  outputNodeId: string
  settings: MaterialGraphSettings
}

export const MaterialGraphSchema = z.object({
  format: z.literal(MATERIAL_GRAPH_FORMAT),
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string(),
  nodes: z.array(MaterialGraphNodeSchema).min(1, 'Graph must contain at least the output node'),
  connections: z.array(MaterialGraphConnectionSchema),
  outputNodeId: z.string().min(1),
  settings: MaterialGraphSettingsSchema.default({}),
})

/** Graph-level integrity: connections reference existing nodes/sockets. */
export function validateGraphIntegrity(graph: MaterialGraph): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = []
  const nodeIds = new Set(graph.nodes.map((n) => n.id))
  if (!nodeIds.has(graph.outputNodeId)) {
    issues.push({ path: 'graph.outputNodeId', message: `References unknown node "${graph.outputNodeId}"` })
  }
  for (const conn of graph.connections) {
    if (!nodeIds.has(conn.fromNode)) {
      issues.push({ path: `connection ${conn.fromNode}→${conn.toNode}`, message: `fromNode "${conn.fromNode}" not found` })
    }
    if (!nodeIds.has(conn.toNode)) {
      issues.push({ path: `connection ${conn.fromNode}→${conn.toNode}`, message: `toNode "${conn.toNode}" not found` })
    }
  }
  return issues
}
