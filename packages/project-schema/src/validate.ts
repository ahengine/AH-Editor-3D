import type { ZodType } from 'zod'
import {
  AnimatorControllerSchema,
  MaterialAssetSchema,
  MaterialDefinitionSchema,
  PrefabDefinitionSchema,
  ProjectDataSchema,
  SceneDataSchema,
} from './schema.js'
import { migrate } from './migrations.js'
import type {
  AnimatorController,
  MaterialAsset,
  MaterialDefinition,
  PrefabDefinition,
  ProjectData,
  SceneData,
} from './types.js'

export class ValidationError extends Error {
  constructor(
    public readonly issues: { path: string; message: string }[]
  ) {
    const first = issues[0]
    super(
      issues.length === 1
        ? `${first.path}: ${first.message}`
        : `${issues.length} validation errors — first: ${first.path}: ${first.message}`
    )
    this.name = 'ValidationError'
  }
}

function run<T>(schema: ZodType<T>, data: unknown, label: string): T {
  const raw = data as { schemaVersion?: number } | null
  const migrated =
    raw && typeof raw.schemaVersion === 'number' ? migrate(raw as { schemaVersion: number }) : raw
  const result = schema.safeParse(migrated)
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: `${label} → ${issue.path.map(String).join('.') || '(root)'}`,
      message: issue.message,
    }))
    throw new ValidationError(issues)
  }
  return result.data
}

/** Parse + migrate + validate arbitrary JSON into a ProjectData. Throws ValidationError. */
export function parseProject(data: unknown): ProjectData {
  return run(ProjectDataSchema, data, 'project')
}

export function parseScene(data: unknown): SceneData {
  return run(SceneDataSchema, data, 'scene')
}

export function parsePrefab(data: unknown): PrefabDefinition {
  return run(PrefabDefinitionSchema, data, 'prefab')
}

export function parseMaterialAsset(data: unknown): MaterialAsset {
  return run(MaterialAssetSchema, data, 'material-asset')
}

export function parseMaterial(data: unknown): MaterialDefinition {
  return run(MaterialDefinitionSchema, data, 'material')
}

export function parseAnimatorController(data: unknown): AnimatorController {
  return run(AnimatorControllerSchema, data, 'animator-controller')
}

/** Cross-reference checks that zod alone cannot express. Throws ValidationError. */
export function validateSceneIntegrity(scene: SceneData): void {
  const ids = new Set<string>()
  for (const entity of scene.entities) {
    if (ids.has(entity.id)) {
      throw new ValidationError([{ path: 'scene.entities', message: `Duplicate entity id ${entity.id}` }])
    }
    ids.add(entity.id)
  }
  for (const entity of scene.entities) {
    if (entity.parentId !== null && !ids.has(entity.parentId)) {
      throw new ValidationError([
        {
          path: `scene.entities.${entity.id}.parentId`,
          message: `References unknown entity UUID ${entity.parentId}`,
        },
      ])
    }
  }
  // Cycle guard — walk up from every entity, bail after visiting every node once.
  for (const entity of scene.entities) {
    const seen = new Set<string>()
    let cursor: string | null = entity.id
    while (cursor !== null) {
      if (seen.has(cursor)) {
        throw new ValidationError([
          { path: 'scene.entities', message: `Cyclic hierarchy involving ${cursor}` },
        ])
      }
      seen.add(cursor)
      cursor = scene.entities.find((e) => e.id === cursor)?.parentId ?? null
    }
  }
  if (scene.settings.defaultCameraId && !ids.has(scene.settings.defaultCameraId)) {
    throw new ValidationError([
      {
        path: 'scene.settings.defaultCameraId',
        message: `References unknown entity UUID ${scene.settings.defaultCameraId}`,
      },
    ])
  }
}
