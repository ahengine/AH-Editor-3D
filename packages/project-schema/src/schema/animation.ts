import { z } from 'zod'

/**
 * Animation domain — clip asset metadata.
 * Clip samples live inside GLTF model assets; an AnimationClipAsset is the
 * authored reference (stable id + human name) so animators/entities can point
 * at clips without hardcoding GLTF internals.
 */

export const ANIMATION_FORMAT = 'koota-3d-animation'

export interface AnimationClipAsset {
  format: typeof ANIMATION_FORMAT
  schemaVersion: number
  id: string
  name: string
  /** Model asset that provides the clip samples, or null for future authored clips. */
  sourceModelAssetId: string | null
  /** Clip name inside the source model. */
  clipName: string
  duration: number
}

export const AnimationClipAssetSchema = z.object({
  format: z.literal(ANIMATION_FORMAT),
  schemaVersion: z.number().int().min(1),
  id: z.string().min(1),
  name: z.string(),
  sourceModelAssetId: z.string().nullable(),
  clipName: z.string(),
  duration: z.number().min(0),
})
