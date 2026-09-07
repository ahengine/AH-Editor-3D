import type { SerializedEntity } from '@ahengine/project-schema'
import {
  ChildOf,
  EntityMeta,
  addComponent,
  applyPatch,
  collectSubtree,
  findEntityByUuid,
  getComponentDef,
  instantiatePrefab,
  serializeSubtree,
} from '@ahengine/ecs-runtime'
import { useEditorStore } from './store.js'
import {
  AddEntitiesCommand,
  AddComponentCommand,
  DeleteEntitiesCommand,
  RemoveComponentCommand,
  ReparentCommand,
  SetComponentFieldCommand,
  runCommand,
  commandStack,
} from './commands.js'

/** High-level editor actions shared by toolbar, context menus and shortcuts. */

function world() {
  return useEditorStore.getState().world
}

export function newUuid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export interface CreateEntitySpec {
  name: string
  parentId?: string | null
  components?: Record<string, Record<string, unknown>>
}

export function serializedFromSpec(spec: CreateEntitySpec): SerializedEntity {
  const components: SerializedEntity['components'] = {}
  for (const [id, data] of Object.entries(spec.components ?? {})) {
    const def = getComponentDef(id)
    if (!def) continue
    components[id] = def.serialize(def.deserialize(data) as Record<string, unknown>)
  }
  return {
    id: newUuid(),
    name: spec.name,
    enabled: true,
    parentId: spec.parentId ?? null,
    components,
  }
}

export function createEntity(spec: CreateEntitySpec): void {
  runCommand(new AddEntitiesCommand(`Create ${spec.name}`, [serializedFromSpec(spec)], true))
}

export function createPrimitive(shape: 'box' | 'sphere' | 'plane' | 'cylinder' | 'cone' | 'torus'): void {
  const names: Record<string, string> = {
    box: 'Cube',
    sphere: 'Sphere',
    plane: 'Plane',
    cylinder: 'Cylinder',
    cone: 'Cone',
    torus: 'Torus',
  }
  createEntity({
    name: names[shape] ?? 'Primitive',
    components: {
      'core.transform': {},
      'render.mesh': { shape, size: shape === 'plane' ? 6 : 1 },
      'render.material': {},
    },
  })
}

export function createLight(type: 'directional' | 'point' | 'spot' | 'ambient' | 'hemisphere'): void {
  const names: Record<string, string> = {
    directional: 'Directional Light',
    point: 'Point Light',
    spot: 'Spot Light',
    ambient: 'Ambient Light',
    hemisphere: 'Hemisphere Light',
  }
  const intensity = type === 'ambient' ? 0.6 : type === 'hemisphere' ? 0.8 : type === 'directional' ? 2 : 12
  createEntity({
    name: names[type] ?? 'Light',
    components: {
      'core.transform': type === 'directional' ? { position: [4, 6, 3] } : {},
      'render.light': { type, intensity },
    },
  })
}

export function createCamera(): void {
  createEntity({
    name: 'Camera',
    components: {
      'core.transform': { position: [0, 2, 8] },
      'render.camera': {},
    },
  })
}

export function deleteSelection(): void {
  const state = useEditorStore.getState()
  if (state.selection.length === 0) return
  // Confirmation only when clearly meaningful: a large authored subtree.
  // Everything else deletes instantly and remains undoable.
  const doomed = new Set<string>()
  for (const uuid of state.selection) {
    const entity = findEntityByUuid(state.world, uuid)
    if (!entity) continue
    for (const member of collectSubtree(state.world, entity)) {
      doomed.add(member.get(EntityMeta)?.uuid ?? '')
    }
  }
  if (doomed.size >= 5) {
    const ok = window.confirm(
      `Delete ${doomed.size} entities (the selected subtree${state.selection.length > 1 ? 's' : ''} and all children)?`
    )
    if (!ok) return
  }
  runCommand(new DeleteEntitiesCommand('Delete entities', [...state.selection]))
}

export function duplicateSelection(): void {
  const state = useEditorStore.getState()
  const firstEntity = state.selection.length > 0 ? findEntityByUuid(world(), state.selection[0]) : undefined
  const parentEntity = firstEntity ? firstEntity.targetFor(ChildOf) : undefined
  const parent = parentEntity ? (parentEntity.get(EntityMeta)?.uuid ?? null) : null
  const copies: SerializedEntity[] = []
  const newSelection: string[] = []

  for (const uuid of state.selection) {
    const entity = findEntityByUuid(world(), uuid)
    if (!entity) continue
    const subtree = serializeSubtree(world(), entity)
    // Fresh uuid for every duplicated node; parents inside the subtree remap.
    const uuidMap = new Map(subtree.map((row) => [row.id, newUuid()]))
    newSelection.push(uuidMap.get(subtree[0].id)!)
    copies.push(
      ...subtree.map((row, index) => ({
        ...row,
        id: uuidMap.get(row.id)!,
        parentId:
          index === 0
            ? parent
            : row.parentId && uuidMap.has(row.parentId)
              ? uuidMap.get(row.parentId)!
              : row.parentId,
        components:
          index === 0
            ? {
                ...row.components,
                'core.transform': offsetTransform(row.components['core.transform'] as Record<string, unknown>),
              }
            : row.components,
      }))
    )
  }

  if (copies.length === 0) return
  runCommand(new AddEntitiesCommand('Duplicate entities', copies, false))
  state.select(newSelection)
}

function offsetTransform(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const position = (data?.position as [number, number, number]) ?? [0, 0, 0]
  return { ...data, position: [position[0] + 1, position[1], position[2] + 1] } as Record<string, unknown>
}

export function reparent(uuid: string, newParentUuid: string | null): void {
  const entity = findEntityByUuid(world(), uuid)
  if (!entity) return
  const parentEntity = entity.targetFor(ChildOf)
  const oldParentUuid = parentEntity ? (parentEntity.get(EntityMeta)?.uuid ?? null) : null
  if (oldParentUuid === newParentUuid) return
  runCommand(new ReparentCommand('Reparent', uuid, oldParentUuid, newParentUuid))
}

export function renameEntity(uuid: string, name: string): void {
  const entity = findEntityByUuid(world(), uuid)
  if (!entity) return
  const before = entity.get(EntityMeta)?.name ?? 'Entity'
  if (before === name) return
  const apply = (value: string) => {
    const target = findEntityByUuid(world(), uuid)
    target?.set(EntityMeta, { name: value })
  }
  runCommand({
    label: 'Rename',
    execute: () => apply(name),
    undo: () => apply(before),
  })
}

export function setEnabled(uuid: string, enabled: boolean): void {
  const entity = findEntityByUuid(world(), uuid)
  if (!entity) return
  entity.set(EntityMeta, { enabled })
  useEditorStore.getState().bumpWorld()
}

export function addComponentToSelection(componentId: string): void {
  const { selection } = useEditorStore.getState()
  for (const uuid of selection) {
    runCommand(new AddComponentCommand(`Add ${componentId}`, uuid, componentId))
  }
}

export function removeComponentFrom(uuid: string, componentId: string): void {
  runCommand(new RemoveComponentCommand(`Remove ${componentId}`, uuid, componentId))
}

/** Inspector field edit — captures before/after for undo. */
export function editComponentField(
  uuid: string,
  componentId: string,
  patch: Record<string, unknown>
): void {
  const entity = findEntityByUuid(world(), uuid)
  if (!entity) return
  const def = getComponentDef(componentId)
  if (!def || !entity.has(def.trait)) return
  const current = def.serialize(entity.get(def.trait) as Record<string, unknown>)
  const before: Record<string, unknown> = {}
  const after: Record<string, unknown> = {}
  for (const key of Object.keys(patch)) {
    before[key] = current[key]
    after[key] = patch[key]
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return
  runCommand(new SetComponentFieldCommand(`Edit ${componentId}`, uuid, componentId, before, after))
}

/** Live (undo-merged) transform edit used while dragging inspector steppers. */
export function setComponentFieldLive(
  uuid: string,
  componentId: string,
  patch: Record<string, unknown>
): void {
  const entity = findEntityByUuid(world(), uuid)
  if (!entity) return
  applyPatch(entity, componentId, patch)
}

export function undo(): void {
  const command = commandStack.undo()
  if (command) useEditorStore.getState().bumpWorld()
}

export function redo(): void {
  const command = commandStack.redo()
  if (command) useEditorStore.getState().bumpWorld()
}

/** Spawns an instance of a prefab at the origin and selects it. */
export function instantiatePrefabAction(prefabId: string): void {
  const store = useEditorStore.getState()
  const prefab = store.prefabs.find((p) => p.id === prefabId)
  if (!prefab) return
  const root = instantiatePrefab(store.world, prefab, { name: prefab.name })
  store.bumpWorld()
  const uuid = root.get(EntityMeta)?.uuid
  if (uuid) store.select([uuid])
}

export { addComponent }
