import { create } from 'zustand'
import { createWorld, type World } from 'koota'
import type {
  AnimatorController,
  AssetRecord,
  MaterialDefinition,
  PrefabDefinition,
  SceneSettings,
} from '@ahengine/project-schema'
import { componentRegistry, EntityMeta, InstanceMember, PrefabInstance } from '@ahengine/ecs-runtime'

export type ToolMode = 'select' | 'translate' | 'rotate' | 'scale'
export type TransformSpace = 'local' | 'world'
export type PlayMode = 'edit' | 'play' | 'paused'
export type SidebarTab = 'scene' | 'assets'
export type InspectorTab = 'inspector' | 'library'
export type TimelineTab = 'timeline' | 'controller'
export type EditorMode = 'scene' | 'animate' | 'render'
/** @deprecated legacy bottom dock tab (Materials/Animator moved into Inspector/Timeline) */
export type BottomTab = 'assets' | 'materials' | 'animator'

export interface EditorNotification {
  id: number
  kind: 'error' | 'info' | 'success'
  message: string
}

export interface EditorStore {
  world: World
  /** world rendered while in play mode (runtime world), else null */
  playWorld: World | null
  playMode: PlayMode
  backend: 'webgpu' | 'webgl2' | 'initializing'

  projectId: string
  projectName: string
  projectCreatedAt: string
  sceneId: string
  sceneName: string
  sceneSettings: SceneSettings
  dirty: boolean

  assets: AssetRecord[]
  materials: MaterialDefinition[]
  prefabs: PrefabDefinition[]
  controllers: AnimatorController[]

  selection: string[]
  hovered: string | null
  tool: ToolMode
  space: TransformSpace
  snapEnabled: boolean
  snapTranslate: number
  snapRotateDeg: number

  bottomTab: BottomTab
  bottomPanelOpen: boolean
  editingMaterialId: string | null
  editingControllerId: string | null
  diagnosticsOpen: boolean
  /** animator transport targets the selected entity */
  animatorPreviewUuid: string | null

  sidebarTab: SidebarTab
  inspectorTab: InspectorTab
  timelineTab: TimelineTab
  editorMode: EditorMode
  gridVisible: boolean
  /** Canvas resolution scale (1 = 100%). */
  viewportScale: number

  clipboardEntity: import('@ahengine/project-schema').SerializedEntity[] | null
  clipboardComponent: { componentId: string; data: Record<string, unknown> } | null

  /** bumped on any structural world change (spawn/destroy/component add/remove/rename) */
  worldVersion: number

  undoDepth: number
  redoDepth: number
  notifications: EditorNotification[]

  setBackend(backend: EditorStore['backend']): void
  setProjectMeta(id: string, name: string, sceneId: string, sceneName: string): void
  setProjectCreatedAt(createdAt: string): void
  setSceneSettings(settings: SceneSettings): void
  setAssets(assets: AssetRecord[]): void
  setMaterials(materials: MaterialDefinition[]): void
  setPrefabs(prefabs: PrefabDefinition[]): void
  setControllers(controllers: AnimatorController[]): void
  setDirty(dirty: boolean): void
  select(uuids: string[]): void
  setHovered(uuid: string | null): void
  setTool(tool: ToolMode): void
  setSpace(space: TransformSpace): void
  setSnap(enabled: boolean): void
  setBottomTab(tab: BottomTab): void
  setBottomPanelOpen(open: boolean): void
  setEditingMaterial(id: string | null): void
  setEditingController(id: string | null): void
  setDiagnosticsOpen(open: boolean): void
  setAnimatorPreview(uuid: string | null): void
  setSidebarTab(tab: SidebarTab): void
  setInspectorTab(tab: InspectorTab): void
  setTimelineTab(tab: TimelineTab): void
  setEditorMode(mode: EditorMode): void
  setGridVisible(visible: boolean): void
  setViewportScale(scale: number): void
  setPlayMode(mode: PlayMode, playWorld: World | null): void
  setClipboardEntity(data: EditorStore['clipboardEntity']): void
  setClipboardComponent(data: EditorStore['clipboardComponent']): void
  bumpWorld(): void
  setCommandDepths(undo: number, redo: number): void
  notify(kind: EditorNotification['kind'], message: string): void
  dismissNotification(id: number): void
}

export const useEditorStore = create<EditorStore>((set) => ({
  world: createWorld(),
  playWorld: null,
  playMode: 'edit',
  backend: 'initializing',

  projectId: 'project-untitled',
  projectName: 'Untitled Project',
  projectCreatedAt: new Date().toISOString(),
  sceneId: 'main',
  sceneName: 'Main Scene',
  sceneSettings: defaultSceneSettings(),
  dirty: false,

  assets: [],
  materials: [],
  prefabs: [],
  controllers: [],

  selection: [],
  hovered: null,
  tool: 'translate',
  space: 'local',
  snapEnabled: false,
  snapTranslate: 0.5,
  snapRotateDeg: 15,

  bottomTab: 'assets',
  bottomPanelOpen: true,
  editingMaterialId: null,
  editingControllerId: null,
  diagnosticsOpen: false,
  animatorPreviewUuid: null,

  sidebarTab: 'scene',
  inspectorTab: 'inspector',
  timelineTab: 'timeline',
  editorMode: 'scene',
  gridVisible: true,
  viewportScale: 1,

  clipboardEntity: null,
  clipboardComponent: null,

  worldVersion: 0,
  undoDepth: 0,
  redoDepth: 0,
  notifications: [],

  setBackend: (backend) => set({ backend }),
  setProjectMeta: (projectId, projectName, sceneId, sceneName) =>
    set({ projectId, projectName, sceneId, sceneName, dirty: true }),
  setProjectCreatedAt: (projectCreatedAt) => set({ projectCreatedAt }),
  setSceneSettings: (sceneSettings) => set({ sceneSettings, dirty: true }),
  setAssets: (assets) => set({ assets, dirty: true }),
  setMaterials: (materials) => set({ materials, dirty: true }),
  setPrefabs: (prefabs) => set({ prefabs, dirty: true }),
  setControllers: (controllers) => set({ controllers, dirty: true }),
  setDirty: (dirty) => set({ dirty }),
  select: (selection) => set({ selection }),
  setHovered: (hovered) => set({ hovered }),
  setTool: (tool) => set({ tool }),
  setSpace: (space) => set({ space }),
  setSnap: (snapEnabled) => set({ snapEnabled }),
  setBottomTab: (bottomTab) => set({ bottomTab, bottomPanelOpen: true }),
  setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
  setEditingMaterial: (editingMaterialId) =>
    set({ editingMaterialId, bottomTab: 'materials', bottomPanelOpen: true }),
  setEditingController: (editingControllerId) =>
    set({ editingControllerId, bottomTab: 'animator', bottomPanelOpen: true }),
  setDiagnosticsOpen: (diagnosticsOpen) => set({ diagnosticsOpen }),
  setAnimatorPreview: (animatorPreviewUuid) => set({ animatorPreviewUuid }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setTimelineTab: (timelineTab) => set({ timelineTab }),
  setEditorMode: (editorMode) => set({ editorMode }),
  setGridVisible: (gridVisible) => set({ gridVisible }),
  setViewportScale: (viewportScale) => set({ viewportScale }),
  setPlayMode: (playMode, playWorld) => set({ playMode, playWorld }),
  setClipboardEntity: (clipboardEntity) => set({ clipboardEntity }),
  setClipboardComponent: (clipboardComponent) => set({ clipboardComponent }),
  bumpWorld: () => set((state) => ({ worldVersion: state.worldVersion + 1, dirty: true })),
  setCommandDepths: (undoDepth, redoDepth) => set({ undoDepth, redoDepth }),
  notify: (kind, message) =>
    set((state) => ({
      notifications: [...state.notifications, { id: Date.now() + Math.random(), kind, message }].slice(-5),
    })),
  dismissNotification: (id) =>
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
}))

export function defaultSceneSettings(): SceneSettings {
  return {
    background: '#dfe3ea',
    environmentAssetId: null,
    environmentIntensity: 1,
    fog: { enabled: true, type: 'linear', color: '#dfe3ea', near: 22, far: 85, density: 0.02 },
    toneMapping: 'aces',
    toneMappingExposure: 1,
    shadowEnabled: true,
    defaultCameraId: null,
  }
}

/** Wire koota world events → store version bumps for React structural reactivity. */
export function bindWorldReactivity(world: World): () => void {
  const { bumpWorld } = useEditorStore.getState()
  const unsubs: (() => void)[] = []
  for (const def of componentRegistry) {
    unsubs.push(world.onAdd(def.trait, bumpWorld))
    unsubs.push(world.onRemove(def.trait, bumpWorld))
  }
  // Structural bookkeeping traits also affect the hierarchy / inspector.
  for (const trait of [EntityMeta, InstanceMember, PrefabInstance]) {
    unsubs.push(world.onAdd(trait, bumpWorld))
    unsubs.push(world.onRemove(trait, bumpWorld))
  }
  // Renames and enable toggles must refresh the hierarchy without per-frame costs.
  unsubs.push(world.onChange(EntityMeta, bumpWorld))
  return () => unsubs.forEach((fn) => fn())
}
