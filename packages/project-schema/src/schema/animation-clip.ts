import { z } from 'zod'

/**
 * Animation Clip domain — authored keyframe tracks.
 * Separate from Animator state machines (next phase).
 *
 * Target binding uses stable authored identity:
 * - Scene animation: persistent entity UUID
 * - Prefab-owned animation: prefab local entity ID
 * Never THREE.Object3D UUID, never transient Koota IDs.
 */

export const ANIMATION_CLIP_FORMAT = 'koota-3d-animation-clip'

/* ---- Interpolation ---- */

export type KeyframeInterpolation = 'step' | 'linear'

export const KeyframeInterpolationSchema = z.enum(['step', 'linear'])

/* ---- Value types ---- */

export type TrackValueType = 'number' | 'vec3' | 'color' | 'quaternion'

export const TrackValueTypeSchema = z.enum(['number', 'vec3', 'color', 'quaternion'])

/* ---- Keyframe ---- */

/** A single keyframe: value at a point in time. */
export interface AnimationKeyframe {
  id: string
  /** Time in seconds from clip start. */
  time: number
  /** Scalar, [x,y,z], #hex, or [x,y,z,w] depending on track valueType. */
  value: number | [number, number, number] | string | [number, number, number, number]
  interpolation: KeyframeInterpolation
}

export const AnimationKeyframeSchema = z.object({
  id: z.string().min(1),
  time: z.number().min(0),
  value: z.union([
    z.number(),
    z.tuple([z.number(), z.number(), z.number()]),
    z.string(),
    z.tuple([z.number(), z.number(), z.number(), z.number()]),
  ]),
  interpolation: KeyframeInterpolationSchema.default('linear'),
})

/* ---- Track ---- */

export interface AnimationTrack {
  id: string
  /** Stable target identity (entity UUID for scene, localId for prefab). */
  target: string
  /** Target display name for the track hierarchy. */
  targetName?: string
  /** Component ID from the registry, e.g. 'core.transform'. */
  component: string
  /** Property path within the component, e.g. 'position.x'. */
  property: string
  valueType: TrackValueType
  keyframes: AnimationKeyframe[]
}

export const AnimationTrackSchema = z.object({
  id: z.string().min(1),
  target: z.string().min(1),
  targetName: z.string().optional(),
  component: z.string().min(1),
  property: z.string().min(1),
  valueType: TrackValueTypeSchema,
  keyframes: z.array(AnimationKeyframeSchema),
})

/* ---- Clip ---- */

export interface AnimationClipData {
  format: typeof ANIMATION_CLIP_FORMAT
  schemaVersion: number
  id: string
  name: string
  duration: number
  fps: number
  tracks: AnimationTrack[]
  /** True when derived from an imported GLTF clip (read-only; Duplicate to edit). */
  imported?: boolean
  /** Source model asset ID if imported. */
  sourceAssetId?: string | null
}

export const AnimationClipDataSchema = z.object({
  format: z.literal(ANIMATION_CLIP_FORMAT),
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string(),
  duration: z.number().positive(),
  fps: z.number().int().min(1).max(120).default(30),
  tracks: z.array(AnimationTrackSchema),
  imported: z.boolean().optional(),
  sourceAssetId: z.string().nullable().optional(),
})

/* ---- Integrity ---- */

export function validateClipIntegrity(clip: AnimationClipData): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = []
  const trackIds = new Set<string>()
  for (const track of clip.tracks) {
    if (trackIds.has(track.id)) {
      issues.push({ path: `track "${track.id}"`, message: 'Duplicate track ID' })
    }
    trackIds.add(track.id)
    if (track.keyframes.length > 0) {
      const sorted = [...track.keyframes].sort((a, b) => a.time - b.time)
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].time === sorted[i - 1].time) {
          issues.push({
            path: `track "${track.id}" @ ${sorted[i].time}s`,
            message: 'Duplicate keyframe times',
          })
        }
      }
      const maxTime = sorted[sorted.length - 1].time
      if (maxTime > clip.duration) {
        issues.push({
          path: `track "${track.id}"`,
          message: `Keyframe at ${maxTime}s exceeds clip duration ${clip.duration}s`,
        })
      }
    }
  }
  return issues
}
