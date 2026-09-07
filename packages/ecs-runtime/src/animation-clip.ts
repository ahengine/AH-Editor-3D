import * as THREE from 'three'
import type { AnimationClipData, AnimationTrack, AnimationKeyframe } from '@ahengine/project-schema'

/**
 * Animation clip runtime evaluator — samples authored keyframe data.
 *
 * Preview architecture: evaluate(clip, time, resolveTarget) returns a map of
 * {target → {component, property, value}}. The caller (editor viewport)
 * applies these to entities and restores authored state on stop.
 *
 * Rotation strategy: authored as Euler degrees in keyframe values (matching
 * the inspector). Runtime interpolation uses component-wise Euler lerp for
 * V1 — documented limitation: large rotations (>180° between keys) may take
 * the shorter visual path. Quaternion slerp is architected for via the
 * 'quaternion' valueType but not yet exposed in the UI.
 */

export type ResolvedValue = number | [number, number, number] | string

export interface SampledProperty {
  component: string
  property: string
  value: ResolvedValue
}

export interface ClipSample {
  /** target → sampled properties */
  [target: string]: SampledProperty[]
}

/** Interpolates between two keyframes. */
function interpolate(
  from: AnimationKeyframe,
  to: AnimationKeyframe | null,
  t: number,
  valueType: string
): ResolvedValue {
  // Beyond last keyframe → hold last value
  if (!to) return from.value as ResolvedValue

  const span = to.time - from.time
  if (span <= 0) return from.value as ResolvedValue
  const alpha = Math.min(1, Math.max(0, (t - from.time) / span))

  // Step: hold from-value until we reach to-time
  if (from.interpolation === 'step') return from.value as ResolvedValue

  // Linear interpolation
  if (typeof from.value === 'number' && typeof to.value === 'number') {
    return from.value + (to.value - from.value) * alpha
  }
  if (Array.isArray(from.value) && Array.isArray(to.value)) {
    return from.value.map((v, i) => v + ((to.value as number[])[i] - v) * alpha) as [number, number, number]
  }
  // Color strings or mixed types → step
  return from.value as ResolvedValue
}

/** Samples a single track at time t. */
export function sampleTrack(track: AnimationTrack, t: number): ResolvedValue {
  const keys = track.keyframes
  if (keys.length === 0) return 0
  // Sort once (cached by caller if hot)
  const sorted = [...keys].sort((a, b) => a.time - b.time)
  if (t <= sorted[0].time) return sorted[0].value as ResolvedValue

  for (let i = 0; i < sorted.length - 1; i++) {
    const from = sorted[i]
    const to = sorted[i + 1]
    if (t >= from.time && t < to.time) {
      return interpolate(from, to, t, track.valueType)
    }
  }
  // Past last keyframe → hold
  return sorted[sorted.length - 1].value as ResolvedValue
}

/** Samples the entire clip at time t. Returns per-target property values. */
export function sampleClip(clip: AnimationClipData, t: number): ClipSample {
  const sample: ClipSample = {}
  for (const track of clip.tracks) {
    const value = sampleTrack(track, t)
    if (!sample[track.target]) sample[track.target] = []
    sample[track.target].push({ component: track.component, property: track.property, value })
  }
  return sample
}

/* ------------------------------------------------------------------ */
/* Scene application + restore (for preview)                           */
/* ------------------------------------------------------------------ */

export interface SceneSnapshot {
  /** target → component → serialized value (for restore) */
  [target: string]: Record<string, unknown>
}

/**
 * Captures the current authored state of all clip targets.
 * Call before preview starts; restore on stop.
 */
export function captureSceneSnapshot(
  world: import('koota').World,
  clip: AnimationClipData,
  getEntity: (target: string) => import('koota').Entity | undefined,
  serializeComponent: (entity: import('koota').Entity, componentId: string) => Record<string, unknown> | undefined
): SceneSnapshot {
  const snapshot: SceneSnapshot = {}
  for (const track of clip.tracks) {
    const entity = getEntity(track.target)
    if (!entity) continue
    if (!snapshot[track.target]) snapshot[track.target] = {}
    const data = serializeComponent(entity, track.component)
    if (data) snapshot[track.target][track.component] = data
  }
  return snapshot
}

/**
 * Restores authored state captured before preview.
 * Call when preview stops/reverts.
 */
export function restoreSceneSnapshot(
  snapshot: SceneSnapshot,
  getEntity: (target: string) => import('koota').Entity | undefined,
  applyComponent: (entity: import('koota').Entity, componentId: string, data: Record<string, unknown>) => void
): void {
  for (const [target, components] of Object.entries(snapshot)) {
    const entity = getEntity(target)
    if (!entity || !entity.isAlive()) continue
    for (const [componentId, data] of Object.entries(components)) {
      applyComponent(entity, componentId, data as Record<string, unknown>)
    }
  }
}

/**
 * Applies a clip sample to live entities.
 * The caller provides component setters (from the registry).
 */
export function applyClipSample(
  sample: ClipSample,
  getEntity: (target: string) => import('koota').Entity | undefined,
  setComponentValue: (
    entity: import('koota').Entity,
    componentId: string,
    property: string,
    value: ResolvedValue
  ) => void
): void {
  for (const [target, properties] of Object.entries(sample)) {
    const entity = getEntity(target)
    if (!entity || !entity.isAlive()) continue
    for (const prop of properties) {
      setComponentValue(entity, prop.component, prop.property, prop.value)
    }
  }
}
