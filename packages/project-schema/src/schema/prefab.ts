import { z } from 'zod'
import { SerializedEntitySchema, type SerializedEntity } from './scene.js'

/** Prefab domain — reusable entity hierarchies with field-level overrides. */

export const PREFAB_FORMAT = 'koota-3d-prefab'

/**
 * Field-level patch of component data that differs from the prefab source.
 * Keyed by member entity uuid, then component id, then field name.
 */
export type PrefabOverrides = Record<string, Record<string, Record<string, unknown>>>

export interface PrefabDefinition {
  format: typeof PREFAB_FORMAT
  schemaVersion: number
  id: string
  name: string
  rootEntityId: string
  entities: SerializedEntity[]
}

export const PrefabDefinitionSchema = z.object({
  format: z.literal(PREFAB_FORMAT),
  schemaVersion: z.number().int().min(1),
  id: z.string().min(1),
  name: z.string(),
  rootEntityId: z.string().min(1, 'Prefab rootEntityId is required'),
  entities: z.array(SerializedEntitySchema).min(1, 'Prefab must contain at least one entity'),
})
