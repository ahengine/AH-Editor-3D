import { describe, expect, it } from 'vitest'
import type { AnimationClipData, AnimationTrack, AnimationKeyframe } from '@ahengine/project-schema'
import { AnimationClipDataSchema, validateClipIntegrity } from '@ahengine/project-schema'
import { sampleClip, sampleTrack } from '@ahengine/ecs-runtime'

/* Animation Clip Authoring: schema, evaluator, interpolation, round-trip. */

const kf = (time: number, value: number, interpolation: 'step' | 'linear' = 'linear'): AnimationKeyframe => ({
  id: `kf-${time}`,
  time,
  value,
  interpolation,
})

const track = (
  id: string, target: string, component: string, property: string, keyframes: AnimationKeyframe[]
): AnimationTrack => ({
  id, target, component, property, valueType: 'number', keyframes,
})

function makeClip(overrides?: Partial<AnimationClipData>): AnimationClipData {
  return {
    format: 'koota-3d-animation-clip',
    schemaVersion: 1,
    id: 'clip-test',
    name: 'Test Clip',
    duration: 3,
    fps: 30,
    tracks: [],
    ...overrides,
  }
}

describe('animation clip schema', () => {
  it('round-trips through zod', () => {
    const clip = makeClip({
      tracks: [track('t1', 'entity-uuid-1', 'core.transform', 'position.x', [kf(0, 0), kf(1, 5), kf(2, 0)])],
    })
    const parsed = AnimationClipDataSchema.parse(JSON.parse(JSON.stringify(clip)))
    expect(parsed.tracks[0].keyframes).toHaveLength(3)
    expect(parsed.tracks[0].keyframes[0].value).toBe(0)
  })

  it('rejects invalid interpolation', () => {
    expect(() => AnimationClipDataSchema.parse({
      ...makeClip(),
      tracks: [{ ...track('t', 'x', 'c', 'p', [{ id: 'k', time: 0, value: 0, interpolation: 'cubic' }]) }],
    })).toThrow()
  })

  it('integrity flags keyframe beyond duration', () => {
    const clip = makeClip({ tracks: [track('t', 'x', 'c', 'p', [kf(0, 0), kf(10, 5)])] })
    const issues = validateClipIntegrity(clip)
    expect(issues.some((i) => i.message.includes('exceeds clip duration'))).toBe(true)
  })
})

describe('clip evaluator — Cube Move 0→5→0', () => {
  const moveClip = makeClip({
    tracks: [track('move-x', 'cube-uuid', 'core.transform', 'position.x', [kf(0, 0), kf(1, 5), kf(2, 0)])],
  })

  it('samples t=0 → x=0', () => {
    expect(sampleTrack(moveClip.tracks[0], 0)).toBe(0)
  })
  it('samples t=1 → x=5', () => {
    expect(sampleTrack(moveClip.tracks[0], 1)).toBe(5)
  })
  it('samples t=2 → x=0 (return)', () => {
    expect(sampleTrack(moveClip.tracks[0], 2)).toBe(0)
  })
  it('samples t=0.5 → x=2.5 (linear mid)', () => {
    expect(sampleTrack(moveClip.tracks[0], 0.5)).toBe(2.5)
  })
  it('samples t=1.5 → x=2.5 (linear mid return)', () => {
    expect(sampleTrack(moveClip.tracks[0], 1.5)).toBe(2.5)
  })
  it('samples t=2.5 → x=0 (hold past last key)', () => {
    expect(sampleTrack(moveClip.tracks[0], 2.5)).toBe(0)
  })
  it('sampleClip returns per-target properties', () => {
    const sample = sampleClip(moveClip, 0.5)
    expect(sample['cube-uuid']).toBeDefined()
    expect(sample['cube-uuid'][0].property).toBe('position.x')
    expect(sample['cube-uuid'][0].value).toBe(2.5)
  })
})

describe('interpolation modes', () => {
  it('step holds value until next key', () => {
    const t = track('step', 'x', 'c', 'p', [
      kf(0, 0, 'step'), kf(1, 10, 'linear'),
    ])
    expect(sampleTrack(t, 0.5)).toBe(0) // holds at 0
    expect(sampleTrack(t, 0.99)).toBe(0)
    expect(sampleTrack(t, 1)).toBe(10) // at the key, jumps
  })

  it('linear interpolates', () => {
    const t = track('lin', 'x', 'c', 'p', [kf(0, 0), kf(1, 10)])
    expect(sampleTrack(t, 0.5)).toBe(5)
    expect(sampleTrack(t, 0.25)).toBe(2.5)
    expect(sampleTrack(t, 0.75)).toBe(7.5)
  })

  it('vec3 linear interpolates component-wise', () => {
    const vecTrack: AnimationTrack = {
      id: 'vec', target: 'x', component: 'core.transform', property: 'position', valueType: 'vec3',
      keyframes: [
        { id: 'a', time: 0, value: [0, 0, 0], interpolation: 'linear' },
        { id: 'b', time: 1, value: [10, 20, 30], interpolation: 'linear' },
      ],
    }
    const result = sampleTrack(vecTrack, 0.5)
    expect(result).toEqual([5, 10, 15])
  })
})

describe('save/reload stability', () => {
  it('clip data survives JSON round-trip with identical playback', () => {
    const original = makeClip({
      tracks: [
        track('pos-x', 'uuid-1', 'core.transform', 'position.x', [kf(0, 0), kf(1, 5), kf(2, 0)]),
        track('scl-y', 'uuid-1', 'core.transform', 'scale.y', [kf(0, 1), kf(2, 3)]),
      ],
    })
    const json = JSON.parse(JSON.stringify(original))
    const restored = AnimationClipDataSchema.parse(json)

    // Playback identical
    for (const t of [0, 0.25, 0.5, 1, 1.5, 2]) {
      expect(sampleClip(restored, t)).toEqual(sampleClip(original, t))
    }
  })

  it('no THREE/TSL/runtime objects in serialized clip', () => {
    const clip = makeClip({
      tracks: [track('t', 'x', 'core.transform', 'position.x', [kf(0, 0)])],
    })
    const json = JSON.stringify(clip)
    expect(json).not.toContain('THREE')
    expect(json).not.toContain('function')
    expect(json).not.toContain('undefined')
  })
})
