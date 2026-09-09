import { create } from 'zustand'
import { createWorld, type World } from 'koota'
import type { AnimationClipData as AnimationClipData, 
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
/** Authoring workspaces (product navigation). Lighting lives in Scene; Animator lives in Animation. */
export type WorkspaceId = 'scene' | 'prefab' | 'material' | 'animation' | 'particle'

/**
 * Undo / dirty documents. Each authoring surface owns its own history so
 * editing a material never pushes onto the scene's undo stack.
 */
export type DocId = 'scene' | 'prefab' | 'material' | 'animation' | 'particle'

export function docForWorkspace(workspace: WorkspaceId): DocId {
  switch (workspace) {
    case 'prefab':
      return 'prefab'
    case 'material':
      return 'material'
    case 'animation':
      return 'animation'
    case 'particle':
      return 'particle'
    default:
      return 'scene'
  }
}

/** Typed selection so any surface (viewport, problems panel, search) can focus any document object. */
export type SelectionKind =
  | 'entity'
  | 'asset'
  | 'material'
  | 'prefab'
  | 'clip'
  | 'controller'
  | 'particleEffect'

export interface EditorSelection {
  kind: SelectionKind
  id: string
}

export interface EditorProblem {
  id: string
  severity: 'error' | 'warning'
  message: string
  doc: DocId
  /** Navigation target when the problem can be focused. */
  target?: EditorSelection
}

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
  /** Which documents have unsaved changes (drives per-document indicators). */
  dirtyDocs: Record<DocId, boolean>
  /** Derived save indicator: 'saved' | 'saving' | 'unsaved' */
  saveState: 'saved' | 'saving' | 'unsaved'

  assets: AssetRecord[]
  materials: MaterialDefinition[]
  prefabs: PrefabDefinition[]
  controllers: AnimatorController[]
  animations: import('@ahengine/project-schema').AnimationClipData[]
  particleEffects: import('@ahengine/project-schema').ParticleEffectData[]

  selection: string[]
  /** Typed global selection (which document object is "open"), independent of multi-select. */
  selectionFocus: EditorSelection | null
  hovered: string | null
  tool: ToolMode
  space: TransformSpace
  snapEnabled: boolean
  snapTranslate: number
  snapRotateDeg: number
  snapScale: number

  bottomPanelOpen: boolean
  editingMaterialId: string | null
  editingControllerId: string | null
  diagnosticsOpen: boolean
  sceneSettingsOpen: boolean
  /** animator transport targets the selected entity */
  animatorPreviewUuid: string | null
  /** Per-workspace document being edited (prefab workspace context). */
  activePrefabId: string | null
  /** Active clip in the animation workspace. */
  activeClipId: string | null
  /** Active effect in the particle workspace. */
  activeParticleId: string | null
  /** Workspace to return to when leaving a document opened via openAsset. */
  returnWorkspace: WorkspaceId | null

  problems: EditorProblem[]
  problemsOpen: boolean
  paletteOpen: boolean

  sidebarTab: SidebarTab
  inspectorTab: InspectorTab
  workspace: WorkspaceId
  /** Active bottom context-panel tab per workspace (editor-only). */
  bottomTab: Record<WorkspaceId, string>
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
  setAnimations(animations: AnimationClipData[]): void
  setParticleEffects(effects: import('@ahengine/project-schema').ParticleEffectData[]): void
  setDirty(dirty: boolean): void
  /** Mark one document dirty (autosave + per-document indicators). */
  markDocDirty(doc: DocId): void
  setSaveState(state: 'saved' | 'saving' | 'unsaved'): void
  select(uuids: string[]): void
  setSelectionFocus(focus: EditorSelection | null): void
  setHovered(uuid: string | null): void
  setTool(tool: ToolMode): void
  setSpace(space: TransformSpace): void
  setSnap(enabled: boolean): void
  setBottomPanelOpen(open: boolean): void
  setEditingMaterial(id: string | null): void
  setEditingController(id: string | null): void
  setDiagnosticsOpen(open: boolean): void
  setSceneSettingsOpen(open: boolean): void
  setAnimatorPreview(uuid: string | null): void
  setActivePrefabId(id: string | null): void
  setActiveClipId(id: string | null): void
  setActiveParticleId(id: string | null): void
  setReturnWorkspace(workspace: WorkspaceId | null): void
  setProblems(problems: EditorProblem[]): void
  setProblemsOpen(open: boolean): void
  setPaletteOpen(open: boolean): void
  setSidebarTab(tab: SidebarTab): void
  setInspectorTab(tab: InspectorTab): void
  setWorkspace(workspace: WorkspaceId): void
  setBottomTab(workspace: WorkspaceId, tab: string): void
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

/* ------------------------------------------------------------------ */
/* Editor preferences — localStorage, never project data. Declared     */
/* before the store because initial state reads them.                  */
/* ------------------------------------------------------------------ */

const PREFS_KEY = 'ahengine.prefs.v1'

interface EditorPreferences {
  snapEnabled: boolean
  snapTranslate: number
  snapRotateDeg: number
  snapScale: number
  gridVisible: boolean
  viewportScale: number
}

const DEFAULT_PREFS: EditorPreferences = {
  snapEnabled: false,
  snapTranslate: 0.5,
  snapRotateDeg: 15,
  snapScale: 0.1,
  gridVisible: true,
  viewportScale: 1,
}

export function loadPreferences(): EditorPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<EditorPreferences>) }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePreferences(prefs: Partial<EditorPreferences>): void {
  try {
    const next = { ...loadPreferences(), ...prefs }
    localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — preferences stay session-only */
  }
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
  dirtyDocs: { scene: false, prefab: false, material: false, animation: false, particle: false },
  saveState: 'saved',

  assets: [],
  materials: [],
  prefabs: [],
  controllers: [],
  animations: [],
  particleEffects: [],

  selection: [],
  selectionFocus: null,
  hovered: null,
  tool: 'translate',
  space: 'local',

  bottomPanelOpen: true,
  editingMaterialId: null,
  editingControllerId: null,
  diagnosticsOpen: false,
  sceneSettingsOpen: false,
  animatorPreviewUuid: null,
  activePrefabId: null,
  activeClipId: null,
  activeParticleId: null,
  returnWorkspace: null,

  problems: [],
  problemsOpen: false,
  paletteOpen: false,

  sidebarTab: 'scene',
  inspectorTab: 'inspector',
  workspace: 'scene',
  bottomTab: { scene: 'assets', prefab: 'structure', material: 'graph', animation: 'timeline', particle: 'curves' },

  clipboardEntity: null,
  clipboardComponent: null,

  worldVersion: 0,
  undoDepth: 0,
  redoDepth: 0,
  notifications: [],

  ...loadPreferences(),

  setBackend: (backend) => set({ backend }),
  setProjectMeta: (projectId, projectName, sceneId, sceneName) =>
    set({ projectId, projectName, sceneId, sceneName, dirty: true }),
  setProjectCreatedAt: (projectCreatedAt) => set({ projectCreatedAt }),
  setSceneSettings: (sceneSettings) => set((state) => ({ sceneSettings, ...dirtyPatch(state, 'scene') })),
  setAssets: (assets) => set((state) => ({ assets, ...dirtyPatch(state, 'scene') })),
  setMaterials: (materials) => set((state) => ({ materials, ...dirtyPatch(state, 'material') })),
  setPrefabs: (prefabs) => set((state) => ({ prefabs, ...dirtyPatch(state, 'prefab') })),
  setControllers: (controllers) => set((state) => ({ controllers, ...dirtyPatch(state, 'animation') })),
  setAnimations: (animations) => set((state) => ({ animations, ...dirtyPatch(state, 'animation') })),
  setParticleEffects: (particleEffects) =>
    set((state) => ({ particleEffects, ...dirtyPatch(state, 'particle') })),
  setDirty: (dirty) =>
    set(
      dirty
        ? { dirty, saveState: 'unsaved' }
        : {
            dirty: false,
            saveState: 'saved',
            dirtyDocs: { scene: false, prefab: false, material: false, animation: false, particle: false },
          }
    ),
  markDocDirty: (doc) => set((state) => dirtyPatch(state, doc)),
  setSaveState: (saveState) => set({ saveState }),
  select: (selection) =>
    set({
      selection,
      // Single entity selection is the canonical focus; multi/clear yields none.
      selectionFocus: selection.length === 1 ? { kind: 'entity' as const, id: selection[0] } : null,
    }),
  setSelectionFocus: (selectionFocus) => set({ selectionFocus }),
  setHovered: (hovered) => set({ hovered }),
  setTool: (tool) => set({ tool }),
  setSpace: (space) => set({ space }),
  setSnap: (snapEnabled) => {
    savePreferences({ snapEnabled })
    set({ snapEnabled })
  },
  setBottomPanelOpen: (bottomPanelOpen) => set({ bottomPanelOpen }),
  setEditingMaterial: (editingMaterialId) =>
    set({ editingMaterialId, inspectorTab: 'library' }),
  setEditingController: (editingControllerId) =>
    set({ editingControllerId, workspace: 'animation' }),
  setDiagnosticsOpen: (diagnosticsOpen) => set({ diagnosticsOpen }),
  setSceneSettingsOpen: (sceneSettingsOpen) => set({ sceneSettingsOpen }),
  setAnimatorPreview: (animatorPreviewUuid) => set({ animatorPreviewUuid }),
  setActivePrefabId: (activePrefabId) => set({ activePrefabId }),
  setActiveClipId: (activeClipId) => set({ activeClipId }),
  setActiveParticleId: (activeParticleId) => set({ activeParticleId }),
  setReturnWorkspace: (returnWorkspace) => set({ returnWorkspace }),
  setProblems: (problems) => set({ problems }),
  setProblemsOpen: (problemsOpen) => set({ problemsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setSidebarTab: (sidebarTab) => set({ sidebarTab }),
  setInspectorTab: (inspectorTab) => set({ inspectorTab }),
  setWorkspace: (workspace) => set({ workspace }),
  setBottomTab: (workspace, tab) => set((state) => ({ bottomTab: { ...state.bottomTab, [workspace]: tab } })),
  setGridVisible: (gridVisible) => {
    savePreferences({ gridVisible })
    set({ gridVisible })
  },
  setViewportScale: (viewportScale) => {
    savePreferences({ viewportScale })
    set({ viewportScale })
  },
  setPlayMode: (playMode, playWorld) => set({ playMode, playWorld }),
  setClipboardEntity: (clipboardEntity) => set({ clipboardEntity }),
  setClipboardComponent: (clipboardComponent) => set({ clipboardComponent }),
  bumpWorld: () => set((state) => ({ worldVersion: state.worldVersion + 1, dirty: true, dirtyDocs: { ...state.dirtyDocs, scene: true } })),
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
    environmentRotation: 0,
    environmentBackground: true,
    ambientIntensity: 0,
    ambientColor: '#c8d4e0',
    fog: { enabled: true, type: 'linear', color: '#dfe3ea', near: 22, far: 85, density: 0.02 },
    toneMapping: 'aces',
    toneMappingExposure: 1,
    shadowEnabled: true,
    defaultCameraId: null,
  }
}

/* ------------------------------------------------------------------ */
/* Per-document dirty state                                            */
/* ------------------------------------------------------------------ */

function dirtyPatch(state: EditorStore, doc: DocId): Pick<EditorStore, 'dirty' | 'saveState' | 'dirtyDocs'> {
  return { dirty: true, saveState: 'unsaved', dirtyDocs: { ...state.dirtyDocs, [doc]: true } }
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
