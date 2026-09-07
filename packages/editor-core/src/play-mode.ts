import { createWorld } from 'koota'
import { loadScene, type RuntimeSceneHandle } from '@ahengine/ecs-runtime'
import { useEditorStore } from './store.js'
import { assetResolver } from './services.js'
import { buildProjectData } from './project.js'

/**
 * Play Mode: serialize the authored world → temporary runtime world → play.
 * Stopping discards the runtime world; authored data is never mutated.
 */

let activeHandle: RuntimeSceneHandle | null = null

export function enterPlayMode(): void {
  const store = useEditorStore.getState()
  if (store.playMode !== 'edit') return
  const data = buildProjectData()
  const world = createWorld()
  try {
    activeHandle = loadScene(world, data, { assetResolver })
  } catch (error) {
    store.notify('error', `Play mode failed: ${(error as Error).message}`)
    return
  }
  store.setPlayMode('play', world)
}

export function pausePlayMode(): void {
  const store = useEditorStore.getState()
  if (store.playMode === 'play') store.setPlayMode('paused', store.playWorld)
}

export function resumePlayMode(): void {
  const store = useEditorStore.getState()
  if (store.playMode === 'paused') store.setPlayMode('play', store.playWorld)
}

export function stopPlayMode(): void {
  const store = useEditorStore.getState()
  if (store.playMode === 'edit') return
  activeHandle?.dispose()
  activeHandle = null
  store.setPlayMode('edit', null)
  store.select([])
}

export function getPlayHandle(): RuntimeSceneHandle | null {
  return activeHandle
}
