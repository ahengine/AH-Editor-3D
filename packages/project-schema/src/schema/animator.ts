// Legacy animator schema — re-exports from animator-v2 for backward compatibility.
// The authoritative schema lives in animator-v2.ts.
export type {
  AnimatorParameterType,
  AnimatorParameter,
  AnimatorState,
  AnimatorConditionOperator,
  AnimatorCondition,
  AnimatorTransition,
  AnimatorControllerV2 as AnimatorController,
} from './animator-v2.js'
export {
  AnimatorParameterSchema as LegacyAnimatorParameterSchema,
  AnimatorStateSchema as LegacyAnimatorStateSchema,
  AnimatorTransitionSchema as LegacyAnimatorTransitionSchema,
  AnimatorControllerV2Schema as LegacyAnimatorControllerSchema,
} from './animator-v2.js'
