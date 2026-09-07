import { describe, expect, it } from 'vitest'
import { createWorld } from 'koota'
import { MaterialService } from '@ahengine/ecs-runtime'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import type { MaterialDefinition, ProjectData } from '@ahengine/project-schema'
import { createDefaultProject } from '@ahengine/editor-core'

/* Runtime loader + material serialization (spec §50). */

describe('material service', () => {
  const defs = new Map<string, MaterialDefinition>([
    [
      'mat-red',
      {
        id: 'mat-red',
        name: 'Red',
        type: 'standard',
        properties: { baseColor: '#ff0000', roughness: 0.4, metalness: 0.2 },
      },
    ],
    [
      'mat-unlit',
      { id: 'mat-unlit', name: 'Unlit', type: 'unlit', properties: { baseColor: '#00ff00' } },
    ],
  ])
  const service = new MaterialService(() => defs)

  it('builds WebGPU node materials from definitions', () => {
    const material = service.get('mat-red') as MeshStandardNodeMaterial
    expect(material).toBeInstanceOf(MeshStandardNodeMaterial)
    expect(`#${material.color.getHexString()}`).toBe('#ff0000')
    expect(material.roughness).toBe(0.4)
    expect(material.metalness).toBe(0.2)
  })

  it('builds unlit materials as basic node materials', () => {
    const material = service.get('mat-unlit')
    expect(material.type).toContain('Basic')
  })

  it('rebuilds on update and keeps a single instance per id', () => {
    const before = service.get('mat-red')
    const after = service.get('mat-red')
    expect(before).toBe(after)
    defs.set('mat-red', {
      id: 'mat-red',
      name: 'Red',
      type: 'standard',
      properties: { baseColor: '#0000ff', roughness: 0.9, metalness: 0 },
    })
    service.update('mat-red')
    const rebuilt = service.get('mat-red') as MeshStandardNodeMaterial
    expect(rebuilt).not.toBe(before)
    expect(`#${rebuilt.color.getHexString()}`).toBe('#0000ff')
  })

  it('returns undefined for unknown ids', () => {
    expect(service.get('missing')).toBeUndefined()
    expect(service.get(null)).toBeUndefined()
  })
})

describe('default project data', () => {
  it('contains a camera, lights, ground and the test cube', () => {
    const project: ProjectData = createDefaultProject()
    const names = project.scene.entities.map((entity) => entity.name)
    expect(names).toContain('Camera')
    expect(names).toContain('Sun')
    expect(names).toContain('Ground')
    expect(names).toContain('Cube')
    expect(names).toContain('Tree')
    expect(project.materials.length).toBeGreaterThanOrEqual(2)
    expect(project.scene.settings.defaultCameraId).not.toBeNull()
  })

  it('material ids referenced by entities exist in the material list', () => {
    const project = createDefaultProject()
    const ids = new Set(project.materials.map((m) => m.id))
    for (const entity of project.scene.entities) {
      const material = entity.components['render.material'] as { slots?: { materialId: string | null }[] } | undefined
      for (const slot of material?.slots ?? []) {
        if (slot.materialId) expect(ids.has(slot.materialId)).toBe(true)
      }
    }
  })
})

describe('runtime loader (node-side)', () => {
  it('spawns entities from exported data without any editor UI package', async () => {
    const { loadScene, EntityMeta, Transform } = await import('@ahengine/ecs-runtime')
    const world = createWorld()
    const project = createDefaultProject()
    const handle = loadScene(world, project)
    expect(handle.entitiesById.size).toBe(project.scene.entities.length)
    expect(handle.rootEntities.length).toBeGreaterThan(0)
    const cube = handle.entitiesById.get(project.scene.entities.find((e) => e.name === 'Cube')!.id)!
    expect(cube.has(Transform)).toBe(true)
    expect(world.query(EntityMeta).length).toBe(project.scene.entities.length)
    handle.dispose()
    expect(world.query(EntityMeta).length).toBe(0)
  })
})
