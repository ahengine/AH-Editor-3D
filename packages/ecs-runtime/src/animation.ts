import * as THREE from 'three'
import type { Entity, World } from 'koota'
import type { AnimatorController } from '@ahengine/project-schema'
import { Animator, ModelRenderer, ThreeObject } from './traits.js'

/**
 * Animator runtime — a compact Unity-style state machine on top of
 * THREE.AnimationMixer. Mixers and actions are runtime-only and rebuilt from
 * data; they never appear in exported JSON.
 */

export interface AnimatorRuntimeState {
  mixer: THREE.AnimationMixer
  actions: Map<string, THREE.AnimationAction>
  currentAction: THREE.AnimationAction | null
  currentStateId: string | null
  parameters: Map<string, number | boolean>
  time: number
}

/** entity uuid → runtime state */
export class AnimatorRuntime {
  private states = new Map<string, AnimatorRuntimeState>()

  constructor(
    private controllers: () => Map<string, AnimatorController>,
    private clipsFor: (modelAssetId: string) => THREE.AnimationClip[]
  ) {}

  getStateFor(entity: Entity): AnimatorRuntimeState | undefined {
    const uuid = entity.get(ThreeObject)?.object?.uuid
    return uuid ? this.states.get(uuid) : undefined
  }

  /** Advances every animator entity. Call once per frame with delta seconds. */
  update(world: World, dt: number): void {
    for (const entity of world.query(Animator, ThreeObject)) {
      const animator = entity.get(Animator)!
      const object = entity.get(ThreeObject)!.object
      if (!object || !animator.playing || !animator.controllerId) continue
      const controller = this.controllers().get(animator.controllerId)
      if (!controller) continue

      const state = this.ensureState(entity, object, controller, animator.initialState)
      if (!state) continue
      state.mixer.timeScale = animator.speed
      this.evaluateTransitions(controller, state)
      state.time += dt * animator.speed
      state.mixer.update(dt)
    }
  }

  private ensureState(
    entity: Entity,
    object: THREE.Object3D,
    controller: AnimatorController,
    initialState: string
  ): AnimatorRuntimeState | undefined {
    let state = this.states.get(object.uuid)
    if (!state) {
      const model = entity.get(ModelRenderer)
      const clips = model?.assetId ? this.clipsFor(model.assetId) : []
      const mixer = new THREE.AnimationMixer(object)
      const actions = new Map<string, THREE.AnimationAction>()
      for (const clip of clips) {
        const action = mixer.clipAction(clip)
        actions.set(clip.name, action)
      }
      const parameters = new Map<string, number | boolean>()
      for (const param of controller.parameters) parameters.set(param.id, param.defaultValue)
      const stateId =
        controller.states.find((s) => s.id === initialState)?.id ??
        controller.states.find((s) => s.id === controller.entryStateId)?.id ??
        controller.states[0]?.id ??
        null
      state = { mixer, actions, currentAction: null, currentStateId: null, parameters, time: 0 }
      this.states.set(object.uuid, state)
      this.enterState(controller, state, stateId)
    }
    return state
  }

  private enterState(controller: AnimatorController, state: AnimatorRuntimeState, stateId: string | null): void {
    if (stateId === null || stateId === state.currentStateId) return
    const next = controller.states.find((s) => s.id === stateId)
    if (!next) return
    const action = next.clipId ? state.actions.get(next.clipId) : null
    if (action) {
      action.reset()
      action.setLoop(next.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
      action.clampWhenFinished = !next.loop
      action.timeScale = next.speed
      if (state.currentAction) state.currentAction.crossFadeTo(action, 0.15, false)
      action.play()
      state.currentAction = action
    }
    state.currentStateId = stateId
  }

  private evaluateTransitions(controller: AnimatorController, state: AnimatorRuntimeState): void {
    for (const transition of controller.transitions) {
      if (transition.from !== state.currentStateId) continue
      if (!this.conditionsMet(transition.conditions, state)) continue
      const exitTimeOk =
        transition.exitTime <= 0 ||
        !state.currentAction ||
        state.currentAction.time >= transition.exitTime * (state.currentAction.getClip().duration || 1)
      if (!exitTimeOk) continue
      this.enterState(controller, state, transition.to)
      return
    }
  }

  private conditionsMet(
    conditions: { parameterId: string; operator: string; value?: number | boolean }[],
    state: AnimatorRuntimeState
  ): boolean {
    return conditions.every((condition) => {
      const value = state.parameters.get(condition.parameterId)
      if (value === undefined) return false
      switch (condition.operator) {
        case 'trigger':
          return value === true
        case '>':
          return Number(value) > Number(condition.value ?? 0)
        case '<':
          return Number(value) < Number(condition.value ?? 0)
        case '==':
          return value === condition.value
        case '!=':
          return value !== condition.value
        default:
          return false
      }
    })
  }

  /* ---------------- editor preview controls ---------------- */

  play(entity: Entity, controller: AnimatorController, clipName: string, loop = true, speed = 1): void {
    const object = entity.get(ThreeObject)?.object
    if (!object) return
    const clips = this.clipsFor(entity.get(ModelRenderer)?.assetId ?? '')
    const clip = clips.find((c) => c.name === clipName) ?? clips[0]
    if (!clip) return
    let state = this.states.get(object.uuid)
    if (!state) {
      state = {
        mixer: new THREE.AnimationMixer(object),
        actions: new Map<string, THREE.AnimationAction>(),
        currentAction: null,
        currentStateId: null,
        parameters: new Map(controller.parameters.map((p) => [p.id, p.defaultValue] as const)),
        time: 0,
      }
      this.states.set(object.uuid, state)
    }
    const action = state.mixer.clipAction(clip)
    action.reset()
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity)
    action.clampWhenFinished = !loop
    action.timeScale = speed
    action.play()
    state.currentAction = action
    void controller
  }

  pause(entity: Entity): void {
    const state = this.getStateFor(entity)
    state?.mixer.timeScale === 0
    if (state) state.mixer.timeScale = 0
  }

  resume(entity: Entity, speed = 1): void {
    const state = this.getStateFor(entity)
    if (state) state.mixer.timeScale = speed
  }

  stop(entity: Entity): void {
    const object = entity.get(ThreeObject)?.object
    if (!object) return
    const state = this.states.get(object.uuid)
    state?.mixer.stopAllAction()
    this.states.delete(object.uuid)
  }

  scrub(entity: Entity, clipName: string, time: number): void {
    const state = this.getStateFor(entity)
    if (!state) return
    const action = state.currentAction
    if (!action) return
    void clipName
    action.time = Math.max(0, Math.min(time, action.getClip().duration))
    state.mixer.update(0)
  }

  disposeObject(object: THREE.Object3D): void {
    const state = this.states.get(object.uuid)
    if (state) {
      state.mixer.stopAllAction()
      this.states.delete(object.uuid)
    }
  }
}
