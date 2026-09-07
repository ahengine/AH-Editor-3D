import type { AnimatorControllerV2, AnimatorCondition } from '@ahengine/project-schema'
import type { AnimationClipData } from '@ahengine/project-schema'
import { sampleClip, type ClipSample } from './animation-clip.js'

/**
 * Animator runtime — evaluates a controller state machine against parameters.
 *
 * - Maintains current state
 * - Evaluates transitions on each update
 * - Consumes triggers (set → transition fires → trigger resets)
 * - Crossfade between states using linear blend of clip samples
 * - Does NOT serialize AnimationMixer (runtime-only object)
 *
 * Trigger behavior: a trigger parameter is set to `true` by the caller.
 * When a transition with `operator: 'activated'` fires, the trigger is
 * automatically reset to `false`. If no transition consumes it, the trigger
 * stays `true` until manually reset or consumed by a later transition.
 */

export type ParameterValue = number | boolean

export interface AnimatorStateRuntimeInfo {
  currentStateId: string
  /** Elapsed time in current state (seconds). */
  stateTime: number
  /** True during a crossfade transition. */
  transitioning: boolean
  /** Transition source state (during crossfade). */
  fromStateId: string | null
  /** Transition progress 0–1. */
  transitionAlpha: number
}

export class AnimatorRuntimeV2 {
  private parameters = new Map<string, ParameterValue>()
  private stateId: string
  private stateTime = 0
  private transition: { from: string; toId: string; duration: number; elapsed: number } | null = null

  constructor(
    private controller: AnimatorControllerV2,
    private clipResolver: (clipId: string) => AnimationClipData | undefined
  ) {
    // Initialize parameters to defaults
    for (const param of controller.parameters) {
      this.parameters.set(param.id, param.defaultValue)
    }
    this.stateId = controller.entryStateId
  }

  /** Current state + transition info for UI display. */
  get info(): AnimatorStateRuntimeInfo {
    return {
      currentStateId: this.stateId,
      stateTime: this.stateTime,
      transitioning: this.transition !== null,
      fromStateId: this.transition?.from ?? null,
      transitionAlpha: this.transition ? this.transition.elapsed / this.transition.duration : 0,
    }
  }

  get currentStateName(): string {
    return this.controller.states.find((s) => s.id === this.stateId)?.name ?? this.stateId
  }

  getParameter(id: string): ParameterValue | undefined {
    return this.parameters.get(id)
  }

  setParameter(id: string, value: ParameterValue): void {
    this.parameters.set(id, value)
  }

  /** Convenience: activates a trigger parameter. */
  fireTrigger(id: string): void {
    this.parameters.set(id, true)
  }

  /**
   * Advances the state machine. Returns the blended clip sample to apply.
   * Call once per frame with delta seconds.
   */
  update(dt: number): ClipSample | null {
    this.stateTime += dt

    // Advance crossfade
    if (this.transition) {
      this.transition.elapsed += dt
      if (this.transition.elapsed >= this.transition.duration) {
        this.transition = null
      }
    }

    // Evaluate transitions (skip if already transitioning)
    if (!this.transition) {
      const fired = this.evaluateTransitions()
      if (fired) {
        // Transition started — may include crossfade
        if (fired.duration > 0) {
          this.transition = {
            from: fired.from,
            toId: this.stateId,
            duration: fired.duration,
            elapsed: 0,
          }
        }
      }
    }

    // Build blended sample
    return this.buildSample()
  }

  /** Forces a state change (bypasses transitions). Useful for preview/testing. */
  forceState(stateId: string): void {
    this.stateId = stateId
    this.stateTime = 0
    this.transition = null
  }

  private evaluateTransitions(): AnimatorControllerV2['transitions'][0] | null {
    const candidates = this.controller.transitions.filter((t) => t.from === this.stateId)
    for (const transition of candidates) {
      // Exit time check (normalized 0–1 of state's clip duration, -1 = immediate)
      if (transition.exitTime >= 0) {
        const state = this.controller.states.find((s) => s.id === this.stateId)
        const clip = state?.clipId ? this.clipResolver(state.clipId) : undefined
        const duration = clip?.duration ?? 1
        if (this.stateTime / duration < transition.exitTime) continue
      }
      if (this.checkConditions(transition.conditions)) {
        // Consume triggers used by this transition
        for (const cond of transition.conditions) {
          if (cond.operator === 'activated') {
            this.parameters.set(cond.parameterId, false)
          }
        }
        // Switch state
        this.stateId = transition.to
        this.stateTime = 0
        return transition
      }
    }
    return null
  }

  private checkConditions(conditions: AnimatorCondition[]): boolean {
    return conditions.every((cond) => {
      const value = this.parameters.get(cond.parameterId)
      if (value === undefined) return false
      switch (cond.operator) {
        case 'activated': return value === true
        case '>': return Number(value) > Number(cond.value ?? 0)
        case '>=': return Number(value) >= Number(cond.value ?? 0)
        case '<': return Number(value) < Number(cond.value ?? 0)
        case '<=': return Number(value) <= Number(cond.value ?? 0)
        case '==': return value === cond.value
        case '!=': return value !== cond.value
        default: return false
      }
    })
  }

  private buildSample(): ClipSample | null {
    const currentState = this.controller.states.find((s) => s.id === this.stateId)
    if (!currentState?.clipId) return null
    const currentClip = this.clipResolver(currentState.clipId)
    if (!currentClip) return null

    const currentSample = sampleClip(currentClip, this.stateTime * currentState.speed)

    // Crossfade with previous state
    if (this.transition && this.transition.duration > 0) {
      const fromState = this.controller.states.find((s) => s.id === this.transition!.from)
      const fromClip = fromState?.clipId ? this.clipResolver(fromState.clipId) : undefined
      if (fromClip) {
        const alpha = this.transition.elapsed / this.transition.duration
        const fromSample = sampleClip(fromClip, this.stateTime * (fromState?.speed ?? 1))
        return blendSamples(fromSample, currentSample, alpha)
      }
    }

    return currentSample
  }
}

/** Linear blend of two clip samples (per-property). */
function blendSamples(from: ClipSample, to: ClipSample, alpha: number): ClipSample {
  const result: ClipSample = {}
  for (const [target, props] of Object.entries(to)) {
    const fromProps = from[target]
    result[target] = props.map((prop) => {
      const fromProp = fromProps?.find((p) => p.component === prop.component && p.property === prop.property)
      if (!fromProp) return prop
      const blended = blendValue(fromProp.value, prop.value, alpha)
      return { ...prop, value: blended }
    })
  }
  return result
}

function blendValue(
  from: number | [number, number, number] | string,
  to: number | [number, number, number] | string,
  alpha: number
): number | [number, number, number] | string {
  if (typeof from === 'number' && typeof to === 'number') {
    return from + (to - from) * alpha
  }
  if (Array.isArray(from) && Array.isArray(to)) {
    return from.map((v, i) => v + ((to as number[])[i] - v) * alpha) as [number, number, number]
  }
  // Non-numeric → step at 50%
  return alpha >= 0.5 ? to : from
}
