import type { Entity, World } from 'koota'
import type { MaterialDefinition, SerializedEntity } from '@ahengine/project-schema'
import {
  EntityMeta,
  PrimitiveMesh,
  ThreeObject,
  deserializeEntity,
  deserializeScene,
  findEntityByUuid,
  getComponentDef,
  setComponentValue,
  applyPatch,
  serializeSubtree,
} from '@ahengine/ecs-runtime'
import { ChildOf, getParent, setParent } from '@ahengine/ecs-runtime'
import { useEditorStore } from './store.js'
import { materialService } from './services.js'
import type { World as KootaWorld } from 'koota'

/**
 * Command system. Every meaningful editor action is a command with do/undo.
 * Gizmo drags capture state on drag start and commit ONE command on release —
 * never per mouse move.
 */

export interface EditorCommand {
  readonly label: string
  /**
   * When set, rapidly consecutive commands with the same key merge into one
   * undo entry (numeric nudges, slider bursts). First `before` is kept.
   */
  readonly coalesceKey?: string
  execute(): void
  undo(): void
}

class CommandStack {
  private undoStack: EditorCommand[] = []
  private redoStack: EditorCommand[] = []
  private lastPushAt = 0
  private static COALESCE_WINDOW_MS = 1000

  push(command: EditorCommand): void {
    const now = Date.now()
    const top = this.undoStack[this.undoStack.length - 1]
    if (
      command.coalesceKey &&
      top?.coalesceKey === command.coalesceKey &&
      now - this.lastPushAt < CommandStack.COALESCE_WINDOW_MS &&
      top instanceof SetComponentFieldCommand &&
      command instanceof SetComponentFieldCommand
    ) {
      // Merge: keep the FIRST before, adopt the LATEST after.
      this.undoStack[this.undoStack.length - 1] = new SetComponentFieldCommand(
        top.label,
        top.uuid,
        top.componentId,
        top.before,
        command.after
      )
      this.lastPushAt = now
      this.redoStack = []
      return
    }
    this.undoStack.push(command)
    if (this.undoStack.length > 256) this.undoStack.shift()
    this.redoStack = []
    this.lastPushAt = now
    this.syncDepths()
  }

  /** Loading a different project invalidates all history. */
  clearForLoad(): void {
    this.undoStack = []
    this.redoStack = []
    this.syncDepths()
  }

  undo(): EditorCommand | undefined {
    const command = this.undoStack.pop()
    if (!command) return undefined
    command.undo()
    this.redoStack.push(command)
    this.syncDepths()
    return command
  }

  redo(): EditorCommand | undefined {
    const command = this.redoStack.pop()
    if (!command) return undefined
    command.execute()
    this.undoStack.push(command)
    this.syncDepths()
    return command
  }

  private syncDepths(): void {
    useEditorStore.getState().setCommandDepths(this.undoStack.length, this.redoStack.length)
  }
}

export const commandStack = new CommandStack()

export function runCommand(command: EditorCommand): void {
  command.execute()
  commandStack.push(command)
}

function world(): KootaWorld {
  return useEditorStore.getState().world
}

/* ------------------------------------------------------------------ */
/* Entity lifecycle                                                    */
/* ------------------------------------------------------------------ */

export class AddEntitiesCommand implements EditorCommand {
  constructor(
    readonly label: string,
    private readonly data: SerializedEntity[],
    private readonly selectRoot = true
  ) {}

  private roots: Entity[] = []

  execute(): void {
    const { entitiesById, rootEntities } = deserializeScene(world(), this.data)
    // Re-link to original parents when re-doing (parents stored per data row).
    this.roots = rootEntities
    if (this.selectRoot && rootEntities[0]) {
      useEditorStore.getState().select([rootEntities[0].get(EntityMeta)!.uuid])
    }
  }

  undo(): void {
    for (const root of this.roots) {
      if (root.isAlive()) destroySubtree(world(), root)
    }
    this.roots = []
  }
}

export class DeleteEntitiesCommand implements EditorCommand {
  private snapshots: { data: SerializedEntity[]; roots: Entity[] }[] = []

  constructor(
    readonly label: string,
    private readonly uuids: string[]
  ) {}

  execute(): void {
    this.snapshots = []
    const selected = new Set(this.uuids)
    for (const uuid of this.uuids) {
      const entity = findEntityByUuid(world(), uuid)
      if (!entity) continue
      // Skip entities whose ancestor is also selected — the ancestor's
      // subtree deletion already covers them.
      let dominated = false
      let ancestor = getParent(entity)
      while (ancestor !== undefined) {
        if (selected.has(ancestor.get(EntityMeta)?.uuid ?? '')) {
          dominated = true
          break
        }
        ancestor = getParent(ancestor)
      }
      if (dominated) continue
      const data = serializeSubtree(world(), entity)
      this.snapshots.push({ data, roots: [entity] })
      destroySubtree(world(), entity)
    }
    useEditorStore.getState().select([])
  }

  undo(): void {
    for (const snapshot of this.snapshots) deserializeScene(world(), snapshot.data)
    this.snapshots = []
  }
}

function destroySubtree(world: KootaWorld, root: Entity): void {
  const objects: import('three').Object3D[] = []
  const walk = (entity: Entity) => {
    const object = entity.get(ThreeObject)?.object
    if (object) objects.push(object)
    for (const child of world.query(ChildOf(entity))) walk(child)
  }
  walk(root)
  root.destroy() // ChildOf autoDestroy:'orphan' cascades
  for (const object of objects) {
    object.traverse((child) => {
      const mesh = child as import('three').Mesh
      if (mesh.isMesh && mesh.name === 'mesh') mesh.geometry?.dispose?.()
    })
    object.removeFromParent()
  }
}

/* ------------------------------------------------------------------ */
/* Components                                                          */
/* ------------------------------------------------------------------ */

export class AddComponentCommand implements EditorCommand {
  private prevData: Record<string, unknown> | null = null

  constructor(
    readonly label: string,
    private readonly uuid: string,
    private readonly componentId: string
  ) {}

  execute(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    if (!entity) return
    const def = getComponentDef(this.componentId)
    if (!def) return
    if (entity.has(def.trait)) return
    entity.add([def.trait, def.deserialize({}) as never])
  }

  undo(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    if (!entity) return
    const def = getComponentDef(this.componentId)
    if (!def) return
    if (this.prevData) entity.add([def.trait, def.deserialize(this.prevData) as never])
    else entity.remove(def.trait)
  }
}

export class RemoveComponentCommand implements EditorCommand {
  private prevData: Record<string, unknown> | null = null

  constructor(
    readonly label: string,
    private readonly uuid: string,
    private readonly componentId: string
  ) {}

  execute(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    if (!entity) return
    const def = getComponentDef(this.componentId)
    if (!def || !entity.has(def.trait)) return
    this.prevData = def.serialize(entity.get(def.trait) as Record<string, unknown>)
    entity.remove(def.trait)
  }

  undo(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    const def = getComponentDef(this.componentId)
    if (!entity || !def || !this.prevData) return
    entity.add([def.trait, def.deserialize(this.prevData) as never])
  }
}

/** Generic component property change with field-level before/after. */
export class SetComponentFieldCommand implements EditorCommand {
  readonly coalesceKey: string
  constructor(
    readonly label: string,
    readonly uuid: string,
    readonly componentId: string,
    readonly before: Record<string, unknown>,
    readonly after: Record<string, unknown>
  ) {
    this.coalesceKey = `${uuid}:${componentId}`
  }

  execute(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    if (!entity) return
    applyPatch(entity, this.componentId, this.after)
  }

  undo(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    if (!entity) return
    applyPatch(entity, this.componentId, this.before)
  }
}

/* ------------------------------------------------------------------ */
/* Hierarchy                                                           */
/* ------------------------------------------------------------------ */

export class ReparentCommand implements EditorCommand {
  constructor(
    readonly label: string,
    private readonly uuid: string,
    private readonly oldParentUuid: string | null,
    private readonly newParentUuid: string | null
  ) {}

  execute(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    if (!entity) return
    const parent = (this.newParentUuid ? findEntityByUuid(world(), this.newParentUuid) : null) ?? null
    if (parent || this.newParentUuid === null) setParent(world(), entity, parent)
  }

  undo(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    if (!entity) return
    const parent = (this.oldParentUuid ? findEntityByUuid(world(), this.oldParentUuid) : null) ?? null
    if (parent || this.oldParentUuid === null) setParent(world(), entity, parent)
  }
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */

export class UpsertMaterialCommand implements EditorCommand {
  private existedBefore = false
  private prevDef: MaterialDefinition | null = null

  constructor(
    readonly label: string,
    private readonly def: MaterialDefinition
  ) {}

  execute(): void {
    const store = useEditorStore.getState()
    this.prevDef = store.materials.find((m) => m.id === this.def.id) ?? null
    this.existedBefore = this.prevDef !== null
    const next = store.materials.some((m) => m.id === this.def.id)
      ? store.materials.map((m) => (m.id === this.def.id ? this.def : m))
      : [...store.materials, this.def]
    store.setMaterials(next)
    materialService.update(this.def.id)
  }

  undo(): void {
    const store = useEditorStore.getState()
    if (this.existedBefore && this.prevDef) {
      store.setMaterials(store.materials.map((m) => (m.id === this.prevDef!.id ? this.prevDef! : m)))
      materialService.update(this.prevDef.id)
    } else {
      store.setMaterials(store.materials.filter((m) => m.id !== this.def.id))
      materialService.remove(this.def.id)
    }
  }
}

/* ------------------------------------------------------------------ */
/* Gizmo commit                                                        */
/* ------------------------------------------------------------------ */

export class TransformDragCommand implements EditorCommand {
  constructor(
    readonly label: string,
    private readonly uuid: string,
    private readonly before: Record<string, unknown>,
    private readonly after: Record<string, unknown>
  ) {}

  execute(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    if (entity) applyPatch(entity, 'core.transform', this.after)
  }

  undo(): void {
    const entity = findEntityByUuid(world(), this.uuid)
    if (entity) applyPatch(entity, 'core.transform', this.before)
  }
}

export { serializeSubtree, setComponentValue }
