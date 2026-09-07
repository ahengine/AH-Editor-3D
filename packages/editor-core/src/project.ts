import { createWorld } from 'koota'
import type { MaterialDefinition, ProjectData, SceneData, SerializedEntity } from '@ahengine/project-schema'
import {
  CURRENT_SCHEMA_VERSION,
  PROJECT_FORMAT,
  SCENE_FORMAT,
  assertProjectIntegrity,
  parseProject,
  validateSceneIntegrity,
} from '@ahengine/project-schema'
import { validateComponentEntry } from '@ahengine/ecs-runtime'
import { EntityMeta, deserializeScene, serializeSceneEntities } from '@ahengine/ecs-runtime'
import { useEditorStore, bindWorldReactivity } from './store.js'
import { captureAllInstanceOverrides } from './prefab-ops.js'
import { getHostConfig, projectBackend } from './backend.js'
import { commandStack } from './commands.js'
/**
 * Project lifecycle: bootstrap the default stylized scene, load saved
 * projects, and serialize the live world back into durable JSON.
 */
let unbindReactivity: (() => void) | null = null
function resetWorld() {
  const store = useEditorStore.getState()
  // ChildOf auto-destroy cascades: children may already be dead when reached.
  for (const entity of [...store.world.query(EntityMeta)]) {
    if (entity.isAlive()) entity.destroy()
  }
  if (unbindReactivity) unbindReactivity()
  const world = createWorld()
  useEditorStore.setState({ world })
  unbindReactivity = bindWorldReactivity(world)
}
/** Loads a validated ProjectData into the editor (replaces current world). */
export function loadProject(project: ProjectData): void {
  resetWorld()
  const store = useEditorStore.getState()
  const scene = project.scene
  deserializeScene(store.world, scene.entities, project.prefabs)
  const cameraId = scene.settings.defaultCameraId
  const cameraValid =
    cameraId === null || scene.entities.some((entity) => entity.id === cameraId)
  useEditorStore.setState({
    projectId: project.project.id,
    projectName: project.project.name,
    projectCreatedAt: project.project.createdAt,
    sceneId: scene.id,
    sceneName: scene.name,
    sceneSettings: cameraValid ? scene.settings : { ...scene.settings, defaultCameraId: null },
    assets: project.assets ?? [],
    materials: project.materials ?? [],
    prefabs: project.prefabs ?? [],
    controllers: project.animatorControllers ?? [],
    animations: project.animations ?? [],
    particleEffects: project.particleEffects ?? [],
    selection: [],
    dirty: false,
  })
  commandStack.clearForLoad()
}
/** Serializes the live editor world into a ProjectData (export product). */
export function buildProjectData(): ProjectData {
  captureAllInstanceOverrides()
  const store = useEditorStore.getState()
  const scene: SceneData = {
    format: SCENE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: store.sceneId,
    name: store.sceneName,
    settings: store.sceneSettings,
    entities: serializeSceneEntities(store.world),
  }
  const now = new Date().toISOString()
  return {
    format: PROJECT_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: {
      id: store.projectId,
      name: store.projectName,
      createdAt: store.projectCreatedAt,
      updatedAt: now,
    },
    scene,
    assets: store.assets,
    materials: store.materials,
    prefabs: store.prefabs,
    animations: store.animations,
    animatorControllers: store.controllers,
    particleEffects: store.particleEffects,
  }
}
/** Export a standalone scene file. */
export function buildSceneExport(): SceneData {
  captureAllInstanceOverrides()
  const store = useEditorStore.getState()
  return {
    format: SCENE_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: store.sceneId,
    name: store.sceneName,
    settings: store.sceneSettings,
    entities: serializeSceneEntities(store.world),
  }
}
/* ------------------------------------------------------------------ */
/* Save / Load / Import / Export                                       */
/* ------------------------------------------------------------------ */
export async function saveProject(): Promise<void> {
  const store = useEditorStore.getState()
  store.setSaveState('saving')
  const data = buildProjectData()
  try {
    await projectBackend.save(data)
  } catch (error) {
    useEditorStore.getState().setSaveState('unsaved')
    useEditorStore.getState().notify('error', `Save failed: ${(error as Error).message}`)
    return
  }
  useEditorStore.getState().setDirty(false)
  useEditorStore.getState().setSaveState('saved')
  const host = getHostConfig()
  useEditorStore
    .getState()
    .notify('success', host ? `Saved → ${host.projectFile}` : 'Project saved')
}

/** Debounced autosave — coalesces rapid dirty flags into one save (2s idle). */
let autosaveTimer: ReturnType<typeof setTimeout> | null = null
export function scheduleAutosave(): void {
  if (autosaveTimer) clearTimeout(autosaveTimer)
  autosaveTimer = setTimeout(() => {
    autosaveTimer = null
    if (useEditorStore.getState().dirty) void saveProject()
  }, 2000)
}

/** Save As: duplicate the project under a new name and switch to it. */
export async function saveProjectAs(newName: string): Promise<void> {
  const store = useEditorStore.getState()
  const data = buildProjectData()
  data.project.name = newName
  data.project.id = `project-${crypto.randomUUID().slice(0, 8)}`
  store.setProjectMeta(data.project.id, newName, store.sceneId, store.sceneName)
  store.setSaveState('saving')
  try {
    await projectBackend.save(data)
  } catch (error) {
    useEditorStore.getState().setSaveState('unsaved')
    useEditorStore.getState().notify('error', `Save As failed: ${(error as Error).message}`)
    return
  }
  useEditorStore.getState().setDirty(false)
  useEditorStore.getState().setSaveState('saved')
  useEditorStore.getState().notify('success', `Saved as "${newName}"`)
}
export async function openSavedProject(): Promise<boolean> {
  let saved: ProjectData | null = null
  try {
    saved = await projectBackend.load()
  } catch (error) {
    useEditorStore
      .getState()
      .notify('error', `Project load failed: ${(error as Error).message}`)
    return false
  }
  if (!saved) return false
  try {
    const project = parseProject(saved)
    validateSceneIntegrity(project.scene, { validateComponentData: validateComponentEntry })
    assertProjectIntegrity(project, { validateComponentData: validateComponentEntry })
    loadProject(project)
    return true
  } catch (error) {
    useEditorStore
      .getState()
      .notify('error', `Saved project failed to load: ${(error as Error).message}`)
    return false
  }
}
export function importProjectJson(json: unknown): void {
  try {
    const project = parseProject(json)
    validateSceneIntegrity(project.scene, { validateComponentData: validateComponentEntry })
    assertProjectIntegrity(project, { validateComponentData: validateComponentEntry })
    loadProject(project)
    useEditorStore.getState().notify('success', `Project "${project.project.name}" imported`)
  } catch (error) {
    useEditorStore.getState().notify('error', `Import failed: ${(error as Error).message}`)
  }
}
export function exportProjectJson(): void {
  const data = buildProjectData()
  downloadJson(data, `${slugify(data.project.name)}.koota-project.json`)
}
export function exportSceneJson(): void {
  const scene = buildSceneExport()
  downloadJson(scene, `${slugify(useEditorStore.getState().sceneName)}.koota-scene.json`)
}
export function downloadJson(data: unknown, fileName: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'scene'
}
/* ------------------------------------------------------------------ */
/* Default project — bright stylized scene echoing the design concept  */
/* ------------------------------------------------------------------ */
export function bootstrapDefaultProject(): void {
  loadProject(createDefaultProject())
}
export function createDefaultProject(): ProjectData {
  const materials: MaterialDefinition[] = [
    {
      id: 'mat-sand',
      name: 'Sand',
      type: 'standard',
      properties: { baseColor: '#e3c69d', roughness: 0.95, metalness: 0 },
    },
    {
      id: 'mat-grass',
      name: 'Forest Green',
      type: 'standard',
      properties: { baseColor: '#4a8a5c', roughness: 0.9, metalness: 0 },
    },
    {
      id: 'mat-water',
      name: 'Water Blue',
      type: 'physical',
      properties: { baseColor: '#5b98de', roughness: 0.15, metalness: 0.1, opacity: 0.9, transparent: true },
    },
    {
      id: 'mat-terracotta',
      name: 'Terracotta',
      type: 'standard',
      properties: { baseColor: '#c05b4d', roughness: 0.8, metalness: 0 },
    },
    {
      id: 'mat-gold',
      name: 'Gold Accent',
      type: 'physical',
      properties: { baseColor: '#f3c940', roughness: 0.3, metalness: 0.9 },
    },
    {
      id: 'mat-trunk',
      name: 'Tree Trunk',
      type: 'standard',
      properties: { baseColor: '#7a5c42', roughness: 1, metalness: 0 },
    },
  ]
  const material = (id: string) => ({ slots: [{ materialId: id }] })
  const t = (position: [number, number, number], rotation?: [number, number, number], scale?: [number, number, number]) => ({
    position,
    rotation: rotation ?? [0, 0, 0],
    scale: scale ?? [1, 1, 1],
  })
  // Persistent contract: authored entities get real UUIDs (integrity-validated).
  const uuid = () => crypto.randomUUID()
  const cameraId = uuid()
  const tree = (x: number, z: number, s: number): SerializedEntity[] => {
    const root = uuid()
    const trunk = uuid()
    const leaves = uuid()
    return [
      {
        id: root,
        name: 'Tree',
        enabled: true,
        parentId: null,
        components: { 'core.transform': t([x, 0, z]) },
      },
      {
        id: trunk,
        name: 'Trunk',
        enabled: true,
        parentId: root,
        components: {
          'core.transform': t([0, 0.5 * s, 0], undefined, [0.5 * s, 1 * s, 0.5 * s]),
          'render.mesh': { shape: 'cylinder', size: 1, segments: 8 },
          'render.material': material('mat-trunk'),
        },
      },
      {
        id: leaves,
        name: 'Leaves',
        enabled: true,
        parentId: root,
        components: {
          'core.transform': t([0, 1.6 * s, 0], undefined, [1.6 * s, 2.2 * s, 1.6 * s]),
          'render.mesh': { shape: 'cone', size: 1, segments: 10 },
          'render.material': material('mat-grass'),
        },
      },
    ]
  }
  const entities: SerializedEntity[] = [
    {
      id: cameraId,
      name: 'Camera',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': t([7, 4.5, 9], [-12, 38, 0]),
        'render.camera': { fov: 55, near: 0.1, far: 300 },
      },
    },
    {
      id: uuid(),
      name: 'Sun',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': t([6, 9, 4], [-35, 25, 0]),
        'render.light': { type: 'directional', color: '#fff1d6', intensity: 2.4, castShadow: true },
      },
    },
    {
      id: uuid(),
      name: 'Sky Fill',
      enabled: true,
      parentId: null,
      components: { 'render.light': { type: 'hemisphere', color: '#dfe8f2', intensity: 0.7 } },
    },
    {
      id: uuid(),
      name: 'Ground',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': t([0, 0, 0]),
        'render.mesh': { shape: 'plane', size: 40, segments: 1 },
        'render.material': material('mat-sand'),
      },
    },
    {
      id: uuid(),
      name: 'Water',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': t([-5, 0.02, -4], undefined, [1.6, 1, 1.2]),
        'render.mesh': { shape: 'plane', size: 10, segments: 1 },
        'render.material': material('mat-water'),
      },
    },
    ...tree(3.5, -2.5, 1),
    ...tree(-2.2, 2.8, 1.3),
    ...tree(5.5, 3.2, 0.8),
    {
      id: uuid(),
      name: 'Cube',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': t([0, 0.5, 0]),
        'render.mesh': { shape: 'box', size: 1, segments: 1 },
        'render.material': material('mat-terracotta'),
      },
    },
    {
      id: uuid(),
      name: 'Sphere',
      enabled: true,
      parentId: null,
      components: {
        'core.transform': t([2.2, 0.6, 1.6]),
        'render.mesh': { shape: 'sphere', size: 1.2, segments: 24 },
        'render.material': material('mat-gold'),
      },
    },
  ]
  const now = new Date().toISOString()
  return {
    format: PROJECT_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    project: { id: `project-${crypto.randomUUID().slice(0, 8)}`, name: 'Stylized Island', createdAt: now, updatedAt: now },
    scene: {
      format: SCENE_FORMAT,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      id: 'main',
      name: 'Main Scene',
      settings: {
        background: '#dfe3ea',
        environmentAssetId: null,
        environmentIntensity: 1,
        fog: { enabled: true, type: 'linear', color: '#dfe3ea', near: 22, far: 85, density: 0.02 },
        toneMapping: 'aces',
        toneMappingExposure: 1,
        shadowEnabled: true,
        defaultCameraId: cameraId,
      },
      entities,
    },
    assets: [],
    materials,
    prefabs: [],
    animations: [],
    animatorControllers: [],
    particleEffects: [],
  }
}
