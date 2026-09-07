import { z } from 'zod'
import { hexColor } from './common.js'

/** Material domain — data-only material definitions (Node Materials are runtime). */

export const MATERIAL_FORMAT = 'koota-3d-material'

export type MaterialType = 'standard' | 'physical' | 'unlit'

export interface MaterialProperties {
  baseColor?: string
  baseColorTexture?: string | null
  metalness?: number
  metalnessTexture?: string | null
  roughness?: number
  roughnessTexture?: string | null
  normalTexture?: string | null
  normalScale?: number
  emissive?: string
  emissiveIntensity?: number
  emissiveTexture?: string | null
  opacity?: number
  transparent?: boolean
  alphaTest?: number
  side?: 'front' | 'back' | 'double'
}

export interface MaterialDefinition {
  id: string
  name: string
  type: MaterialType
  properties: MaterialProperties
}

export const MaterialPropertiesSchema = z.object({
  baseColor: hexColor.optional(),
  baseColorTexture: z.string().nullable().optional(),
  metalness: z.number().min(0).max(1).optional(),
  metalnessTexture: z.string().nullable().optional(),
  roughness: z.number().min(0).max(1).optional(),
  roughnessTexture: z.string().nullable().optional(),
  normalTexture: z.string().nullable().optional(),
  normalScale: z.number().optional(),
  emissive: hexColor.optional(),
  emissiveIntensity: z.number().min(0).optional(),
  emissiveTexture: z.string().nullable().optional(),
  opacity: z.number().min(0).max(1).optional(),
  transparent: z.boolean().optional(),
  alphaTest: z.number().min(0).max(1).optional(),
  side: z.enum(['front', 'back', 'double']).optional(),
})

export const MaterialDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['standard', 'physical', 'unlit']),
  properties: MaterialPropertiesSchema,
})

/** Standalone exportable material file. */
export interface MaterialAsset {
  format: typeof MATERIAL_FORMAT
  schemaVersion: number
  material: MaterialDefinition
}

export const MaterialAssetSchema = z.object({
  format: z.literal(MATERIAL_FORMAT),
  schemaVersion: z.number().int().min(1),
  material: MaterialDefinitionSchema,
})
