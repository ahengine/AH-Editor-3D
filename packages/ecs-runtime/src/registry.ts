import type { Trait, Entity, World } from 'koota'
import { z } from 'zod'
import {
  Animator,
  Camera,
  EntityMeta,
  Light,
  MaterialReference,
  ModelRenderer,
  ParticleEmitter,
  PrimitiveMesh,
  Transform,
} from './traits.js'
import { ChildOf, getParent } from './relations.js'
import { ThreeObject } from './traits.js'
import type { PrimitiveShape, LightType } from './traits.js'

/**
 * Editor Component Registry.
 *
 * Every component exposed to the editor gets a stable string id. Serialized
 * files reference these ids — never JS class names, never Koota trait ids,
 * never Koota entity ids.
 */

export type FieldType =
  | 'number'
  | 'integer'
  | 'boolean'
  | 'string'
  | 'vec3'
  | 'color'
  | 'enum'
  | 'asset'
  | 'entity'
  | 'slider'

export interface FieldDef {
  key: string
  label: string
  type: FieldType
  min?: number
  max?: number
  step?: number
  /** enum options */
  options?: { value: string; label: string }[]
  /** asset field: which asset types are assignable */
  assetType?: 'model' | 'texture' | 'material' | 'animation-controller' | 'environment' | 'animation-clip' | 'particle-effect'
  /** asset field: allows clearing (nullable references) */
  nullable?: boolean
  /** hide from inspector (still serialized) */
  hidden?: boolean
  /** only show for these light types (render.light component) */
  showForTypes?: string[]
}

/**
 * Trait classification — the three-layer contract in one field:
 *  - 'authored': serializable authored data
 *  - 'runtime':  runtime-only references (THREE/GPU) — never serialized
 *  - 'editor':   editor-only state — never serialized, never exported
 */
export type TraitKind = 'authored' | 'runtime' | 'editor'

export interface ComponentDefinition<T = unknown> {
  /** Stable serialized id, e.g. `core.transform` */
  id: string
  name: string
  /** Spec-facing alias of `name`. */
  displayName: string
  category: string
  trait: Trait
  kind: TraitKind
  /** Participates in runtime loading. */
  runtime: boolean
  /** Included in exported JSON. Runtime-only traits set this to false. */
  serializable: boolean
  /** Shown in the Add Component dialog. */
  addable: boolean
  /** Shown in the inspector when present on an entity. */
  editorVisible: boolean
  fields: FieldDef[]
  /** Spec-facing alias of `fields`. */
  inspectorMetadata: FieldDef[]
  schema: z.ZodTypeAny
  defaults: () => T
  /** Spec-facing alias of `defaults`. */
  defaultValue: () => T
  /** trait record → plain JSON data */
  serialize: (record: Record<string, unknown>) => Record<string, unknown>
  /** plain JSON data → full trait value (defaults merged) */
  deserialize: (data: unknown) => T
}

/** Helper applying the spec-facing aliases without repeating them per definition. */
function define<T>(def: Omit<ComponentDefinition<T>, 'displayName' | 'kind' | 'editorVisible' | 'inspectorMetadata' | 'defaultValue'> & Partial<Pick<ComponentDefinition<T>, 'kind' | 'editorVisible'>>): ComponentDefinition<T> {
  return {
    ...def,
    displayName: def.name,
    kind: def.kind ?? 'authored',
    editorVisible: def.editorVisible ?? true,
    get inspectorMetadata() {
      return def.fields
    },
    get defaultValue() {
      return def.defaults
    },
  } as ComponentDefinition<T>
}

/* ------------------------------------------------------------------ */

const hexColor = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
const vec3Obj = z.object({ x: z.number(), y: z.number(), z: z.number() })
const vec3Arr = z.tuple([z.number(), z.number(), z.number()])

function toVec3Array(v: unknown): [number, number, number] {
  if (Array.isArray(v)) return [Number(v[0]) || 0, Number(v[1]) || 0, Number(v[2]) || 0]
  const o = (v ?? {}) as { x?: number; y?: number; z?: number }
  return [Number(o.x) || 0, Number(o.y) || 0, Number(o.z) || 0]
}

function fromVec3Array(arr: [number, number, number]) {
  return { x: arr[0], y: arr[1], z: arr[2] }
}

function pick(record: Record<string, unknown>, keys: string[]) {
  const out: Record<string, unknown> = {}
  for (const key of keys) if (key in record) out[key] = record[key]
  return out
}

/* ------------------------------------------------------------------ */
/* Definitions                                                         */
/* ------------------------------------------------------------------ */

const transform = define({
  id: 'core.transform',
  name: 'Transform',
  category: 'Core',
  trait: Transform,
  runtime: true,
  serializable: true,
  addable: true,
  fields: [
    { key: 'position', label: 'Position', type: 'vec3', step: 0.1 },
    { key: 'rotation', label: 'Rotation', type: 'vec3', step: 1 },
    { key: 'scale', label: 'Scale', type: 'vec3', step: 0.1 },
  ],
  schema: z.object({
    position: vec3Arr,
    rotation: vec3Arr,
    scale: vec3Arr,
  }),
  defaults: () => ({
    position: { x: 0, y: 0, z: 0 },
    rotation: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1 },
  }),
  serialize: (record) => ({
    position: (() => {
      const p = record.position as { x: number; y: number; z: number }
      return [p.x, p.y, p.z]
    })(),
    rotation: (() => {
      const r = record.rotation as { x: number; y: number; z: number }
      return [r.x, r.y, r.z]
    })(),
    scale: (() => {
      const s = record.scale as { x: number; y: number; z: number }
      return [s.x, s.y, s.z]
    })(),
  }),
  deserialize: (data) => {
    const d = (data ?? {}) as Record<string, unknown>
    return {
      position: fromVec3Array(toVec3Array(d.position)),
      rotation: fromVec3Array(toVec3Array(d.rotation)),
      scale: fromVec3Array(toVec3Array(d.scale)),
    }
  },
})

const modelRenderer = define({
  id: 'render.model',
  name: 'Model Renderer',
  category: 'Rendering',
  trait: ModelRenderer,
  runtime: true,
  serializable: true,
  addable: true,
  fields: [
    { key: 'assetId', label: 'Model Asset', type: 'asset', assetType: 'model' },
    { key: 'visible', label: 'Visible', type: 'boolean' },
    { key: 'castShadow', label: 'Cast Shadow', type: 'boolean' },
    { key: 'receiveShadow', label: 'Receive Shadow', type: 'boolean' },
  ],
  schema: z.object({
    assetId: z.string().optional(),
    visible: z.boolean().optional(),
    castShadow: z.boolean().optional(),
    receiveShadow: z.boolean().optional(),
  }),
  defaults: () => ({ assetId: '', visible: true, castShadow: true, receiveShadow: true }),
  serialize: (record) => pick(record, ['assetId', 'visible', 'castShadow', 'receiveShadow']),
  deserialize: (data) => ({
    assetId: String((data as Record<string, unknown>)?.assetId ?? ''),
    visible: (data as Record<string, unknown>)?.visible !== false,
    castShadow: (data as Record<string, unknown>)?.castShadow !== false,
    receiveShadow: (data as Record<string, unknown>)?.receiveShadow !== false,
  }),
})

const primitiveMesh = define({
  id: 'render.mesh',
  name: 'Primitive Mesh',
  category: 'Rendering',
  trait: PrimitiveMesh,
  runtime: true,
  serializable: true,
  addable: true,
  fields: [
    {
      key: 'shape',
      label: 'Shape',
      type: 'enum',
      options: [
        { value: 'box', label: 'Box' },
        { value: 'sphere', label: 'Sphere' },
        { value: 'plane', label: 'Plane' },
        { value: 'cylinder', label: 'Cylinder' },
        { value: 'cone', label: 'Cone' },
        { value: 'torus', label: 'Torus' },
      ],
    },
    { key: 'size', label: 'Size', type: 'number', min: 0.01, step: 0.1 },
    { key: 'segments', label: 'Segments', type: 'integer', min: 3, max: 64 },
    { key: 'visible', label: 'Visible', type: 'boolean' },
  ],
  schema: z.object({
    shape: z.enum(['box', 'sphere', 'plane', 'cylinder', 'cone', 'torus']).optional(),
    size: z.number().positive().optional(),
    segments: z.number().int().min(1).max(64).optional(),
    visible: z.boolean().optional(),
  }),
  defaults: () => ({ shape: 'box' as PrimitiveShape, size: 1, segments: 16, visible: true }),
  serialize: (record) => pick(record, ['shape', 'size', 'segments', 'visible']),
  deserialize: (data) => {
    const d = (data ?? {}) as Record<string, unknown>
    return {
      shape: (String(d.shape ?? 'box') as PrimitiveShape),
      size: Number(d.size ?? 1) || 1,
      segments: Math.round(Number(d.segments ?? 16)) || 16,
      visible: d.visible !== false,
    }
  },
})

const materialReference = define({
  id: 'render.material',
  name: 'Material Reference',
  category: 'Rendering',
  trait: MaterialReference,
  runtime: true,
  serializable: true,
  addable: true,
  fields: [
    // Slot 0 is exposed directly; the data model stays a slot list.
    { key: 'slot0', label: 'Material', type: 'asset', assetType: 'material', nullable: true },
  ],
  schema: z.object({
    slots: z.array(z.object({ materialId: z.string().nullable() })),
  }),
  defaults: () => ({ slots: [{ materialId: null }] }),
  serialize: (record) => ({
    slots: (record.slots as { materialId: string | null }[]) ?? [{ materialId: null }],
  }),
  deserialize: (data) => {
    const d = data as { slots?: { materialId: string | null }[] } | null
    const slots = d?.slots && d.slots.length > 0 ? d.slots : [{ materialId: null as string | null }]
    return { slots: slots.map((s) => ({ materialId: s.materialId ?? null })) }
  },
})

const light: ComponentDefinition = define({
  id: 'render.light',
  name: 'Light',
  category: 'Lighting',
  trait: Light,
  runtime: true,
  serializable: true,
  addable: true,
  fields: [
    {
      key: 'type',
      label: 'Type',
      type: 'enum',
      options: [
        { value: 'directional', label: 'Directional' },
        { value: 'point', label: 'Point' },
        { value: 'spot', label: 'Spot' },
        { value: 'ambient', label: 'Ambient' },
        { value: 'hemisphere', label: 'Hemisphere' },
      ] satisfies { value: string; label: string }[],
    },
    { key: 'color', label: 'Color', type: 'color' },
    { key: 'intensity', label: 'Intensity', type: 'slider', min: 0, max: 20, step: 0.05 },
    { key: 'distance', label: 'Distance', type: 'number', min: 0, showForTypes: ['point', 'spot'] },
    { key: 'decay', label: 'Decay', type: 'number', min: 0, step: 0.1, showForTypes: ['point', 'spot'] },
    { key: 'angle', label: 'Angle', type: 'slider', min: 0.05, max: 1.55, step: 0.01, showForTypes: ['spot'] },
    { key: 'penumbra', label: 'Penumbra', type: 'slider', min: 0, max: 1, step: 0.01, showForTypes: ['spot'] },
    { key: 'castShadow', label: 'Cast Shadow', type: 'boolean', showForTypes: ['directional', 'point', 'spot'] },
    { key: 'shadowBias', label: 'Shadow Bias', type: 'number', step: 0.0001, showForTypes: ['directional', 'point', 'spot'] },
    { key: 'shadowMapSize', label: 'Shadow Map Size', type: 'integer', min: 64, max: 4096, showForTypes: ['directional', 'point', 'spot'] },
  ],
  schema: z.object({
    type: z.enum(['directional', 'point', 'spot', 'ambient', 'hemisphere']).optional(),
    color: hexColor.optional(),
    intensity: z.number().optional(),
    distance: z.number().optional(),
    decay: z.number().optional(),
    angle: z.number().optional(),
    penumbra: z.number().optional(),
    castShadow: z.boolean().optional(),
    shadowBias: z.number().optional(),
    shadowMapSize: z.number().int().optional(),
  }),
  defaults: () => ({
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
  }),
  serialize: (record) =>
    pick(record, [
      'type',
      'color',
      'intensity',
      'distance',
      'decay',
      'angle',
      'penumbra',
      'castShadow',
      'shadowBias',
      'shadowMapSize',
    ]),
  deserialize: (data) => {
    const base = light.defaults() as Record<string, unknown>
    return { ...base, ...((data ?? {}) as Record<string, unknown>) } as ReturnType<typeof light.defaults>
  },
})

const camera = define({
  id: 'render.camera',
  name: 'Camera',
  category: 'Camera',
  trait: Camera,
  runtime: true,
  serializable: true,
  addable: true,
  fields: [
    { key: 'fov', label: 'FOV', type: 'slider', min: 10, max: 120, step: 1 },
    { key: 'near', label: 'Near', type: 'number', min: 0.01, step: 0.1 },
    { key: 'far', label: 'Far', type: 'number', min: 1, step: 10 },
  ],
  schema: z.object({ fov: z.number().optional(), near: z.number().optional(), far: z.number().optional() }),
  defaults: () => ({ fov: 60, near: 0.1, far: 500 }),
  serialize: (record) => pick(record, ['fov', 'near', 'far']),
  deserialize: (data) => {
    const d = (data ?? {}) as Record<string, unknown>
    return {
      fov: Number(d.fov ?? 60) || 60,
      near: Number(d.near ?? 0.1) || 0.1,
      far: Number(d.far ?? 500) || 500,
    }
  },
})

const animator = define({
  id: 'animation.animator',
  name: 'Animator',
  category: 'Animation',
  trait: Animator,
  runtime: true,
  serializable: true,
  addable: true,
  fields: [
    { key: 'controllerId', label: 'Controller', type: 'asset', assetType: 'animation-controller', nullable: true },
    { key: 'playing', label: 'Playing', type: 'boolean' },
    { key: 'speed', label: 'Speed', type: 'number', step: 0.05 },
    { key: 'initialState', label: 'Initial State', type: 'string' },
  ],
  schema: z.object({
    controllerId: z.string().optional(),
    playing: z.boolean().optional(),
    speed: z.number().optional(),
    initialState: z.string().optional(),
  }),
  defaults: () => ({ controllerId: '', playing: true, speed: 1, initialState: '' }),
  serialize: (record) => pick(record, ['controllerId', 'playing', 'speed', 'initialState']),
  deserialize: (data) => {
    const d = (data ?? {}) as Record<string, unknown>
    return {
      controllerId: String(d.controllerId ?? ''),
      playing: d.playing !== false,
      speed: Number(d.speed ?? 1) || 1,
      initialState: String(d.initialState ?? ''),
    }
  },
})

/** Not registered as an addable component — hierarchy is edited through the tree. */
export const hierarchyMarker = define({
  id: 'core.hierarchy',
  name: 'Hierarchy',
  category: 'Core',
  trait: ChildOf as unknown as Trait,
  runtime: true,
  serializable: false,
  addable: false,
  fields: [],
  schema: z.never(),
  defaults: () => ({}),
  serialize: () => ({}),
  deserialize: () => ({}),
})

/* Non-serializable bookkeeping components.
 *
 * - core.meta: authored identity, serialized at the ENTITY level (id/name/
 *   enabled), never as a component entry.
 * - runtime.threeObject: runtime-only THREE.Object3D reference (kind=runtime).
 */
export const registryHidden: ComponentDefinition[] = [
  define({
    id: 'core.meta',
    name: 'Entity Meta',
    category: 'Core',
    trait: EntityMeta,
    runtime: true,
    serializable: false,
    addable: false,
    editorVisible: false,
    fields: [],
    schema: z.never(),
    defaults: () => ({ uuid: '', name: 'Entity', enabled: true }),
    serialize: () => ({}),
    deserialize: () => ({ uuid: '', name: 'Entity', enabled: true }),
  }),
  define({
    id: 'runtime.threeObject',
    name: 'Three Object Ref',
    category: 'Runtime',
    trait: ThreeObject,
    kind: 'runtime' as const,
    runtime: true,
    serializable: false,
    addable: false,
    editorVisible: false,
    fields: [],
    schema: z.never(),
    defaults: () => ({ object: null }),
    serialize: () => ({}),
    deserialize: () => ({ object: null }),
  }),
]

const particleEmitter = define({
  id: 'particle.emitter',
  name: 'Particle Emitter',
  category: 'Particles',
  trait: ParticleEmitter,
  kind: 'authored' as const,
  runtime: true,
  serializable: true,
  addable: true,
  fields: [
    { key: 'effectId', label: 'Effect', type: 'asset', assetType: 'particle-effect', nullable: true },
    { key: 'playing', label: 'Playing', type: 'boolean' },
    { key: 'rate', label: 'Rate Override', type: 'number', min: 0 },
    { key: 'seed', label: 'Seed', type: 'integer', min: 0 },
  ],
  schema: z.object({
    effectId: z.string().optional(),
    playing: z.boolean().optional(),
    rate: z.number().min(0).optional(),
    seed: z.number().int().min(0).optional(),
  }),
  defaults: () => ({ effectId: '', playing: true, rate: 0, seed: 0 }),
  serialize: (record) => pick(record, ['effectId', 'playing', 'rate', 'seed']),
  deserialize: (data) => {
    const d = (data ?? {}) as Record<string, unknown>
    return {
      effectId: String(d.effectId ?? ''),
      playing: d.playing !== false,
      rate: Number(d.rate ?? 0) || 0,
      seed: Math.round(Number(d.seed ?? 0)) || 0,
    }
  },
})

export const componentRegistry: readonly ComponentDefinition[] = [
  transform,
  modelRenderer,
  primitiveMesh,
  materialReference,
  light,
  camera,
  animator,
  particleEmitter,
]

const byId = new Map<string, ComponentDefinition>()
for (const def of componentRegistry) byId.set(def.id, def)
byId.set(hierarchyMarker.id, hierarchyMarker)
for (const def of registryHidden) byId.set(def.id, def)

export function getComponentDef(id: string): ComponentDefinition | undefined {
  return byId.get(id)
}

export function getDefForTrait(trait: Trait): ComponentDefinition | undefined {
  for (const def of byId.values()) if (def.trait === trait) return def
  return undefined
}

/** Serializable component defs in registration order. */
export function serializableDefs(): ComponentDefinition[] {
  return componentRegistry.filter((d) => d.serializable)
}

export function addableDefs(): ComponentDefinition[] {
  return componentRegistry.filter((d) => d.addable)
}

/* ------------------------------------------------------------------ */
/* Entity helpers built on the registry                                */
/* ------------------------------------------------------------------ */

export function addComponent(
  entity: Entity,
  defId: string,
  data?: Record<string, unknown>
): void {
  const def = getComponentDef(defId)
  if (!def) throw new Error(`Unknown component id "${defId}"`)
  const value = data === undefined ? def.defaults() : def.deserialize(data)
  entity.add([def.trait, value as never])
}

export function removeComponent(entity: Entity, defId: string): void {
  const def = getComponentDef(defId)
  if (!def) return
  entity.remove(def.trait)
}

export function setComponentValue(
  entity: Entity,
  defId: string,
  data: Record<string, unknown>
): void {
  const def = getComponentDef(defId)
  if (!def) throw new Error(`Unknown component id "${defId}"`)
  const value = def.deserialize({ ...(entity.get(def.trait) as Record<string, unknown>), ...data })
  entity.set(def.trait, value as never)
}

export function entityUuid(entity: Entity): string {
  return entity.get(EntityMeta)?.uuid ?? ''
}

export function findEntityByUuid(world: World, uuid: string): Entity | undefined {
  for (const entity of world.query(EntityMeta)) {
    if (entity.get(EntityMeta)?.uuid === uuid) return entity
  }
  return undefined
}

/**
 * Per-component validator matching @ahengine/project-schema's
 * ComponentValidator contract (engine-free integrity checking).
 */
export function validateComponentEntry(
  componentId: string,
  data: unknown,
  path: string
): { path: string; message: string }[] {
  const def = getComponentDef(componentId)
  if (!def) {
    return [{ path, message: `Unknown component id "${componentId}"` }]
  }
  if (!def.serializable) return []
  const result = def.schema.safeParse(data)
  if (result.success) return []
  return result.error.issues.slice(0, 3).map((issue) => ({
    path: `${path}${issue.path.length ? `.${issue.path.map(String).join('.')}` : ''}`,
    message: issue.message,
  }))
}

/**
 * Validates serialized component data against registry schemas.
 * Returns human-readable issues (empty array when valid).
 */
export function validateSceneComponents(
  entities: { id: string; name: string; components: Record<string, unknown> }[]
): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = []
  for (const entity of entities) {
    for (const [componentId, data] of Object.entries(entity.components ?? {})) {
      const def = getComponentDef(componentId)
      if (!def) {
        issues.push({
          path: `${entity.name} → ${componentId}`,
          message: `Unknown component id "${componentId}"`,
        })
        continue
      }
      if (!def.serializable) continue
      const result = def.schema.safeParse(data)
      if (!result.success) {
        for (const issue of result.error.issues.slice(0, 3)) {
          issues.push({
            path: `${entity.name} → ${componentId}${issue.path.length ? `.${issue.path.map(String).join('.')}` : ''}`,
            message: issue.message,
          })
        }
      }
    }
  }
  return issues
}
