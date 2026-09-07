import { CURRENT_SCHEMA_VERSION } from './types.js'
import type { ProjectData, SceneData } from './types.js'

/**
 * Schema migration infrastructure.
 *
 * `migrations[fromVersion]` receives data authored in `fromVersion` and must
 * return data valid for `fromVersion + 1`. `migrate` walks the chain until the
 * data reaches CURRENT_SCHEMA_VERSION.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations inherently operate on unknown historical shapes
export type Migration = (data: any) => any

export const migrations: Record<number, Migration> = {
  // v1 is the first version; future versions register e.g. `1: migrateV1ToV2`
}

export class UnsupportedSchemaVersionError extends Error {
  constructor(
    public readonly foundVersion: number,
    public readonly supportedVersion: number
  ) {
    super(
      `Schema version ${foundVersion} is not supported. This build supports versions 1 through ${supportedVersion}.`
    )
    this.name = 'UnsupportedSchemaVersionError'
  }
}

/** Returns migrated data (or the input when already current). Input is not mutated. */
export function migrate<T extends { schemaVersion: number }>(data: T): T {
  let current = data
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = migrations[current.schemaVersion]
    if (!step) {
      throw new UnsupportedSchemaVersionError(current.schemaVersion, CURRENT_SCHEMA_VERSION)
    }
    current = step(structuredClone(current))
    current.schemaVersion = current.schemaVersion + 1
  }
  if (current.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new UnsupportedSchemaVersionError(current.schemaVersion, CURRENT_SCHEMA_VERSION)
  }
  return current
}

export const migrateProject = migrate<ProjectData>
export const migrateScene = migrate<SceneData>
