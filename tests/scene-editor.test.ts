import { describe, expect, it } from 'vitest'
import { createWorld } from 'koota'
import {
  EntityMeta,
  PrimitiveMesh,
  ThreeObject,
  Transform,
  applyPatch,
  deserializeScene,
  findEntityByUuid,
  getChildren,
  serializeSceneEntities,
} from '@ahengine/ecs-runtime'
import { createDefaultProject } from '@ahengine/editor-core'

/* Scene-editor mechanics: renderer visibility round-trip + enable semantics. */

const uuid = () => crypto.randomUUID()

describe('renderer visibility (authored, distinct from enabled)', () => {
  it('PrimitiveMesh.visible serializes and round-trips', () => {
    const world = createWorld()
    const id = uuid()
    deserializeScene(world, [
      {
        id,
        name: 'Hidden Cube',
        enabled: true,
        parentId: null,
        components: {
          'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          'render.mesh': { shape: 'box', size: 1, segments: 1, visible: false },
        },
      },
    ])
    const entity = findEntityByUuid(world, id)!
    expect(entity.get(PrimitiveMesh)!.visible).toBe(false)

    // Toggle through the same authored path the hierarchy eye uses.
    applyPatch(entity, 'render.mesh', { visible: true })
    expect(entity.get(PrimitiveMesh)!.visible).toBe(true)

    const serialized = serializeSceneEntities(world)
    expect((serialized[0].components['render.mesh'] as { visible?: boolean }).visible).toBe(true)
    applyPatch(entity, 'render.mesh', { visible: false })
    const serialized2 = serializeSceneEntities(world)
    expect((serialized2[0].components['render.mesh'] as { visible?: boolean }).visible).toBe(false)

    // Legacy data without the field defaults to visible.
    const world2 = createWorld()
    const id2 = uuid()
    deserializeScene(world2, [
      {
        id: id2,
        name: 'Legacy',
        enabled: true,
        parentId: null,
        components: {
          'render.mesh': { shape: 'box', size: 1, segments: 1 },
        },
      },
    ])
    expect(findEntityByUuid(world2, id2)!.get(PrimitiveMesh)!.visible).toBe(true)
  })

  it('enabled and visibility are independent flags on the entity', () => {
    const world = createWorld()
    const id = uuid()
    deserializeScene(world, [
      {
        id,
        name: 'E',
        enabled: false, // activation off
        parentId: null,
        components: {
          'render.mesh': { shape: 'box', size: 1, segments: 1, visible: true }, // renderer on
        },
      },
    ])
    const entity = findEntityByUuid(world, id)!
    expect(entity.get(EntityMeta)!.enabled).toBe(false)
    expect(entity.get(PrimitiveMesh)!.visible).toBe(true)
  })
})

describe('default project scene-editor invariants', () => {
  it('default scene hierarchy is sane (roots + children + transforms)', () => {
    const project = createDefaultProject()
    const world = createWorld()
    const { entitiesById } = deserializeScene(world, project.scene.entities, project.prefabs)
    const tree = entitiesById.get(
      project.scene.entities.find((e) => e.name === 'Tree')!.id
    )!
    const children = getChildren(world, tree).map((c) => c.get(EntityMeta)!.name)
    expect(children).toEqual(['Trunk', 'Leaves'])
    const cube = entitiesById.get(project.scene.entities.find((e) => e.name === 'Cube')!.id)!
    expect(cube.get(Transform)!.position).toEqual({ x: 0, y: 0.5, z: 0 })
    // No runtime objects were serialized into the authored data.
    cube.add([ThreeObject, { object: null }])
    const json = JSON.stringify(serializeSceneEntities(world))
    expect(json).not.toContain('ThreeObject')
  })
})
