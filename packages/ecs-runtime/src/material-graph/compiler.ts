import * as THREE from 'three'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { MaterialGraph, MaterialGraphNode, SocketType } from '@ahengine/project-schema'
import { validateGraphIntegrity } from '@ahengine/project-schema'
import { getNodeTypeDef } from './node-catalog.js'

/**
 * Material graph compiler — MaterialGraphData → THREE.NodeMaterial.
 * The editor graph contains only pure data; TSL node instances are created
 * exclusively here and never serialized.
 *
 * Compile errors are catchable (returns null + error message), never crashing
 * the renderer. The caller can display the error and keep a fallback material.
 */

export interface TextureResolver {
  (assetId: string): Promise<THREE.Texture | null>
}

export interface CompileResult {
  material: MeshStandardNodeMaterial | null
  errors: string[]
}

export function compileMaterialGraph(
  graph: MaterialGraph,
  textureResolver?: TextureResolver
): CompileResult {
  const errors: string[] = []

  // Graph-level integrity
  const integrityIssues = validateGraphIntegrity(graph)
  if (integrityIssues.length > 0) {
    return { material: null, errors: integrityIssues.map((i) => `${i.path}: ${i.message}`) }
  }

  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
  const outputNode = nodesById.get(graph.outputNodeId)
  if (!outputNode) {
    return { material: null, errors: [`Output node "${graph.outputNodeId}" not found`] }
  }

  const material = new MeshStandardNodeMaterial()
  const settings = graph.settings ?? {}

  if (settings.side) {
    material.side = settings.side === 'double' ? THREE.DoubleSide : settings.side === 'back' ? THREE.BackSide : THREE.FrontSide
  }
  if (settings.transparent !== undefined) material.transparent = settings.transparent
  if (settings.alphaTest !== undefined && settings.alphaTest > 0) {
    material.alphaTest = settings.alphaTest
    material.transparent = false
  }

  // Compile each node once (topological by connection order)
  const compiled = new Map<string, Map<string, unknown>>()
  const compiling = new Set<string>()

  function compileNode(nodeId: string): Map<string, unknown> | null {
    if (compiled.has(nodeId)) return compiled.get(nodeId)!
    if (compiling.has(nodeId)) {
      errors.push(`Circular dependency involving node "${nodeId}"`)
      return null
    }
    compiling.add(nodeId)

    const node = nodesById.get(nodeId)
    if (!node) {
      errors.push(`Node "${nodeId}" not found`)
      return null
    }

    const def = getNodeTypeDef(node.type)
    if (!def) {
      errors.push(`Unknown node type "${node.type}" on node "${node.id}"`)
      return null
    }

    // Build input resolver from connections
    const getInput = (socketId: string): unknown => {
      const conn = graph.connections.find((c) => c.toNode === nodeId && c.toSocket === socketId)
      if (!conn) return null
      const upstream = compileNode(conn.fromNode)
      if (!upstream) return null
      return upstream.get(conn.fromSocket) ?? null
    }

    let result: Map<string, unknown>
    if (node.type === 'texture.sample' || node.type === 'texture.normalMap') {
      result = compileTextureNode(node, getInput, textureResolver, errors)
    } else {
      try {
        const raw = def.compile(node, getInput as never)
        result = new Map(Object.entries(raw))
      } catch (error) {
        errors.push(`Node "${def.label}" (${node.id}): ${(error as Error).message}`)
        result = new Map()
      }
    }

    compiling.delete(nodeId)
    compiled.set(nodeId, result)
    return result
  }

  // Compile output node
  const outputResult = compileNode(graph.outputNodeId)
  if (outputResult && errors.length === 0) {
    const { colorNode, roughnessNode, metalnessNode, normalNode, emissiveNode, opacityNode, alphaTestNode } = material

    const baseColor = outputResult.get('baseColor')
    if (baseColor) material.colorNode = baseColor as never
    const roughness = outputResult.get('roughness')
    if (roughness) material.roughnessNode = roughness as never
    const metalness = outputResult.get('metalness')
    if (metalness) material.metalnessNode = metalness as never
    const normal = outputResult.get('normal')
    if (normal) material.normalNode = normal as never
    const emissive = outputResult.get('emissive')
    if (emissive) material.emissiveNode = emissive as never
    const opacity = outputResult.get('opacity')
    if (opacity) {
      material.opacityNode = opacity as never
      material.transparent = true
    }
    const alphaTest = outputResult.get('alphaTest')
    if (alphaTest) material.alphaTestNode = alphaTest as never

    void colorNode; void roughnessNode; void metalnessNode; void normalNode
    void emissiveNode; void opacityNode; void alphaTestNode
  }

  if (errors.length > 0) {
    material.dispose()
    return { material: null, errors }
  }
  return { material, errors: [] }
}

/** Texture nodes need the async asset system → compile specially. */
function compileTextureNode(
  node: MaterialGraphNode,
  getInput: (socketId: string) => unknown,
  textureResolver: TextureResolver | undefined,
  errors: string[]
): Map<string, unknown> {
  const assetId = String(node.values?.assetId ?? '')
  if (!assetId || !textureResolver) {
    errors.push(`Texture node "${node.id}": no texture resolver or assetId`)
    return new Map()
  }

  // Kick off async texture load — the TSL texture() node accepts a promise-like
  // via uniform, but for V1 we compile with a placeholder and patch later.
  // For now, texture nodes compile synchronously when the texture is already loaded.
  const result = new Map<string, unknown>()
  const uvInput = getInput('uv') ?? TSL.uv

  // Register for async resolution — the material compiler caller handles this.
  result.set('__textureAssetId', assetId)
  result.set('__textureNode', node)
  result.set('__uvInput', uvInput)
  result.set('__pendingResolver', textureResolver)

  return result
}

/**
 * Async compile — resolves textures, then builds the material.
 * This is the main entry point for the editor.
 */
export async function compileMaterialGraphAsync(
  graph: MaterialGraph,
  textureResolver?: TextureResolver
): Promise<CompileResult> {
  // Pre-resolve all texture nodes
  const textureNodes = graph.nodes.filter(
    (n) => n.type === 'texture.sample' || n.type === 'texture.normalMap'
  )
  const textures = new Map<string, THREE.Texture>()
  if (textureResolver) {
    for (const node of textureNodes) {
      const assetId = String(node.values?.assetId ?? '')
      if (!assetId) continue
      try {
        const tex = await textureResolver(assetId)
        if (tex) textures.set(node.id, tex)
      } catch {
        // Missing texture → node compiles with fallback color
      }
    }
  }

  // Wrap the sync compiler with a texture-aware resolver
  return compileMaterialGraphWithTextures(graph, textures)
}

function compileMaterialGraphWithTextures(
  graph: MaterialGraph,
  textures: Map<string, THREE.Texture>
): CompileResult {
  const errors: string[] = []
  const integrityIssues = validateGraphIntegrity(graph)
  if (integrityIssues.length > 0) {
    return { material: null, errors: integrityIssues.map((i) => `${i.path}: ${i.message}`) }
  }

  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]))
  const material = new MeshStandardNodeMaterial()
  const settings = graph.settings ?? {}

  if (settings.side) {
    material.side = settings.side === 'double' ? THREE.DoubleSide : settings.side === 'back' ? THREE.BackSide : THREE.FrontSide
  }
  if (settings.transparent !== undefined) material.transparent = settings.transparent
  if (settings.opacity !== undefined) material.opacity = settings.opacity
  if (settings.alphaTest !== undefined && settings.alphaTest > 0) {
    material.alphaTest = settings.alphaTest
    material.transparent = false
  }

  const compiled = new Map<string, Map<string, unknown>>()
  const visiting = new Set<string>()

  function compileNode(nodeId: string): Map<string, unknown> | null {
    if (compiled.has(nodeId)) return compiled.get(nodeId)!
    if (visiting.has(nodeId)) {
      errors.push(`Circular dependency at node "${nodeId}"`)
      return null
    }
    visiting.add(nodeId)

    const node = nodesById.get(nodeId)
    if (!node) {
      errors.push(`Node "${nodeId}" not found`)
      return null
    }

    const getInput = (socketId: string): unknown => {
      const conn = graph.connections.find((c) => c.toNode === nodeId && c.toSocket === socketId)
      if (!conn) return null
      const up = compileNode(conn.fromNode)
      return up?.get(conn.fromSocket) ?? null
    }

    let result: Map<string, unknown>
    if (node.type === 'texture.sample') {
      result = compileSampleTexture(node, getInput, textures)
    } else if (node.type === 'texture.normalMap') {
      result = compileNormalMapNode(node, getInput, textures)
    } else {
      const def = getNodeTypeDef(node.type)
      if (!def) {
        errors.push(`Unknown node type "${node.type}"`)
        return null
      }
      try {
        result = new Map(Object.entries(def.compile(node, getInput as never)))
      } catch (error) {
        errors.push(`"${def.label}" (${node.id.slice(0, 8)}…): ${(error as Error).message}`)
        result = new Map()
      }
    }

    visiting.delete(nodeId)
    compiled.set(nodeId, result)
    return result
  }

  const output = compileNode(graph.outputNodeId)
  if (output && errors.length === 0) {
    const assign = (key: string, target: string) => {
      const v = output.get(key)
      if (v !== null && v !== undefined) {
        ;(material as unknown as Record<string, unknown>)[target] = v
      }
    }
    assign('baseColor', 'colorNode')
    assign('roughness', 'roughnessNode')
    assign('metalness', 'metalnessNode')
    assign('normal', 'normalNode')
    assign('emissive', 'emissiveNode')
    assign('opacity', 'opacityNode')
    assign('alphaTest', 'alphaTestNode')
    if (output.has('opacity')) material.transparent = true
  }

  if (errors.length > 0) {
    material.dispose()
    return { material: null, errors }
  }
  return { material, errors: [] }
}

function compileSampleTexture(
  node: MaterialGraphNode,
  getInput: (socketId: string) => unknown,
  textures: Map<string, THREE.Texture>
): Map<string, unknown> {
  const assetId = String(node.values?.assetId ?? '')
  const tex = textures.get(node.id)
  if (!tex) {
    // Fallback: magenta to make missing textures obvious
    const c = TSL.color(1, 0, 1)
    const entries: [string, unknown][] = [['color', c], ['r', TSL.float(1)], ['g', TSL.float(0)], ['b', TSL.float(1)], ['a', TSL.float(1)]]
    return new Map<string, unknown>(entries)
  }
  const uvInput = getInput('uv') ?? TSL.uv
  const sampled = TSL.texture(tex, uvInput as never)
  const split = TSL.split(sampled as never) as unknown as { x: unknown; y: unknown; z: unknown; w: unknown }
  void assetId
  return new Map([
    ['color', sampled],
    ['r', split.x],
    ['g', split.y],
    ['b', split.z],
    ['a', split.w],
  ])
}

function compileNormalMapNode(
  node: MaterialGraphNode,
  getInput: (socketId: string) => unknown,
  textures: Map<string, THREE.Texture>
): Map<string, unknown> {
  const tex = textures.get(node.id)
  if (!tex) {
    return new Map<string, unknown>([['out', TSL.normalLocal]])
  }
  const uvInput = getInput('uv') ?? TSL.uv
  const strength = getInput('strength') ?? TSL.float(1)
  const nmap = (TSL.normalMap as unknown as (t: unknown, u: unknown) => unknown)(tex, uvInput)
  void strength
  return new Map([['out', nmap]])
}
