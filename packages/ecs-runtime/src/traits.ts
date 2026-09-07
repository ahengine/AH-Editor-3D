import { trait } from 'koota'
import type { Entity as KootaEntity } from 'koota'
import type * as THREE from 'three'
import type { PrefabOverrides } from '@ahengine/project-schema'

/**
 * Runtime Koota traits backing the editor's component registry.
 *
 * Trait data stays plain (numbers / strings / nested plain objects) so it can
 * be diffed, serialized and patched deterministically. THREE objects live only
 * in ThreeObject and never leave the runtime.
 */

export const vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z })

export const EntityMeta = trait({
  uuid: '',
  name: 'Entity',
  enabled: true,
})

export interface TransformData {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number }
  scale: { x: number; y: number; z: number }
}

export const Transform = trait((): TransformData => ({
  position: vec3(),
  rotation: vec3(),
  scale: vec3(1, 1, 1),
}))

export type PrimitiveShape = 'box' | 'sphere' | 'plane' | 'cylinder' | 'cone' | 'torus'

export const PrimitiveMesh = trait({
  shape: 'box' as PrimitiveShape,
  size: 1,
  segments: 16,
})

export const ModelRenderer = trait({
  assetId: '',
  visible: true,
  castShadow: true,
  receiveShadow: true,
})

export interface MaterialSlot {
  /** MaterialDefinition asset id, or null for the fallback material. */
  materialId: string | null
}

/** Modeled as a slot list from day one so multi-material models stay schema compatible. */
export const MaterialReference = trait((): { slots: MaterialSlot[] } => ({
  slots: [{ materialId: null }],
}))

export type LightType = 'directional' | 'point' | 'spot' | 'ambient' | 'hemisphere'

export const Light = trait({
  type: 'directional' as LightType,
  color: '#ffffff',
  intensity: 1,
  distance: 0,
  decay: 2,
  angle: 0.5236,
  penumbra: 0,
  castShadow: true,
  shadowBias: -0.0005,
  shadowMapSize: 1024,
})

export const Camera = trait({
  fov: 60,
  near: 0.1,
  far: 500,
})

export const Animator = trait({
  controllerId: '',
  playing: true,
  speed: 1,
  initialState: '',
})

/**
 * Particle emitter — authored reference to a ParticleEffectAsset plus
 * per-instance emission overrides. V1 stores data only; runtime simulation
 * is a later phase.
 */
export const ParticleEmitter = trait({
  effectId: '',
  playing: true,
  rate: 0, // 0 = use the effect's emissionRate
  seed: 0,
})

export const PrefabInstance = trait((): {
  prefabId: string
  instanceId: string
  overrides: PrefabOverrides
} => ({
  prefabId: '',
  instanceId: '',
  overrides: {},
}))

/** Marks entities that were spawned as part of a prefab instance. Runtime bookkeeping only. */
export const InstanceMember = trait({
  prefabId: '',
  instanceId: '',
  sourceUuid: '',
})

/**
 * Runtime-only bridge to the THREE scene graph. Never serialized, never shown
 * in the inspector.
 */
export const ThreeObject = trait((): { object: THREE.Object3D | null } => ({
  object: null,
}))

export type KootaEntityLike = KootaEntity
