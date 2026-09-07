import { z } from 'zod'
import { SerializedEntitySchema } from './scene.js'

/** Prefab domain — reusable entity hierarchies with nested instances and overrides. */

export const PREFAB_FORMAT = 'koota-3d-prefab'

/* ---- Prefab entity (stable LOCAL IDs, not scene UUIDs) ---- */

export interface PrefabEntity {
  /** Stable local ID within this prefab (e.g. 'root', 'seat', 'wheel-fl'). */
  localId: string
  /** Parent local ID within this prefab, or null for root. */
  parentLocalId: string | null
  /** Authored name (display). */
  name: string
  enabled: boolean
  /** Component data keyed by stable component ID. */
  components: Record<string, Record<string, unknown>>
}

export const PrefabEntitySchema = z.object({
  localId: z.string().min(1),
  parentLocalId: z.string().nullable(),
  name: z.string(),
  enabled: z.boolean(),
  components: z.record(z.string(), z.record(z.string(), z.unknown())),
})

/* ---- Nested prefab instance (NOT flattened) ---- */

export interface NestedPrefabInstance {
  /** Unique instance identifier within this prefab. */
  instanceId: string
  /** The referenced prefab's stable ID. */
  prefabId: string
  /** Parent local entity ID within the containing prefab. */
  parentLocalId: string | null
  /** Display name override. */
  name?: string
  /** Field-level overrides: localId → componentId → propertyPath → value. */
  overrides: PrefabOverrides
}

export const NestedPrefabInstanceSchema = z.object({
  instanceId: z.string().min(1),
  prefabId: z.string().min(1),
  parentLocalId: z.string().nullable(),
  name: z.string().optional(),
  overrides: z.record(z.string(), z.record(z.string(), z.record(z.string(), z.unknown()))).default({}),
})

/* ---- Overrides ---- */

/**
 * Field-level patch of component data that differs from the prefab source.
 * Keyed by prefab local entity ID → component ID → property path → value.
 */
export type PrefabOverrides = Record<string, Record<string, Record<string, unknown>>>

export const PrefabOverridesSchema = z.record(
  z.string(),
  z.record(z.string(), z.record(z.string(), z.unknown()))
)

/* ---- Prefab definition ---- */

export interface PrefabDefinition {
  format: typeof PREFAB_FORMAT
  schemaVersion: number
  id: string
  name: string
  /** Root entity's localId. */
  rootLocalEntityId: string
  /** Direct entities authored in this prefab (local IDs). */
  entities: PrefabEntity[]
  /** Nested prefab instances (kept as references, NOT flattened). */
  nestedInstances: NestedPrefabInstance[]
  /** Legacy field: old-format prefabs stored full SerializedEntity[] with UUIDs. */
  /** Migration converts to localId format. */
}

export const PrefabDefinitionSchema = z.object({
  format: z.literal(PREFAB_FORMAT),
  schemaVersion: z.number().int().min(1),
  id: z.string().min(1),
  name: z.string(),
  rootLocalEntityId: z.string().min(1, 'Prefab rootLocalEntityId is required'),
  entities: z.array(PrefabEntitySchema).min(1, 'Prefab must contain at least one entity'),
  nestedInstances: z.array(NestedPrefabInstanceSchema).default([]),
})

/* ---- Legacy format for migration ---- */

export interface LegacyPrefabDefinition {
  format: typeof PREFAB_FORMAT
  schemaVersion: number
  id: string
  name: string
  rootEntityId: string
  entities: import('./scene.js').SerializedEntity[]
}

export const LegacyPrefabDefinitionSchema = z.object({
  format: z.literal(PREFAB_FORMAT),
  schemaVersion: z.number().int().min(1),
  id: z.string().min(1),
  name: z.string(),
  rootEntityId: z.string().min(1),
  entities: z.array(SerializedEntitySchema).min(1),
})

/* ---- Cycle detection ---- */

export interface PrefabGraphContext {
  /** All available prefab definitions for reference resolution. */
  prefabs: Map<string, PrefabDefinition>
}

/**
 * Detects circular prefab nesting. Returns a descriptive error or null.
 * Checks: direct self-reference, and indirect cycles (A→B→A).
 */
export function detectPrefabCycle(
  prefabId: string,
  context: PrefabGraphContext,
  visited?: Set<string>
): string | null {
  const stack = visited ?? new Set<string>()
  if (stack.has(prefabId)) {
    return `Circular prefab nesting detected: ${[...stack, prefabId].join(' → ')}`
  }
  const prefab = context.prefabs.get(prefabId)
  if (!prefab) return null
  stack.add(prefabId)
  for (const nested of prefab.nestedInstances ?? []) {
    const error = detectPrefabCycle(nested.prefabId, context, new Set(stack))
    if (error) return error
  }
  return null
}

/** Validates that a prefab can be nested inside another without creating a cycle. */
export function canNestPrefab(
  containerPrefabId: string,
  nestedPrefabId: string,
  context: PrefabGraphContext
): { ok: boolean; error?: string } {
  if (containerPrefabId === nestedPrefabId) {
    return { ok: false, error: 'Cannot nest a prefab inside itself' }
  }
  // Check if nestedPrefabId transitively contains containerPrefabId
  const checkContext = { prefabs: new Map(context.prefabs) }
  // Temporarily add the hypothetical nesting
  const container = checkContext.prefabs.get(containerPrefabId)
  if (!container) return { ok: true }
  const hypothetical = {
    ...container,
    nestedInstances: [
      ...(container.nestedInstances ?? []),
      { instanceId: 'cycle-check', prefabId: nestedPrefabId, parentLocalId: null, overrides: {} },
    ],
  }
  checkContext.prefabs.set(containerPrefabId, hypothetical)
  const error = detectPrefabCycle(containerPrefabId, checkContext)
  if (error) return { ok: false, error }
  return { ok: true }
}
