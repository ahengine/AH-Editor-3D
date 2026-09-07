import { relation } from 'koota'
import type { Entity, World } from 'koota'

/**
 * Hierarchy lives in Koota relations, never in nested JS objects.
 * exclusive: an entity has exactly one parent.
 * autoDestroy 'orphan': destroying a parent destroys its children.
 */
export const ChildOf = relation({ exclusive: true, autoDestroy: 'orphan' })

export function getParent(entity: Entity): Entity | undefined {
  return entity.targetFor(ChildOf)
}

/** Direct children of a parent, in spawn order. */
export function getChildren(world: World, parent: Entity): Entity[] {
  return [...world.query(ChildOf(parent))]
}

export function isDescendantOf(entity: Entity, maybeAncestor: Entity): boolean {
  let cursor = getParent(entity)
  while (cursor !== undefined) {
    if (cursor === maybeAncestor) return true
    cursor = getParent(cursor)
  }
  return false}

/** Reparent, guarding against cycles. Returns false when the move would create a cycle. */
export function setParent(world: World, entity: Entity, parent: Entity | null): boolean {
  if (parent !== null) {
    if (parent === entity) return false
    if (isDescendantOf(parent, entity)) return false
  }
  const current = getParent(entity)
  if (current !== undefined) entity.remove(ChildOf(current))
  if (parent !== null) entity.add(ChildOf(parent))
  return true
}

/** Depth-first list of an entity and all its descendants. */
export function collectSubtree(world: World, root: Entity, out: Entity[] = []): Entity[] {
  out.push(root)
  for (const child of getChildren(world, root)) collectSubtree(world, child, out)
  return out
}
