import type { World } from 'koota'
import type { ProjectData, SceneData, AssetRecord, MaterialDefinition, AnimatorController } from '@ahengine/project-schema'
import { parseScene, validateSceneIntegrity } from '@ahengine/project-schema'
import { AnimatorRuntime } from './animation.js'
import { MaterialService } from './materials.js'
import { sharedAssetCache, type AssetResolver, type AssetCache } from './asset-cache.js'
import { deserializeScene, serializeScene } from './serialize.js'
import { ThreeObject } from './traits.js'
import { validateSceneComponents } from './registry.js'

/**
 * Runtime scene loader — the bridge every game uses. Editor packages are NOT
 * required; only koota + three + this package.
 */

export interface LoadSceneOptions {
  assetResolver?: AssetResolver
  materials?: () => Map<string, MaterialDefinition>
  controllers?: () => Map<string, AnimatorController>
  assetCache?: AssetCache
}

export interface RuntimeSceneHandle {
  entitiesById: Map<string, import('koota').Entity>
  rootEntities: import('koota').Entity[]
  materials: MaterialService
  animator: AnimatorRuntime
  dispose(): void
}

/** Registry-backed component validation failure. */
export class ValidationIssues extends Error {
  constructor(
    public readonly issues: { path: string; message: string }[]
  ) {
    super(
      issues.length === 1
        ? `${issues[0].path}: ${issues[0].message}`
        : `${issues.length} component validation errors — first: ${issues[0].path}: ${issues[0].message}`
    )
    this.name = 'ValidationIssues'
  }
}

/** Scene-only load (`.koota-scene.json`). Assets/materials referenced by id resolve through the provided lookups. */
export function loadScene(
  world: World,
  sceneInput: SceneData | ProjectData,
  options: LoadSceneOptions = {}
): RuntimeSceneHandle {
  const project = 'scene' in sceneInput && (sceneInput as ProjectData).format === 'koota-3d-project'
    ? (sceneInput as ProjectData)
    : undefined
  const rawScene: SceneData = project ? project.scene : (sceneInput as SceneData)
  const scene = parseScene(rawScene)
  validateSceneIntegrity(scene)
  const componentIssues = validateSceneComponents(scene.entities)
  if (componentIssues.length > 0) {
    throw new ValidationIssues(componentIssues)
  }

  const assets = new Map<string, AssetRecord>(
    (project?.assets ?? []).map((asset) => [asset.id, asset])
  )
  const materialDefs = new Map<string, MaterialDefinition>(
    (project?.materials ?? []).map((material) => [material.id, material])
  )
  const controllers = new Map<string, AnimatorController>(
    (project?.animatorControllers ?? []).map((controller) => [controller.id, controller])
  )

  const materials = new MaterialService(
    () => materialDefs,
    options.assetResolver,
    (id) => assets.get(id)
  )
  const cache = options.assetCache ?? sharedAssetCache
  const animator = new AnimatorRuntime(() => controllers, (modelAssetId) => {
    // Clips are registered by the renderer bridge when a GLTF finishes loading.
    const record = assets.get(modelAssetId)
    if (!record) return []
    void record
    const clips = modelAnimationRegistry.get(modelAssetId)
    return clips ?? []
  })

  const { entitiesById, rootEntities } = deserializeScene(world, scene.entities, project?.prefabs ?? [])

  return {
    entitiesById,
    rootEntities,
    materials,
    animator,
    dispose() {
      for (const entity of world.query(ThreeObject)) {
        const object = entity.get(ThreeObject)?.object
        if (object) animator.disposeObject(object)
      }
      materials.dispose()
      // ChildOf auto-destroy cascades — only destroy entities still alive.
      for (const entity of [...world.query(ThreeObject)]) {
        if (entity.isAlive()) entity.destroy()
      }
      for (const entity of [...entitiesById.values()]) {
        if (entity.isAlive()) entity.destroy()
      }
      void cache
    },
  }
}

/** modelAssetId → clips, filled by the render bridge after GLTF load. */
export const modelAnimationRegistry = new Map<string, import('three').AnimationClip[]>()

/** Serializes a live runtime world back into scene data (used by Play Mode and autosave). */
export { serializeScene }
