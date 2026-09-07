import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createWorld } from 'koota'
import {
  Animator as AnimatorTrait,
  AnimatorRuntime,
  EntityMeta,
  ModelRenderer,
  ThreeObject,
  Transform,
  deserializeScene,
} from '@ahengine/ecs-runtime'
import type { AnimatorController } from '@ahengine/project-schema'

/* Animator runtime — state machine + mixer advancing (no renderer needed). */

function controllerFixture(): AnimatorController {
  return {
    id: 'ctrl',
    name: 'Test',
    modelAssetId: 'asset-1',
    parameters: [],
    states: [
      { id: 'spin', name: 'Spin', clipId: 'Spin', loop: true, speed: 1 },
      { id: 'hold', name: 'Hold', clipId: null, loop: false, speed: 1 },
    ],
    transitions: [
      { id: 'tr-1', from: 'spin', to: 'hold', duration: 0.1, exitTime: 0, conditions: [] },
    ],
    entryStateId: 'spin',
  }
}

function clipFixture(): THREE.AnimationClip {
  const times = [0, 1]
  const positionTrack = new THREE.VectorKeyframeTrack('Box.position', times, [0, 0, 0, 0, 2, 0])
  return new THREE.AnimationClip('Spin', 1, [positionTrack])
}

function setup() {
  const world = createWorld()
  const { entitiesById } = deserializeScene(world, [
    {
      id: 'box',
      name: 'Box',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        'render.model': { assetId: 'asset-1', visible: true, castShadow: true, receiveShadow: true },
        'animation.animator': { controllerId: 'ctrl', playing: true, speed: 1, initialState: 'spin' },
      },
    },
  ])
  const entity = entitiesById.get('box')!
  const object = new THREE.Group()
  object.name = 'entity'
  const mesh = new THREE.Mesh()
  mesh.name = 'Box'
  object.add(mesh)
  entity.add([ThreeObject, { object }])

  const controllers = new Map([['ctrl', controllerFixture()] as const])
  const clips = new Map([['asset-1', [clipFixture()]] as const])
  const runtime = new AnimatorRuntime(() => controllers, (id) => clips.get(id) ?? [])
  return { world, entity, object, mesh, runtime }
}

describe('animator runtime', () => {
  it('creates a mixer and advances the clip over time', () => {
    const { world, entity, mesh, runtime } = setup()
    const yStart = mesh.position.y
    runtime.update(world, 0)
    runtime.update(world, 0.5) // half-way through the 1s clip → y ≈ 1
    expect(mesh.position.y).toBeGreaterThan(0.8)
    expect(mesh.position.y).toBeLessThan(1.2)
    expect(mesh.position.y).not.toBe(yStart)
    runtime.update(world, 0.6) // past clip end, looping → wraps near 0.1
    expect(mesh.position.y).toBeLessThan(0.5)
  })

  it('follows transitions to the next state', () => {
    const { world, entity, mesh, runtime } = setup()
    runtime.update(world, 0)
    // spin → hold has no conditions and exitTime 0: transitions immediately
    // on the next evaluation tick after entering spin.
    runtime.update(world, 0.05)
    const state = runtime.getStateFor(entity)
    expect(state?.currentStateId).toBe('hold')
    void mesh
  })

  it('respects playing=false on the trait', () => {
    const { world, entity, mesh, runtime } = setup()
    entity.set(AnimatorTrait, { playing: false })
    runtime.update(world, 0.5)
    expect(mesh.position.y).toBe(0) // mixer never created for paused entities
    void EntityMeta
    void Transform
    void ModelRenderer
  })

  it('stop disposes the mixer state', () => {
    const { world, entity, runtime } = setup()
    runtime.update(world, 0)
    expect(runtime.getStateFor(entity)).toBeDefined()
    runtime.stop(entity)
    expect(runtime.getStateFor(entity)).toBeUndefined()
  })
})
