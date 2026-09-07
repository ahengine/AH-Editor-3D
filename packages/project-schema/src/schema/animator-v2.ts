import { z } from 'zod'

/**
 * Animator Controller domain — state machines orchestrating AnimationClips.
 * Separate from AnimationClipData (previous phase).
 *
 * Parameters use stable IDs internally (survive rename).
 * Triggers behave as events: set → consumed by a valid transition → reset.
 */

export const ANIMATOR_FORMAT = 'koota-3d-animator'

/* ---- Parameters ---- */

export type AnimatorParameterType = 'float' | 'int' | 'bool' | 'trigger'

export interface AnimatorParameter {
  id: string
  name: string
  type: AnimatorParameterType
  defaultValue: number | boolean
}

export const AnimatorParameterSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(['float', 'int', 'bool', 'trigger']),
  defaultValue: z.union([z.number(), z.boolean()]).default(0),
})

/* ---- States ---- */

export interface AnimatorState {
  id: string
  name: string
  /** AnimationClipData ID (null for empty/idle state with no motion). */
  clipId: string | null
  speed: number
  loop: boolean
  /** Editor canvas position [x, y]. */
  position?: [number, number]
}

export const AnimatorStateSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  clipId: z.string().nullable().default(null),
  speed: z.number().default(1),
  loop: z.boolean().default(true),
  position: z.tuple([z.number(), z.number()]).optional(),
})

/* ---- Transitions ---- */

export type ConditionOperator =
  | '>' | '>=' | '<' | '<=' | '==' | '!='  // float/int
  | '==' | '!='                              // bool (overlapping, validated by type)
  | 'activated'                              // trigger

export type AnimatorConditionOperator =
  | '>' | '>=' | '<' | '<=' | '==' | '!=' | 'activated'

export interface AnimatorCondition {
  parameterId: string
  operator: AnimatorConditionOperator
  /** Comparison value (not used for 'activated'). */
  value?: number | boolean
}

export const AnimatorConditionSchema = z.object({
  parameterId: z.string().min(1),
  operator: z.enum(['>', '>=', '<', '<=', '==', '!=', 'activated']),
  value: z.union([z.number(), z.boolean()]).optional(),
})

export interface AnimatorTransition {
  id: string
  from: string
  to: string
  /** Crossfade duration in seconds (0 = instant). */
  duration: number
  /** Normalized exit time (0–1); transition can only fire at/after this point. -1 = immediate. */
  exitTime: number
  conditions: AnimatorCondition[]
}

export const AnimatorTransitionSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  duration: z.number().min(0).default(0),
  exitTime: z.number().min(-1).max(1).default(-1),
  conditions: z.array(AnimatorConditionSchema).default([]),
})

/* ---- Controller ---- */

export interface AnimatorControllerV2 {
  format: typeof ANIMATOR_FORMAT
  schemaVersion: number
  id: string
  name: string
  parameters: AnimatorParameter[]
  states: AnimatorState[]
  transitions: AnimatorTransition[]
  entryStateId: string
}

export const AnimatorControllerV2Schema = z.object({
  format: z.literal(ANIMATOR_FORMAT).default(ANIMATOR_FORMAT),
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  name: z.string(),
  parameters: z.array(AnimatorParameterSchema).default([]),
  states: z.array(AnimatorStateSchema).min(1, 'Controller must have at least one state'),
  transitions: z.array(AnimatorTransitionSchema).default([]),
  entryStateId: z.string().min(1, 'Entry state is required'),
})

/* ---- Validation ---- */

export interface AnimatorIssue { path: string; message: string }

export function validateAnimatorController(ctrl: AnimatorControllerV2): AnimatorIssue[] {
  const issues: AnimatorIssue[] = []
  const stateIds = new Set(ctrl.states.map((s) => s.id))
  const paramIds = new Set(ctrl.parameters.map((p) => p.id))

  // Entry state must exist
  if (!stateIds.has(ctrl.entryStateId)) {
    issues.push({ path: 'entryStateId', message: `Entry state "${ctrl.entryStateId}" not found` })
  }

  // Transitions reference valid states
  for (const t of ctrl.transitions) {
    if (!stateIds.has(t.from)) {
      issues.push({ path: `transition "${t.id}".from`, message: `Unknown state "${t.from}"` })
    }
    if (!stateIds.has(t.to)) {
      issues.push({ path: `transition "${t.id}".to`, message: `Unknown state "${t.to}"` })
    }
    // Conditions reference valid parameters
    for (const cond of t.conditions) {
      if (!paramIds.has(cond.parameterId)) {
        issues.push({ path: `transition "${t.id}" condition`, message: `Unknown parameter "${cond.parameterId}"` })
      }
      const param = ctrl.parameters.find((p) => p.id === cond.parameterId)
      if (param) {
        // Type-appropriate operator check
        if (param.type === 'trigger' && cond.operator !== 'activated') {
          issues.push({ path: `transition "${t.id}" condition`, message: `Trigger parameter "${param.name}" requires 'activated' operator` })
        }
        if (param.type === 'float' || param.type === 'int') {
          if (cond.operator === 'activated') {
            issues.push({ path: `transition "${t.id}" condition`, message: `Numeric parameter "${param.name}" cannot use 'activated'` })
          }
        }
        if (param.type === 'bool' && !['==', '!='].includes(cond.operator)) {
          issues.push({ path: `transition "${t.id}" condition`, message: `Bool parameter "${param.name}" only supports ==/!=` })
        }
      }
    }
  }

  return issues
}

/* ---- Operators for type ---- */

export function validOperatorsFor(type: AnimatorParameterType): AnimatorConditionOperator[] {
  switch (type) {
    case 'float':
    case 'int':
      return ['>', '>=', '<', '<=', '==', '!=']
    case 'bool':
      return ['==', '!=']
    case 'trigger':
      return ['activated']
  }
}

/* Backward-compat aliases — old name → new canonical name */
export type AnimatorController = AnimatorControllerV2
export { AnimatorControllerV2Schema as AnimatorControllerSchema }
