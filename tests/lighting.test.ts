import { describe, expect, it } from 'vitest'
import { createWorld } from 'koota'
import {
  EntityMeta,
  Light,
  deserializeScene,
  serializeSceneEntities,
  findEntityByUuid,
} from '@ahengine/ecs-runtime'
import { createDefaultProject } from '@ahengine/editor-core'
import type { SceneSettings } from '@ahengine/project-schema'

/* Scene Lighting & Environment: schema round-trip, light entity, env settings, fog modes. */

describe('scene environment settings', () => {
  it('new fields (ambient, envRotation, envBackground) have defaults for legacy data', () => {
    const project = createDefaultProject()
    const s = project.scene.settings
    expect(s.ambientIntensity).toBeDefined()
    expect(s.ambientColor).toBeDefined()
    expect(s.environmentRotation).toBeDefined()
    expect(s.environmentBackground).toBeDefined()
  })

  it('scene settings survive JSON round-trip', () => {
    const project = createDefaultProject()
    const json = JSON.parse(JSON.stringify(project.scene.settings))
    expect(json.background).toBe(project.scene.settings.background)
    expect(json.fog.type).toBe(project.scene.settings.fog.type)
    expect(json.environmentRotation).toBe(project.scene.settings.environmentRotation)
    expect(json.ambientColor).toBe(project.scene.settings.ambientColor)
  })

  it('fog linear mode round-trips with near/far', () => {
    const settings: SceneSettings = {
      ...createDefaultProject().scene.settings,
      fog: { enabled: true, type: 'linear', color: '#aabbcc', near: 5, far: 50, density: 0.01 },
    }
    const json = JSON.parse(JSON.stringify(settings))
    expect(json.fog.near).toBe(5)
    expect(json.fog.far).toBe(50)
    expect(json.fog.type).toBe('linear')
  })

  it('fog exponential mode round-trips with density', () => {
    const settings: SceneSettings = {
      ...createDefaultProject().scene.settings,
      fog: { enabled: true, type: 'exponential', color: '#112233', near: 0, far: 100, density: 0.05 },
    }
    const json = JSON.parse(JSON.stringify(settings))
    expect(json.fog.density).toBe(0.05)
    expect(json.fog.type).toBe('exponential')
  })
})

describe('light entity serialization', () => {
  it('directional light round-trips with all fields', () => {
    const world = createWorld()
    const id = crypto.randomUUID()
    deserializeScene(world, [{
      id,
      name: 'Sun',
      enabled: true,
      parentId: null,
      components: {
        'render.light': { type: 'directional', color: '#fff1d6', intensity: 2.4, castShadow: true, shadowBias: -0.001, shadowMapSize: 2048 },
      },
    }])
    const entity = findEntityByUuid(world, id)!
    expect(entity.get(Light)!.type).toBe('directional')
    expect(entity.get(Light)!.intensity).toBe(2.4)
    expect(entity.get(Light)!.castShadow).toBe(true)

    const serialized = serializeSceneEntities(world)
    const light = serialized[0].components['render.light'] as Record<string, unknown>
    expect(light.type).toBe('directional')
    expect(light.intensity).toBe(2.4)
    expect(light.castShadow).toBe(true)
    // Fields irrelevant to directional are still serialized (schema-completeness)
    expect(light).toHaveProperty('distance')
    expect(light).toHaveProperty('angle')
  })

  it('spot light round-trips with type-specific fields', () => {
    const world = createWorld()
    const id = crypto.randomUUID()
    deserializeScene(world, [{
      id,
      name: 'Spot',
      enabled: true,
      parentId: null,
      components: {
        'render.light': { type: 'spot', color: '#ffffff', intensity: 8, distance: 10, angle: 0.5, penumbra: 0.3, decay: 2 },
      },
    }])
    const entity = findEntityByUuid(world, id)!
    expect(entity.get(Light)!.type).toBe('spot')
    expect(entity.get(Light)!.angle).toBe(0.5)
    expect(entity.get(Light)!.penumbra).toBe(0.3)
  })

  it('light disable/enable preserves values (EntityMeta.enabled)', () => {
    const world = createWorld()
    const id = crypto.randomUUID()
    deserializeScene(world, [{
      id,
      name: 'Light',
      enabled: true,
      parentId: null,
      components: {
        'render.light': { type: 'point', color: '#ff0000', intensity: 5, distance: 8 },
      },
    }])
    const entity = findEntityByUuid(world, id)!
    // Disable
    entity.set(EntityMeta, { enabled: false })
    expect(entity.get(EntityMeta)!.enabled).toBe(false)
    // Light data preserved
    expect(entity.get(Light)!.intensity).toBe(5)
    expect(entity.get(Light)!.color).toBe('#ff0000')
    // Re-enable
    entity.set(EntityMeta, { enabled: true })
    expect(entity.get(Light)!.intensity).toBe(5)
  })
})

describe('environment asset reference persistence', () => {
  it('environmentAssetId survives full project round-trip', () => {
    const project = createDefaultProject()
    project.scene.settings.environmentAssetId = 'asset-test-hdri'
    project.scene.settings.environmentIntensity = 0.8
    project.scene.settings.environmentRotation = 1.5
    project.scene.settings.environmentBackground = false
    project.scene.settings.ambientIntensity = 0.5
    project.scene.settings.ambientColor = '#aabbcc'

    const json = JSON.parse(JSON.stringify(project))
    const s = json.scene.settings
    expect(s.environmentAssetId).toBe('asset-test-hdri')
    expect(s.environmentIntensity).toBe(0.8)
    expect(s.environmentRotation).toBe(1.5)
    expect(s.environmentBackground).toBe(false)
    expect(s.ambientIntensity).toBe(0.5)
    expect(s.ambientColor).toBe('#aabbcc')
  })
})

describe('no runtime objects in serialized output', () => {
  it('light gizmos and helpers never appear in exported JSON', () => {
    const world = createWorld()
    const id = crypto.randomUUID()
    deserializeScene(world, [{
      id,
      name: 'Light',
      enabled: true,
      parentId: null,
      components: {
        'render.light': { type: 'point', color: '#ffffff', intensity: 1 },
      },
    }])
    const json = JSON.stringify(serializeSceneEntities(world))
    expect(json).not.toContain('ArrowHelper')
    expect(json).not.toContain('wireframe')
    expect(json).not.toContain('gizmo')
    expect(json).not.toContain('THREE')
    expect(json).not.toContain('Object3D')
  })
})
