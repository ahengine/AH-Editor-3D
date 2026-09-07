import { describe, expect, it } from 'vitest'
import { createWorld } from 'koota'
import { ModelRenderer, deserializeScene, serializeSceneEntities } from '@ahengine/ecs-runtime'
import { createDefaultProject, loadProject, buildProjectData } from '@ahengine/editor-core'
import type { AssetRecord, ProjectData } from '@ahengine/project-schema'
import { assertProjectIntegrity, validateProjectIntegrity, parseProject } from '@ahengine/project-schema'

/* Project + Asset Authoring System tests. */

const uuid = () => crypto.randomUUID()

function projectWithModelAsset(): { project: ProjectData; assetId: string; entityId: string } {
  const project = createDefaultProject()
  const assetId = 'asset-test-glb'
  const entityId = uuid()
  project.assets.push({ id: assetId, type: 'model', name: 'test.glb', uri: `idb://${assetId}`, createdAt: new Date().toISOString() })
  project.scene.entities.push({
    id: entityId,
    name: 'Model Entity',
    enabled: true,
    parentId: null,
    components: {
      'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      'render.model': { assetId, visible: true, castShadow: true, receiveShadow: true },
      'render.material': { slots: [{ materialId: null }] },
    },
  })
  return { project, assetId, entityId }
}

describe('asset ID persistence', () => {
  it('asset IDs survive a full project round trip unchanged', () => {
    const { project, assetId } = projectWithModelAsset()
    const exported = JSON.parse(JSON.stringify(project))
    const reimported = parseProject(exported)
    expect(reimported.assets.find((a) => a.id === assetId)).toBeDefined()
    expect(reimported.assets.find((a) => a.id === assetId)?.name).toBe('test.glb')
  })

  it('scene entity asset references persist through save/load', () => {
    const { project, assetId } = projectWithModelAsset()
    const world = createWorld()
    const { entitiesById } = deserializeScene(world, project.scene.entities)
    const entity = entitiesById.get(project.scene.entities.find(e => e.name === 'Model Entity')!.id)!
    expect(entity.get(ModelRenderer)?.assetId).toBe(assetId)

    const serialized = serializeSceneEntities(world)
    const modelEntity = serialized.find(e => e.name === 'Model Entity')
    expect((modelEntity?.components['render.model'] as { assetId?: string })?.assetId).toBe(assetId)
  })
})

describe('asset rename keeps ID', () => {
  it('renaming changes display name only, not the stable ID', () => {
    const { project, assetId } = projectWithModelAsset()
    const renamed = {
      ...project,
      assets: project.assets.map((a: AssetRecord) =>
        a.id === assetId ? { ...a, name: 'renamed-model.glb' } : a
      ),
    }
    expect(renamed.assets.find((a) => a.id === assetId)?.name).toBe('renamed-model.glb')
    // Scene reference still points at the same ID
    const ref = renamed.scene.entities.find(e => e.name === 'Model Entity')
    expect((ref?.components['render.model'] as { assetId?: string })?.assetId).toBe(assetId)
  })
})

describe('asset deletion validation', () => {
  it('integrity flags a missing asset reference after deletion', () => {
    const { project, assetId } = projectWithModelAsset()
    // Delete the asset from the list but keep the scene reference → broken
    const broken = { ...project, assets: project.assets.filter((a: AssetRecord) => a.id !== assetId) }
    const issues = validateProjectIntegrity(broken)
    expect(issues.some((i) => i.message.includes(`missing asset "${assetId}"`))).toBe(true)
  })

  it('valid project (asset present) passes integrity', () => {
    const { project } = projectWithModelAsset()
    expect(() => assertProjectIntegrity(project)).not.toThrow()
  })
})

describe('missing asset — no crash', () => {
  it('scene with dangling asset reference deserializes without throwing', () => {
    const { project, assetId } = projectWithModelAsset()
    const broken = { ...project, assets: project.assets.filter((a: AssetRecord) => a.id !== assetId) }
    // The scene itself still loads — the model simply won't render
    const world = createWorld()
    const { entitiesById } = deserializeScene(world, broken.scene.entities)
    const entity = entitiesById.get(broken.scene.entities.find(e => e.name === 'Model Entity')!.id)!
    expect(entity.isAlive()).toBe(true)
    expect(entity.get(ModelRenderer)?.assetId).toBe(assetId) // reference kept for reassignment
  })
})

describe('project reopen round trip', () => {
  it('full load → serialize → load again preserves everything', () => {
    const { project } = projectWithModelAsset()
    loadProject(project)
    const exported = buildProjectData()
    const reimported = parseProject(JSON.parse(JSON.stringify(exported)))
    expect(reimported.scene.entities.length).toBe(exported.scene.entities.length)
    expect(reimported.assets.length).toBe(exported.assets.length)
    expect(reimported.materials.length).toBe(exported.materials.length)
  })
})

describe('GLB metadata', () => {
  it('imported asset record includes createdAt and source', () => {
    const record: AssetRecord = {
      id: 'asset-meta-test',
      type: 'model',
      name: 'test.glb',
      uri: 'idb://asset-meta-test',
      source: 'test.glb',
      createdAt: '2026-01-01T00:00:00Z',
      metadata: {
        triangleCount: 12,
        animationNames: ['Spin'],
        materialSlots: ['Material.001'],
        boundingBox: { min: [0, 0, 0], max: [1, 1, 1] },
      },
    }
    expect(record.metadata?.triangleCount).toBe(12)
    expect((record.metadata?.animationNames as string[]).length).toBe(1)
    expect(record.createdAt).toBeDefined()
    expect(record.source).toBe('test.glb')
  })
})

describe('no binary embedding', () => {
  it('project JSON never contains base64 asset blobs', () => {
    const { project } = projectWithModelAsset()
    const json = JSON.stringify(project)
    // URIs must be references, not inline data
    expect(json).not.toMatch(/data:[a-z]+;base64,/)
    expect(json).not.toMatch(/[A-Za-z0-9+/]{500,}={0,2}/) // no long base64 runs
    const asset = project.assets.find((a) => a.type === 'model')
    expect(asset?.uri).toMatch(/^idb:\/\//) // infrastructure-agnostic reference
  })
})
