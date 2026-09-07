import { z } from 'zod'

/** Animator domain — state-machine controllers driving animation clips. */

export type AnimatorParameterType = 'float' | 'int' | 'bool' | 'trigger'

export interface AnimatorParameter {
  id: string
  name: string
  type: AnimatorParameterType
  default: number | boolean
}

export interface AnimatorState {
  id: string
  name: string
  /** Animation clip name inside the source model asset, or null for the default (empty) state. */
  clip: string | null
  loop: boolean
  speed: number
}

export type AnimatorConditionOperator = '>' | '<' | '==' | '!=' | 'trigger'

export interface AnimatorCondition {
  parameterId: string
  operator: AnimatorConditionOperator
  value?: number | boolean
}

export interface AnimatorTransition {
  id: string
  from: string
  to: string
  /** Cross fade duration in seconds. */
  duration: number
  /** Normalized exit time (0–1) when conditions are already satisfied. */
  exitTime: number
  conditions: AnimatorCondition[]
}

export interface AnimatorController {
  id: string
  name: string
  /** Model asset that provides the clips, if any. */
  modelAssetId: string | null
  parameters: AnimatorParameter[]
  states: AnimatorState[]
  transitions: AnimatorTransition[]
  entryStateId: string
  /** Present on standalone exports; injected (1) when embedded in a project. */
  schemaVersion?: number
}

export const AnimatorParameterSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['float', 'int', 'bool', 'trigger']),
  default: z.union([z.number(), z.boolean()]),
})

export const AnimatorStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  clip: z.string().nullable(),
  loop: z.boolean(),
  speed: z.number(),
})

export const AnimatorTransitionSchema = z.object({
  id: z.string(),
  from: z.string(),
  to: z.string(),
  duration: z.number().min(0),
  exitTime: z.number().min(0).max(1),
  conditions: z.array(
    z.object({
      parameterId: z.string(),
      operator: z.enum(['>', '<', '==', '!=', 'trigger']),
      value: z.union([z.number(), z.boolean()]).optional(),
    })
  ),
})

export const AnimatorControllerSchema = z.object({
  id: z.string(),
  name: z.string(),
  modelAssetId: z.string().nullable(),
  parameters: z.array(AnimatorParameterSchema),
  states: z.array(AnimatorStateSchema),
  transitions: z.array(AnimatorTransitionSchema),
  entryStateId: z.string(),
  // v1 backfill: controllers authored before this field existed parse as v1.
  schemaVersion: z.literal(1).default(1),
})
