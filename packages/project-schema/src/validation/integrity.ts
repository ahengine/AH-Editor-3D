import type { ProjectData, SceneData, SerializedEntity, PrefabDefinition, PrefabEntity } from '../schema/index.js'
import { isValidUUID } from '../schema/common.js'
import { ValidationIssue, ValidationError } from './errors.js'

/**
 * Cross-reference integrity — checks zod alone cannot express:
 * UUID shape, parent relations/cycles, unknown component ids (via callback),
 * asset/material/controller/prefab/particle reference existence, and the
 * prefab-internal entity graph.
 *
 * `validateComponentData` is supplied by the consumer (ecs-runtime registry)
 * so this module stays engine-free.
 */

export interface ComponentValidator {
  (componentId: string, data: unknown, entityPath: string): ValidationIssue[]
}

function checkEntityGraph(
  entities: SerializedEntity[],
  label: string,
  issues: ValidationIssue[]
): void {
  const ids = new Set<string>()
  for (const entity of entities) {
    if (!isValidUUID(entity.id)) {
      issues.push({ path: `${label} → ${entity.name || entity.id}`, message: `Invalid entity UUID "${entity.id}"` })
    }
    if (ids.has(entity.id)) {
      issues.push({ path: label, message: `Duplicate entity id ${entity.id}` })
    }
    ids.add(entity.id)
  }
  for (const entity of entities) {
    if (entity.parentId !== null && !ids.has(entity.parentId)) {
      issues.push({
        path: `${label} → ${entity.name}.parentId`,
        message: `References unknown entity UUID ${entity.parentId}`,
      })
    }
  }
  // Cycle guard — walk up from every entity, bail after visiting every node once.
  for (const entity of entities) {
    const seen = new Set<string>()
    let cursor: string | null = entity.id
    while (cursor !== null) {
      if (seen.has(cursor)) {
        issues.push({ path: label, message: `Cyclic hierarchy involving ${cursor}` })
        break
      }
      seen.add(cursor)
      cursor = entities.find((candidate) => candidate.id === cursor)?.parentId ?? null
    }
  }
}

function validateSceneEntities(
  entities: SerializedEntity[],
  label: string,
  validateComponentData: ComponentValidator | undefined,
  issues: ValidationIssue[]
): void {
  checkEntityGraph(entities, label, issues)
  for (const entity of entities) {
    for (const [componentId, data] of Object.entries(entity.components ?? {})) {
      if (validateComponentData) {
        issues.push(...validateComponentData(componentId, data, `${label} → ${entity.name} → ${componentId}`))
      }
    }
  }
}

/** Scene-level integrity (no project context — used for standalone scene files). */
export function validateSceneIntegrity(
  scene: SceneData,
  options?: { validateComponentData?: ComponentValidator }
): void {
  const issues: ValidationIssue[] = []
  validateSceneEntities(scene.entities, 'scene', options?.validateComponentData, issues)
  if (scene.settings.defaultCameraId && !scene.entities.some((entity) => entity.id === scene.settings.defaultCameraId)) {
    issues.push({
      path: 'scene.settings.defaultCameraId',
      message: `References unknown entity UUID ${scene.settings.defaultCameraId}`,
    })
  }
  if (issues.length > 0) throw new ValidationError(issues)
}

function validatePrefabInternal(prefab: PrefabDefinition, issues: ValidationIssue[]): void {
  const localIds = new Set<string>()
  for (const entity of prefab.entities) {
    localIds.add(entity.localId)
    if (entity.parentLocalId !== null && !localIds.has(entity.parentLocalId) &&
        !prefab.entities.some(e => e.localId === entity.parentLocalId)) {
      issues.push({
        path: `prefab "${prefab.name}" → ${entity.name || entity.localId}.parentLocalId`,
        message: `References unknown local entity "${entity.parentLocalId}"`,
      })
    }
  }
  if (!localIds.has(prefab.rootLocalEntityId)) {
    issues.push({
      path: `prefab "${prefab.name}".rootLocalEntityId`,
      message: `References unknown local entity "${prefab.rootLocalEntityId}"`,
    })
  }
  // Nested instances reference valid local parents
  for (const nested of prefab.nestedInstances ?? []) {
    if (nested.parentLocalId !== null && !localIds.has(nested.parentLocalId)) {
      issues.push({
        path: `prefab "${prefab.name}" → nested.${nested.instanceId}.parentLocalId`,
        message: `References unknown local entity "${nested.parentLocalId}"`,
      })
    }
  }
}

/** Full project integrity: scene graph + prefab graphs + every asset reference. */
export function validateProjectIntegrity(
  project: ProjectData,
  options?: { validateComponentData?: ComponentValidator }
): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  const assetIds = new Set(project.assets.map((asset) => asset.id))
  const materialIds = new Set(project.materials.map((material) => material.id))
  const prefabIds = new Set(project.prefabs.map((prefab) => prefab.id))
  const controllerIds = new Set(project.animatorControllers.map((controller) => controller.id))
  const clipIds = new Set((project.animations ?? []).map((clip) => clip.id))
  const particleIds = new Set((project.particleEffects ?? []).map((effect) => effect.id))

  validateSceneEntities(project.scene.entities, 'scene', options?.validateComponentData, issues)
  for (const prefab of project.prefabs) validatePrefabInternal(prefab, issues)

  // Environment reference.
  const environmentId = project.scene.settings.environmentAssetId
  if (environmentId && !assetIds.has(environmentId)) {
    issues.push({
      path: 'scene.settings.environmentAssetId',
      message: `References missing asset "${environmentId}"`,
    })
  }

  // Per-entity component references.
  for (const entity of project.scene.entities) {
    const label = `scene → ${entity.name}`
    const model = entity.components['render.model'] as { assetId?: string } | undefined
    if (model?.assetId && !assetIds.has(model.assetId)) {
      issues.push({ path: `${label} → render.model.assetId`, message: `References missing asset "${model.assetId}"` })
    }
    const materialRef = entity.components['render.material'] as
      | { slots?: { materialId: string | null }[] }
      | undefined
    for (const [index, slot] of (materialRef?.slots ?? []).entries()) {
      if (slot.materialId && !materialIds.has(slot.materialId)) {
        issues.push({
          path: `${label} → render.material.slots[${index}]`,
          message: `References missing material "${slot.materialId}"`,
        })
      }
    }
    const animator = entity.components['animation.animator'] as { controllerId?: string } | undefined
    if (animator?.controllerId && !controllerIds.has(animator.controllerId)) {
      issues.push({
        path: `${label} → animation.animator.controllerId`,
        message: `References missing animator controller "${animator.controllerId}"`,
      })
    }
    const particle = entity.components['particle.emitter'] as { effectId?: string } | undefined
    if (particle?.effectId && !particleIds.has(particle.effectId)) {
      issues.push({
        path: `${label} → particle.emitter.effectId`,
        message: `References missing particle effect "${particle.effectId}"`,
      })
    }
  }

  // Prefab instances point at existing prefab definitions.
  for (const entity of project.scene.entities) {
    const instance = entity.components['prefab.instance'] as { prefabId?: string } | undefined
    if (instance?.prefabId && !prefabIds.has(instance.prefabId)) {
      issues.push({
        path: `scene → ${entity.name} → prefab.instance.prefabId`,
        message: `References missing prefab "${instance.prefabId}"`,
      })
    }
  }

  // Animator controllers reference valid entry states.
  for (const controller of project.animatorControllers) {
    if (!controller.states.some((state) => state.id === controller.entryStateId)) {
      issues.push({
        path: `animatorController "${controller.name}".entryStateId`,
        message: `References unknown state "${controller.entryStateId}"`,
      })
    }
  }

  // Animation clip assets reference their source model.
  for (const clip of project.animations ?? []) {
    if (clip.sourceAssetId && !assetIds.has(clip.sourceAssetId)) {
      issues.push({
        path: `animationClip "${clip.name}".sourceAssetId`,
        message: `References missing asset "${clip.sourceAssetId}"`,
      })
    }
  }

  return issues
}

/** Throwing variant for import paths. */
export function assertProjectIntegrity(
  project: ProjectData,
  options?: { validateComponentData?: ComponentValidator }
): void {
  const issues = validateProjectIntegrity(project, options)
  if (issues.length > 0) throw new ValidationError(issues)
}
