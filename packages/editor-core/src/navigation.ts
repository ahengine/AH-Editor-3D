import { serializeSceneEntities } from '@ahengine/ecs-runtime'
import { validateProjectIntegrity } from '@ahengine/project-schema'
import { buildProjectData } from './project.js'
import { useEditorStore, type EditorProblem, type EditorSelection } from './store.js'

/**
 * Cross-editor navigation. One typed entry point routes any document object
 * (asset, material, prefab, clip, controller, particle effect, entity) to the
 * workspace that edits it, remembers where the user came from, and powers
 * deep links from the Inspector, asset browser double-click, problems panel
 * and the command palette.
 */

/** Open a document object in the workspace that authors it. */
export function openAsset(selection: EditorSelection, options?: { from?: boolean }): void {
  const store = useEditorStore.getState()
  const previous = store.workspace
  const from = options?.from ?? true

  switch (selection.kind) {
    case 'entity': {
      store.setWorkspace('scene')
      store.select([selection.id])
      store.setSidebarTab('scene')
      break
    }
    case 'asset': {
      const asset = store.assets.find((a) => a.id === selection.id)
      if (asset?.type === 'environment') {
        store.setWorkspace('scene')
        store.setInspectorTab('inspector')
        store.notify('info', `${asset.name} — assign it in Scene → Environment`)
      } else if (asset?.type === 'material') {
        openMaterial(selection.id)
      } else {
        store.setWorkspace('scene')
        store.notify('info', `${asset?.name ?? 'Asset'} — drag it into the viewport to place`)
      }
      break
    }
    case 'material':
      openMaterial(selection.id)
      break
    case 'prefab':
      store.setActivePrefabId(selection.id)
      store.setWorkspace('prefab')
      store.setBottomTab('prefab', 'structure')
      break
    case 'clip':
      store.setActiveClipId(selection.id)
      store.setWorkspace('animation')
      store.setBottomTab('animation', 'timeline')
      break
    case 'controller':
      store.setEditingController(selection.id)
      store.setWorkspace('animation')
      store.setBottomTab('animation', 'animator')
      break
    case 'particleEffect':
      store.setActiveParticleId(selection.id)
      store.setWorkspace('particle')
      break
  }

  const next = useEditorStore.getState()
  if (from && next.workspace !== previous) next.setReturnWorkspace(previous)
  next.setSelectionFocus(selection)
}

function openMaterial(id: string): void {
  const store = useEditorStore.getState()
  store.setEditingMaterial(id)
  store.setWorkspace('material')
  store.setBottomTab('material', 'graph')
}

/** Return to the workspace an openAsset navigation departed from. */
export function returnFromDocument(): void {
  const store = useEditorStore.getState()
  if (store.returnWorkspace) {
    store.setWorkspace(store.returnWorkspace)
    store.setReturnWorkspace(null)
  } else {
    store.setWorkspace('scene')
  }
}

/* ------------------------------------------------------------------ */
/* Problems — unified validation surface                               */
/* ------------------------------------------------------------------ */

/**
 * Runs project-wide integrity validation over the CURRENT editor state and
 * maps every issue to a navigable problem. Pure read — safe to call anywhere.
 */
export function collectProblems(): EditorProblem[] {
  let project: ReturnType<typeof buildProjectData>
  try {
    project = buildProjectData()
  } catch (error) {
    return [
      {
        id: 'build',
        severity: 'error',
        message: `Project failed to serialize: ${(error as Error).message}`,
        doc: 'scene',
      },
    ]
  }

  const problems: EditorProblem[] = []
  for (const issue of validateProjectIntegrity(project)) {
    problems.push({
      id: issue.path + ':' + issue.message,
      severity: 'error',
      message: `${issue.path} — ${issue.message}`,
      doc: docForPath(issue.path),
      target: targetForPath(issue.path, project),
    })
  }

  // Live checks that the static project snapshot cannot see.
  for (const clip of project.animations ?? []) {
    if (clip.tracks.length === 0) {
      problems.push({
        id: `clip-empty:${clip.id}`,
        severity: 'warning',
        message: `Animation clip "${clip.name}" has no tracks`,
        doc: 'animation',
        target: { kind: 'clip', id: clip.id },
      })
    }
  }
  for (const controller of project.animatorControllers) {
    if (controller.states.length === 0) {
      problems.push({
        id: `ctrl-empty:${controller.id}`,
        severity: 'warning',
        message: `Animator controller "${controller.name}" has no states`,
        doc: 'animation',
        target: { kind: 'controller', id: controller.id },
      })
    }
  }
  for (const effect of project.particleEffects ?? []) {
    if (effect.emission?.enabled && effect.emission.rate === 0) {
      problems.push({
        id: `fx-zero:${effect.id}`,
        severity: 'warning',
        message: `Particle effect "${effect.name}" emits 0 particles/sec`,
        doc: 'particle',
        target: { kind: 'particleEffect', id: effect.id },
      })
    }
  }
  return problems
}

function docForPath(path: string): EditorProblem['doc'] {
  if (path.startsWith('prefab')) return 'prefab'
  if (path.startsWith('animatorController')) return 'animation'
  if (path.startsWith('animationClip')) return 'animation'
  if (path.startsWith('particle')) return 'particle'
  return 'scene'
}

function targetForPath(
  path: string,
  project: ReturnType<typeof buildProjectData>
): EditorSelection | undefined {
  if (path.startsWith('scene → ')) {
    const name = path.split(' → ')[1]
    const entity = project.scene.entities.find((row) => row.name === name)
    if (entity) return { kind: 'entity', id: entity.id }
  }
  const quoted = path.match(/"([^"]+)"/)
  if (!quoted) return undefined
  const name = quoted[1]
  const prefab = project.prefabs.find((p) => p.name === name)
  if (prefab) return { kind: 'prefab', id: prefab.id }
  const controller = project.animatorControllers.find((c) => c.name === name)
  if (controller) return { kind: 'controller', id: controller.id }
  const clip = (project.animations ?? []).find((c) => c.name === name)
  if (clip) return { kind: 'clip', id: clip.id }
  const asset = project.assets.find((a) => a.name === name)
  if (asset) return { kind: 'asset', id: asset.id }
  return undefined
}

/** Re-validate and store; returns the fresh list. */
export function refreshProblems(): EditorProblem[] {
  const problems = collectProblems()
  useEditorStore.getState().setProblems(problems)
  return problems
}

/** Navigate to whatever a problem points at. */
export function focusProblem(problem: EditorProblem): void {
  if (problem.target) openAsset(problem.target, { from: false })
}

/** Entity names for palette/selection UIs — reads the live world. */
export function listSceneEntityNames(): { uuid: string; name: string }[] {
  const world = useEditorStore.getState().world
  return serializeSceneEntities(world).map((row) => ({ uuid: row.id, name: row.name }))
}
