import { z } from 'zod'

/** Shared primitives every authoring domain builds on. No domain imports. */

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isValidUUID(value: string): boolean {
  return UUID_PATTERN.test(value)
}

export const hexColor = z
  .string()
  .regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'Expected #rrggbb color')

export const Vec3Schema = z.tuple([z.number(), z.number(), z.number()])
export const Vec2Schema = z.tuple([z.number(), z.number()])

export type AssetType =
  | 'model'
  | 'texture'
  | 'material'
  | 'animation-controller'
  | 'animation-clip'
  | 'prefab'
  | 'environment'
  | 'particle-effect'

export const AssetTypeSchema = z.enum([
  'model',
  'texture',
  'material',
  'animation-controller',
  'animation-clip',
  'prefab',
  'environment',
  'particle-effect',
])

export interface AssetRecord {
  id: string
  type: AssetType
  name: string
  /** Infrastructure agnostic URI. e.g. `idb://…` in the editor, `https://…` or `/assets/…` at runtime. */
  uri: string
  /** Where the asset came from (e.g. original filename or 'generated'). */
  source?: string
  metadata?: Record<string, unknown>
  createdAt?: string
}

export const AssetRecordSchema = z.object({
  id: z.string().min(1),
  type: AssetTypeSchema,
  name: z.string(),
  uri: z.string().min(1),
  source: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  // v1 backfill: records authored before this field existed parse without it.
  createdAt: z.string().optional(),
})
