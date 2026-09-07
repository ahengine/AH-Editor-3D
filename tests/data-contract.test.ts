import { describe, expect, it } from 'vitest'
import { createWorld } from 'koota'
import {
  Animator,
  ChildOf,
  EntityMeta,
  Light,
  MaterialReference,
  ParticleEmitter,
  PrefabInstance,
  PrimitiveMesh,
  ThreeObject,
  Transform,
  Camera as CameraTrait,
  deserializeScene,
  findEntityByUuid,
  getChildren,
  getParent,
  serializeScene,
  serializeSceneEntities,
  serializeEntity,
  validateComponentEntry,
} from '@ahengine/ecs-runtime'
import type { SceneData, SceneSettings, SerializedEntity, ProjectData } from '@ahengine/project-schema'
import {
  assertProjectIntegrity,
  migrateAnimation,
  migrateAnimator,
  migrateMaterialAsset,
  migrateParticle,
  migratePrefab,
  migrateProject,
  migrateScene,
  parseProject,
  UnsupportedSchemaVersionError,
  validateProjectIntegrity,
  ValidationError,
} from '@ahengine/project-schema'

/* CORE DATA ARCHITECTURE CONTRACT
 *
 * AUTHORING DATA ↔ KOOTA ECS ↔ THREE RUNTIME — the acceptance scene and
 * every exclusion/determinism/reference rule live here.
 */

const uuid = (() => {
  let n = 0
  return () => `0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1${String(n++).padStart(2, '0')}`
})()

function settingsFixture(cameraId: string | null): SceneSettings {
  return {
    background: '#dfe3ea',
    environmentAssetId: null,
    environmentIntensity: 1,
    fog: { enabled: true, type: 'linear', color: '#dfe3ea', near: 22, far: 85, density: 0.02 },
    toneMapping: 'aces',
    toneMappingExposure: 1,
    shadowEnabled: true,
    defaultCameraId: cameraId,
  }
}

function entity(
  id: string,
  name: string,
  parentId: string | null,
  components: SerializedEntity['components']
): SerializedEntity {
  return { id, name, enabled: true, parentId, components }
}

/** Acceptance scene: Root ├ Camera ├ Sun └ Cube (+ particle emitter on Cube). */
function acceptanceScene(): { scene: SceneData; ids: Record<string, string> } {
  const ids = {
    root: uuid(),
    camera: uuid(),
    sun: uuid(),
    cube: uuid(),
  }
  const scene: SceneData = {
    format: 'koota-3d-scene',
    schemaVersion: 1,
    id: 'acceptance',
    name: 'Acceptance',
    settings: settingsFixture(ids.camera),
    entities: [
      entity(ids.root, 'Root', null, {
        'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      }),
      entity(ids.camera, 'Camera', ids.root, {
        'core.transform': { position: [7, 4.5, 9], rotation: [-12, 38, 0], scale: [1, 1, 1] },
        'render.camera': { fov: 55, near: 0.1, far: 300 },
      }),
      entity(ids.sun, 'Sun', ids.root, {
        'core.transform': { position: [6, 9, 4], rotation: [-35, 25, 0], scale: [1, 1, 1] },
        'render.light': { type: 'directional', color: '#fff1d6', intensity: 2.4 },
      }),
      entity(ids.cube, 'Cube', ids.root, {
        'core.transform': { position: [0, 0.5, 0], rotation: [0, 45, 0], scale: [1, 1, 1] },
        'render.mesh': { shape: 'box', size: 1, segments: 1 },
        'render.material': { slots: [{ materialId: 'mat-x' }] },
        'particle.emitter': { effectId: 'fx-smoke', playing: true, rate: 12, seed: 7 },
      }),
    ],
  }
  return { scene, ids }
}

describe('ACCEPTANCE: destroy world → deserialize → identical data', () => {
  it('UUIDs, hierarchy and component data survive a full round trip', () => {
    const { scene, ids } = acceptanceScene()

    // World A: load, mutate nothing, serialize back out.
    const worldA = createWorld()
    const loadedA = deserializeScene(worldA, scene.entities)
    expect(loadedA.entitiesById.size).toBe(4)
    const cameraA = loadedA.entitiesById.get(ids.camera)!
    expect(cameraA.get(CameraTrait)?.fov).toBe(55)
    const cubeA = loadedA.entitiesById.get(ids.cube)!
    expect(cubeA.get(ParticleEmitter)?.rate).toBe(12)
    const serializedA = serializeSceneEntities(worldA)
    // Snapshot trait data BEFORE destroying world A (records die with entities).
    const transformASnapshot = { ...cubeA.get(Transform) }
    const emitterASnapshot = { ...cubeA.get(ParticleEmitter) }
    const slotsASnapshot = cubeA.get(MaterialReference)?.slots.map((slot) => ({ ...slot }))
    const fovA = cameraA.get(CameraTrait)?.fov

    // Destroy world A (entities + relations gone).
    for (const e of [...worldA.query(EntityMeta)]) if (e.isAlive()) e.destroy()
    expect(worldA.query(EntityMeta).length).toBe(0)

    // World B: fresh deserialize from the ORIGINAL data.
    const worldB = createWorld()
    const loadedB = deserializeScene(worldB, scene.entities)
    const serializedB = serializeSceneEntities(worldB)

    // UUIDs identical — persistent identity, not koota ids.
    expect(serializedB.map((e) => e.id).sort()).toEqual(serializedA.map((e) => e.id).sort())
    expect(loadedB.entitiesById.get(ids.root)).toBeDefined()
    expect(loadedB.entitiesById.get(ids.cube)!.get(EntityMeta)!.uuid).toBe(ids.cube)

    // Hierarchy identical (ChildOf relations rebuilt from parentId).
    const rootB = loadedB.entitiesById.get(ids.root)!
    const childrenB = getChildren(worldB, rootB).map((c) => c.get(EntityMeta)!.name)
    expect(childrenB).toEqual(['Camera', 'Sun', 'Cube'])
    expect(getParent(loadedB.entitiesById.get(ids.sun)!)).toBe(rootB)

    // Component data identical, including the new particle domain.
    const cubeB = loadedB.entitiesById.get(ids.cube)!
    expect(cubeB.get(Transform)).toEqual(transformASnapshot)
    expect(cubeB.get(ParticleEmitter)).toEqual(emitterASnapshot)
    expect(cubeB.get(MaterialReference)?.slots).toEqual(slotsASnapshot)
    expect(loadedB.entitiesById.get(ids.camera)!.get(CameraTrait)?.fov).toBe(fovA)

    // Serialized payload is byte-identical across both worlds.
    expect(JSON.stringify(sortEntities(serializedB))).toBe(JSON.stringify(sortEntities(serializedA)))
  })

  it('runtime objects (ThreeObject) are never serialized', () => {
    const { scene, ids } = acceptanceScene()
    const world = createWorld()
    const { entitiesById } = deserializeScene(world, scene.entities)
    const cube = entitiesById.get(ids.cube)!
    cube.add([ThreeObject, { object: { uuid: 'fake-three-object' } as never }])
    world.spawn([ThreeObject, { object: null }])

    const serialized = serializeSceneEntities(world)
    const json = JSON.stringify(serialized)
    expect(json).not.toContain('ThreeObject')
    expect(json).not.toContain('fake-three-object')
    expect(json).not.toContain('runtime.threeObject')
    // Non-serializable bookkeeping traits stay out as well.
    expect(json).not.toContain('InstanceMember')
    expect(json).not.toContain('core.meta')
  })
})

describe('determinism', () => {
  it('repeated serialization of an unchanged world is byte-identical', () => {
    const { scene } = acceptanceScene()
    const world = createWorld()
    deserializeScene(world, scene.entities)
    const a = JSON.stringify(serializeSceneEntities(world))
    const b = JSON.stringify(serializeSceneEntities(world))
    expect(b).toBe(a)
  })

  it('serialize → deserialize → serialize is stable (no id churn, no reorder)', () => {
    const { scene } = acceptanceScene()
    const world = createWorld()
    deserializeScene(world, scene.entities)
    const first = JSON.stringify(sortEntities(serializeSceneEntities(world)))

    const world2 = createWorld()
    deserializeScene(world2, JSON.parse(first) as SerializedEntity[])
    const second = JSON.stringify(sortEntities(serializeSceneEntities(world2)))
    expect(second).toBe(first)
  })
})

describe('editor-only state never leaks', () => {
  it('serialized scene contains none of the editor store keys', () => {
    const editorOnlyKeys = [
      'selection', 'hovered', 'tool', 'space', 'snapEnabled', 'snapTranslate', 'snapRotateDeg',
      'worldVersion', 'playMode', 'playWorld', 'backend', 'sidebarTab', 'inspectorTab',
      'timelineTab', 'editorMode', 'gridVisible', 'viewportScale', 'undoDepth', 'redoDepth',
      'clipboardEntity', 'clipboardComponent', 'diagnosticsOpen', 'bottomTab', 'bottomPanelOpen',
      'editingMaterialId', 'editingControllerId', 'animatorPreviewUuid', 'dirty',
    ]
    const { scene } = acceptanceScene()
    const world = createWorld()
    deserializeScene(world, scene.entities)
    const json = JSON.stringify({
      entities: serializeSceneEntities(world),
      settings: scene.settings,
    })
    const leaked = editorOnlyKeys.filter((key) => json.includes(`"${key}"`))
    expect(leaked).toEqual([])
  })
})

describe('unknown component handling', () => {
  it('deserializeEntity refuses unknown component ids with a meaningful error', () => {
    const world = createWorld()
    const bad = entity(uuid(), 'Future Entity', null, {
      'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      'custom.newThing': { foo: 1 },
    })
    expect(() => deserializeScene(world, [bad])).toThrow(/Unknown component.*custom\.newThing/)
    // Failed spawn leaves no orphan entity behind.
    expect(world.query(EntityMeta).length).toBe(0)
  })

  it('integrity validation flags unknown components per entity', () => {
    const issues = validateProjectIntegrity(projectWithComponent('custom.newThing', {}), {
      validateComponentData: validateComponentEntry,
    })
    expect(issues.some((issue) => issue.message.includes('Unknown component id "custom.newThing"'))).toBe(true)
  })
})

describe('reference integrity', () => {
  it('missing material / asset / controller / prefab / particle references are reported', () => {
    const base = validProject()
    // Material ref missing
    const badMaterial = structuredClone(base)
    badMaterial.scene.entities[3].components['render.material'] = { slots: [{ materialId: 'ghost-mat' }] }
    expect(validateProjectIntegrity(badMaterial).some((i) => i.message.includes('missing material "ghost-mat"'))).toBe(true)

    // Model asset ref missing
    const badAsset = structuredClone(base)
    badAsset.scene.entities[3].components['render.model'] = { assetId: 'ghost-model', visible: true, castShadow: true, receiveShadow: true }
    expect(validateProjectIntegrity(badAsset).some((i) => i.message.includes('missing asset "ghost-model"'))).toBe(true)

    // Animator controller ref missing
    const badController = structuredClone(base)
    badController.scene.entities[3].components['animation.animator'] = { controllerId: 'ghost-ctrl', playing: true, speed: 1, initialState: '' }
    expect(validateProjectIntegrity(badController).some((i) => i.message.includes('missing animator controller "ghost-ctrl"'))).toBe(true)

    // Particle effect ref missing
    const badParticle = structuredClone(base)
    badParticle.scene.entities[3].components['particle.emitter'] = { effectId: 'ghost-fx', playing: true, rate: 0, seed: 0 }
    expect(validateProjectIntegrity(badParticle).some((i) => i.message.includes('missing particle effect "ghost-fx"'))).toBe(true)

    // Prefab instance ref missing
    const badPrefab = structuredClone(base)
    badPrefab.scene.entities.push({
      id: uuid(), name: 'Ghost Instance', enabled: true, parentId: null,
      components: { 'prefab.instance': { prefabId: 'ghost-prefab', instanceId: 'i-1', overrides: {} } },
    })
    expect(validateProjectIntegrity(badPrefab).some((i) => i.message.includes('missing prefab "ghost-prefab"'))).toBe(true)
  })

  it('valid project passes assertProjectIntegrity silently', () => {
    expect(() => assertProjectIntegrity(validProject())).not.toThrow()
  })

  it('invalid entity UUIDs and cyclic parents are rejected', () => {
    const badUuid = structuredClone(validProject())
    badUuid.scene.entities[0].id = 'not-a-uuid'
    expect(validateProjectIntegrity(badUuid).some((i) => i.message.includes('Invalid entity UUID'))).toBe(true)

    const cyclic = structuredClone(validProject())
    cyclic.scene.entities[0].parentId = cyclic.scene.entities[3].id
    cyclic.scene.entities[3].parentId = cyclic.scene.entities[0].id
    expect(validateProjectIntegrity(cyclic).some((i) => i.message.includes('Cyclic hierarchy'))).toBe(true)
  })
})

describe('per-domain migration dispatchers (V1 pipelines)', () => {
  it('project migration walks the envelope and every embedded sub-document', () => {
    const project = validProject()
    const migrated = migrateProject(JSON.parse(JSON.stringify(project)))
    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.scene.schemaVersion).toBe(1)
    expect(migrated.prefabs.every((p) => p.schemaVersion === 1)).toBe(true)
    expect(migrated.animatorControllers.every((c) => c.schemaVersion === 1)).toBe(true)
    expect(migrated.animations.every((a) => a.schemaVersion === 1)).toBe(true)
    expect(migrated.particleEffects.every((p) => p.schemaVersion === 1)).toBe(true)
  })

  it('every domain dispatcher passes V1 data through untouched', () => {
    const project = validProject()
    expect(migrateScene(project.scene)).toEqual(project.scene)
    expect(migratePrefab(project.prefabs[0])).toEqual(project.prefabs[0])
    expect(migrateAnimation(project.animations[0])).toEqual(project.animations[0])
    expect(migrateAnimator(project.animatorControllers[0])).toEqual(project.animatorControllers[0])
    expect(migrateParticle(project.particleEffects[0])).toEqual(project.particleEffects[0])
    expect(migrateMaterialAsset({ format: 'koota-3d-material', schemaVersion: 1, material: project.materials[0] })).toEqual({
      format: 'koota-3d-material',
      schemaVersion: 1,
      material: project.materials[0],
    })
  })

  it('future versions from every domain are refused, not silently accepted', () => {
    const project = validProject()
    const cases: Array<[string, () => unknown, string]> = [
      ['project', () => migrateProject({ ...project, schemaVersion: 99 }), 'Project'],
      ['scene', () => migrateScene({ ...project.scene, schemaVersion: 99 }), 'Scene'],
      ['prefab', () => migratePrefab({ ...project.prefabs[0], schemaVersion: 99 }), 'Prefab'],
      ['material', () => migrateMaterialAsset({ format: 'koota-3d-material', schemaVersion: 99, material: project.materials[0] }), 'Material'],
      ['animation', () => migrateAnimation({ ...project.animations[0], schemaVersion: 99 }), 'Animation'],
      ['animator', () => migrateAnimator({ ...project.animatorControllers[0], schemaVersion: 99 }), 'Animator'],
      ['particle', () => migrateParticle({ ...project.particleEffects[0], schemaVersion: 99 }), 'Particle'],
    ]
    for (const [name, run, domain] of cases) {
      expect(run).toThrow(UnsupportedSchemaVersionError)
      try {
        run()
      } catch (error) {
        expect((error as Error).message).toContain(`${domain} schema version 99`)
      }
      void name
    }
  })
})

describe('embedded schemaVersion backfill', () => {
  it('animators authored before schemaVersion parse as V1 via default injection', () => {
    const project = validProject()
    const legacy = JSON.parse(JSON.stringify(project))
    for (const controller of legacy.animatorControllers) delete controller.schemaVersion
    for (const clip of legacy.animations) delete clip.schemaVersion
    delete legacy.animations // project-level array backfill
    delete legacy.particleEffects
    const parsed = parseProject(legacy)
    expect(parsed.animatorControllers[0].schemaVersion).toBe(1)
    expect(parsed.animations).toEqual([])
    expect(parsed.particleEffects).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/* fixtures                                                            */
/* ------------------------------------------------------------------ */

function sortEntities(entities: SerializedEntity[]): SerializedEntity[] {
  return [...entities].sort((a, b) => a.id.localeCompare(b.id))
}

function validProject(): ProjectData {
  const { scene } = acceptanceScene()
  const prefabCubeId = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d'
  return {
    format: 'koota-3d-project',
    schemaVersion: 1,
    project: { id: 'p1', name: 'Contract', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' },
    scene,
    assets: [{ id: 'asset-cube-gltf', type: 'model', name: 'cube.glb', uri: 'idb://asset-cube-gltf' }],
    materials: [
      { id: 'mat-x', name: 'X', type: 'standard', properties: { baseColor: '#c05b4d', roughness: 0.8, metalness: 0 } },
    ],
    prefabs: [
      {
        format: 'koota-3d-prefab',
        schemaVersion: 1,
        id: 'prefab-cube',
        name: 'Cube Prefab',
        rootLocalEntityId: 'cube',
        entities: [
          {
            localId: 'cube',
            parentLocalId: null,
            name: 'Cube',
            enabled: true,
            components: {
              'core.transform': { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              'render.mesh': { shape: 'box', size: 1, segments: 1 },
            },
          },
        ],
        nestedInstances: [],
      },
    ],
    animations: [
      { format: 'koota-3d-animation', schemaVersion: 1, id: 'clip-spin', name: 'Spin', sourceModelAssetId: 'asset-cube-gltf', clipName: 'Spin', duration: 2 },
    ],
    animatorControllers: [
      {
        id: 'anim-ctrl',
        name: 'Ctrl',
        modelAssetId: 'asset-cube-gltf',
        parameters: [],
        states: [{ id: 's1', name: 'Spin', clipId: 'Spin', loop: true, speed: 1 }],
        transitions: [],
        entryStateId: 's1',
        schemaVersion: 1,
      },
    ],
    particleEffects: [
      {
        format: 'koota-3d-particle',
        schemaVersion: 1,
        id: 'fx-smoke',
        name: 'Smoke',
        duration: 3,
        loop: true,
        capacity: 256,
        emissionRate: 40,
        shape: 'cone',
        shapeRadius: 0.5,
        startColor: '#9aa4b0',
        endColor: '#3c4654',
        startSize: 0.4,
        endSize: 1.2,
        startSpeed: 1.5,
        gravity: -0.5,
      },
    ],
  }
}

function projectWithComponent(componentId: string, data: unknown): ProjectData {
  const project = validProject()
  ;(project.scene.entities[3].components as Record<string, unknown>)[componentId] = data
  return project
}

// trait coverage smoke: referenced only to prove the trait layer stays plain data
void Light
void Animator
void PrimitiveMesh
void PrefabInstance
void ChildOf
void serializeEntity
void serializeScene
void findEntityByUuid
void ValidationError
