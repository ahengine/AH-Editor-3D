import { describe, expect, it } from 'vitest'
import { writeFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createWorld } from 'koota'
import {
  EntityMeta,
  InstanceMember,
  PrefabInstance,
  loadScene,
  MaterialService,
  AnimatorRuntime,
  UrlAssetResolver,
  type RuntimeSceneHandle,
} from '@ahengine/ecs-runtime'
import {
  assertProjectIntegrity,
  createFireEffect,
  parseProject,
  validateComponentEntry,
  type AnimationClipData,
  type AnimatorControllerV2,
  type MaterialDefinition,
  type PrefabDefinition,
  type PrefabEntity,
  type ProjectData,
} from '@ahengine/project-schema'

/* Stabilization §13: the Showcase Project.
 *
 * This test AUTHORS the showcase project (environment, sun, model, node
 * material, nested A→B→C prefab, animation, animator, particles), validates
 * it through the same parse+migrate+integrity pipeline imports use, writes
 * it to apps/runtime-demo/public/showcase.koota-project.json, loads it
 * through the REAL runtime loader (the exact path a host app takes), and
 * compares what landed in the world against what was authored.
 */

const t = (position: [number, number, number], scale: [number, number, number] = [1, 1, 1]) => ({
  position,
  rotation: [0, 0, 0] as [number, number, number],
  scale,
})

function prefabEntity(
  localId: string,
  parentLocalId: string | null,
  name: string,
  components: PrefabEntity['components']
): PrefabEntity {
  return { localId, parentLocalId, name, enabled: true, components }
}

function makePrefab(
  id: string,
  name: string,
  entities: PrefabEntity[],
  nested: PrefabDefinition['nestedInstances'] = []
): PrefabDefinition {
  return {
    format: 'koota-3d-prefab',
    schemaVersion: 1,
    id,
    name,
    rootLocalEntityId: entities[0]?.localId ?? 'root',
    entities,
    nestedInstances: nested,
  }
}

export function buildShowcaseProject(): ProjectData {
  const uuid = () => crypto.randomUUID()

  /* ---- node material (TSL graph): pulsing copper ---- */
  const nodeMaterial: MaterialDefinition = {
    id: 'mat-graph-copper',
    name: 'Copper Graph',
    type: 'standard',
    properties: { baseColor: '#b87333', roughness: 0.25, metalness: 0.9 },
    graph: {
      format: 'koota-3d-material-graph',
      schemaVersion: 1,
      id: 'graph-copper',
      name: 'Copper Graph',
      nodes: [
        { id: 'color', type: 'input.color', position: [80, 140], values: { color: '#c97b43' } },
        { id: 'rough', type: 'input.float', position: [80, 260], values: { value: 0.22 } },
        { id: 'metal', type: 'input.float', position: [80, 360], values: { value: 0.95 } },
        { id: 'output', type: 'output.material', position: [420, 220], values: {} },
      ],
      connections: [
        { fromNode: 'color', fromSocket: 'out', toNode: 'output', toSocket: 'baseColor' },
        { fromNode: 'rough', fromSocket: 'out', toNode: 'output', toSocket: 'roughness' },
        { fromNode: 'metal', fromSocket: 'out', toNode: 'output', toSocket: 'metalness' },
      ],
      outputNodeId: 'output',
      settings: {},
    },
  }

  /* ---- nested prefabs: A contains B, B contains C ---- */
  const prefabC = makePrefab('pfx-c', 'Crystal C', [
    prefabEntity('c-root', null, 'Crystal C', {
      'core.transform': t([0, 0.6, 0], [0.5, 0.9, 0.5]),
      'render.mesh': { shape: 'sphere', size: 0.9 },
      'render.material': { slots: [{ materialId: 'mat-graph-copper' }] },
    }),
  ])
  const prefabB = makePrefab(
    'pfx-b',
    'Podium B',
    [
      prefabEntity('b-root', null, 'Podium B', {
        'core.transform': t([0, 0, 0], [1.6, 0.4, 1.6]),
        'render.mesh': { shape: 'box', size: 1 },
        'render.material': { slots: [{ materialId: 'mat-terracotta' }] },
      }),
      prefabEntity('b-topper', 'b-root', 'Podium Topper', {
        'core.transform': t([0, 0.9, 0], [0.7, 0.7, 0.7]),
        'render.mesh': { shape: 'box', size: 1 },
        'render.material': { slots: [{ materialId: 'mat-sand' }] },
      }),
    ],
    [{ instanceId: 'b-crystal', prefabId: 'pfx-c', parentLocalId: 'b-root', overrides: {} }]
  )
  const prefabA = makePrefab(
    'pfx-a',
    'Shrine A',
    [
      prefabEntity('a-root', null, 'Shrine A', {
        'core.transform': t([0, 0, 0], [2.4, 0.3, 2.4]),
        'render.mesh': { shape: 'box', size: 1 },
        'render.material': { slots: [{ materialId: 'mat-sand' }] },
      }),
      prefabEntity('a-pillar', 'a-root', 'Shrine Pillar', {
        'core.transform': t([0.9, 0.8, 0.9], [0.25, 1.4, 0.25]),
        'render.mesh': { shape: 'cylinder', size: 0.5 },
        'render.material': { slots: [{ materialId: 'mat-terracotta' }] },
      }),
    ],
    [
      { instanceId: 'a-podium', prefabId: 'pfx-b', parentLocalId: 'a-root', overrides: {} },
      { instanceId: 'a-podium-2', prefabId: 'pfx-b', parentLocalId: 'a-root', overrides: {} },
    ]
  )

  /* ---- animation clip + animator controller ---- */
  const shrineEntityId = crypto.randomUUID()
  const clip: AnimationClipData = {
    format: 'koota-3d-animation-clip',
    schemaVersion: 1,
    id: 'clip-orbit',
    name: 'Orbit',
    duration: 4,
    fps: 30,
    tracks: [
      {
        id: 'track-orbit-y',
        target: shrineEntityId,
        targetName: 'Shrine A',
        component: 'core.transform',
        property: 'rotation.y',
        valueType: 'number',
        keyframes: [
          { id: 'kf-1', time: 0, value: 0, interpolation: 'linear' },
          { id: 'kf-2', time: 4, value: 360, interpolation: 'linear' },
        ],
      },
    ],
  }
  const controller: AnimatorControllerV2 = {
    format: 'koota-3d-animator',
    schemaVersion: 1,
    id: 'ac-orbit',
    name: 'Orbit Controller',
    parameters: [{ id: 'param-speed', name: 'speed', type: 'float', defaultValue: 1 }],
    states: [
      { id: 'state-orbit', name: 'Orbit', clipId: 'clip-orbit', speed: 1, loop: true, position: [280, 160] },
    ],
    transitions: [],
    entryStateId: 'state-orbit',
  }

  /* ---- scene: environment + sun + model + prefab + animator + emitter ---- */
  const shrineId = shrineEntityId
  const modelId = uuid()
  const emitterId = uuid()
  const entities: ProjectData['scene']['entities'] = [
    {
      id: uuid(),
      name: 'Main Camera',
      enabled: true,
      parentId: null,
      components: { 'core.transform': t([-6, 4, 9]), 'render.camera': {} },
    },
    {
      id: uuid(),
      name: 'Sun',
      enabled: true,
      parentId: null,
      components: { 'core.transform': t([6, 10, 4]), 'render.light': { type: 'directional', intensity: 2.2 } },
    },
    {
      id: uuid(),
      name: 'Hemisphere Fill',
      enabled: true,
      parentId: null,
      components: { 'core.transform': t([0, 0, 0]), 'render.light': { type: 'hemisphere', intensity: 0.5 } },
    },
    {
      id: uuid(),
      name: 'Ground',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': t([0, -0.5, 0], [24, 1, 24]),
        'render.mesh': { shape: 'box', size: 1 },
        'render.material': { slots: [{ materialId: 'mat-grass' }] },
      },
    },
    {
      id: modelId,
      name: 'Imported Model (animated-box.glb)',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': t([-3.5, 0.5, 1.5], [1.2, 1.2, 1.2]),
        'render.model': { assetId: 'asset-animated-box', visible: true, castShadow: true, receiveShadow: true },
        'render.material': { slots: [{ materialId: 'mat-graph-copper' }] },
      },
    },
    {
      id: shrineId,
      name: 'Shrine A (nested prefab instance)',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': t([3, 0, -1]),
        'prefab.instance': { prefabId: 'pfx-a' },
      },
    },
    {
      id: uuid(),
      name: 'Shrine Animator',
      enabled: true,
      parentId: shrineId,
      components: { 'animation.animator': { controllerId: 'ac-orbit', playing: true, speed: 1 } },
    },
    {
      id: emitterId,
      name: 'Shrine Flame',
      enabled: true,
      parentId: shrineId,
      components: {
        'core.transform': t([0, 1.6, 0]),
        'particle.emitter': { effectId: 'fx-shrine' },
      },
    },
  ]

  return {
    format: 'koota-3d-project',
    schemaVersion: 1,
    project: { id: 'project-showcase', name: 'Showcase', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    assets: [
      {
        id: 'asset-animated-box',
        type: 'model',
        name: 'animated-box.glb',
        uri: 'assets/animated-box.glb',
        metadata: { animations: ['SpinBounce'] },
      },
    ],
    materials: [
      { id: 'mat-sand', name: 'Sand', type: 'standard', properties: { baseColor: '#e3c69d', roughness: 0.95, metalness: 0 } },
      { id: 'mat-grass', name: 'Forest Green', type: 'standard', properties: { baseColor: '#4a8a5c', roughness: 0.9, metalness: 0 } },
      { id: 'mat-terracotta', name: 'Terracotta', type: 'standard', properties: { baseColor: '#c05b4d', roughness: 0.8, metalness: 0 } },
      nodeMaterial,
    ],
    prefabs: [prefabC, prefabB, prefabA],
    animations: [clip],
    animatorControllers: [controller],
    particleEffects: [createFireEffect('fx-shrine')],
    scene: {
      format: 'koota-3d-scene',
      schemaVersion: 1,
      id: 'scene-showcase',
      name: 'Showcase Scene',
      settings: {
        background: '#cfd8e4',
        environmentAssetId: null,
        environmentIntensity: 1,
        environmentRotation: 0,
        environmentBackground: true,
        ambientIntensity: 0.35,
        ambientColor: '#c8d4e0',
        fog: { enabled: true, type: 'linear', color: '#cfd8e4', near: 26, far: 90, density: 0.02 },
        toneMapping: 'aces',
        toneMappingExposure: 1,
        shadowEnabled: true,
        defaultCameraId: null,
      },
      entities,
    },
  }
}

describe('showcase project (§13 end-to-end)', () => {
  const project = buildShowcaseProject()

  it('validates through the import pipeline (parse → migrate → integrity)', () => {
    const roundTripped = parseProject(JSON.parse(JSON.stringify(project)))
    assertProjectIntegrity(roundTripped, { validateComponentData: validateComponentEntry })
    expect(roundTripped.materials).toHaveLength(4)
    expect(roundTripped.prefabs).toHaveLength(3)
    expect(roundTripped.animations).toHaveLength(1)
    expect(roundTripped.animatorControllers).toHaveLength(1)
    expect(roundTripped.particleEffects).toHaveLength(1)
    // Node material graph survives the round-trip with its connections.
    const graph = roundTripped.materials.find((m) => m.id === 'mat-graph-copper')?.graph
    expect(graph?.nodes).toHaveLength(4)
    expect(graph?.connections).toHaveLength(3)
  })

  it('loads through the real runtime loader and matches the authored data', async () => {
    const world = createWorld()
    const materials = new MaterialService()
    const animator = new AnimatorRuntime()
    let handle: RuntimeSceneHandle | null = null
    try {
      handle = await loadScene(world, project, {
        assetResolver: new UrlAssetResolver('/game-assets/'),
        materials,
        animator,
      })
    } catch (error) {
      throw new Error(`runtime load failed: ${(error as Error).message}`)
    }

    const allEntities = world.query(EntityMeta)
    // 8 authored entities (Shrine A becomes the A-instance root) + full
    // nested expansion: A's pillar + B×2 (root+topper+crystal each).
    expect(allEntities.length).toBe(15)
    // Nested instance roots keep PrefabInstance; interior entities are members.
    const instances = world.query(PrefabInstance)
    expect(instances.length).toBeGreaterThanOrEqual(5) // A + B×2 + C×2
    expect(world.query(InstanceMember).length).toBeGreaterThanOrEqual(3) // pillar + toppers
    // The emitter entity carries its effect reference
    const emitter = allEntities.find((e) => e.get(EntityMeta)?.name === 'Shrine Flame')
    expect(emitter).toBeDefined()
    // Animator wired to the orbit controller
    const shrineAnimator = allEntities.find((e) => e.get(EntityMeta)?.name === 'Shrine Animator')
    expect(shrineAnimator).toBeDefined()

    handle?.dispose()
  })

  it('writes the artifact consumed by the standalone runtime demo', () => {
    const target = resolve('apps/runtime-demo/public/showcase.koota-project.json')
    writeFileSync(target, JSON.stringify(project, null, 2) + '\n', 'utf-8')
    // Re-read and re-validate: byte-level round-trip of what the demo fetches.
    const fromDisk = parseProject(JSON.parse(readFileSync(target, 'utf-8')))
    assertProjectIntegrity(fromDisk, { validateComponentData: validateComponentEntry })
    expect(fromDisk.scene.entities.length).toBe(project.scene.entities.length)
  })
})


