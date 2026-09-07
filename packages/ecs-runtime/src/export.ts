import type {
  ProjectData,
  SceneData,
  MaterialDefinition,
  PrefabDefinition,
  AnimationClipData,
  AnimatorControllerV2,
  ParticleEffectData,
} from '@ahengine/project-schema'

/**
 * Runtime export helpers — generate clean, standalone JSON files for each
 * authoring domain. These are pure data transformations with no editor
 * dependencies. The editor calls these; the runtime never does (it only loads).
 */

export const EXPORT_EXTENSIONS = {
  project: '.koota-project.json',
  scene: '.koota-scene.json',
  material: '.koota-material.json',
  prefab: '.koota-prefab.json',
  animation: '.koota-animation.json',
  animator: '.koota-animator.json',
  particle: '.koota-particle.json',
} as const

export function exportProject(data: ProjectData): string {
  return JSON.stringify(data, null, 2)
}

export function exportScene(data: SceneData): string {
  return JSON.stringify(data, null, 2)
}

export function exportMaterial(data: MaterialDefinition): string {
  return JSON.stringify(
    { format: 'koota-3d-material', schemaVersion: 1, material: data },
    null,
    2
  )
}

export function exportPrefab(data: PrefabDefinition): string {
  return JSON.stringify(data, null, 2)
}

export function exportAnimationClip(data: AnimationClipData): string {
  return JSON.stringify(data, null, 2)
}

export function exportAnimatorController(data: AnimatorControllerV2): string {
  return JSON.stringify(data, null, 2)
}

export function exportParticleEffect(data: ParticleEffectData): string {
  return JSON.stringify(data, null, 2)
}

/** Triggers a browser download for any export. */
export function downloadJson(json: string, fileName: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}
