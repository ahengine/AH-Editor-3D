/**
 * Migration runner shared by every domain.
 *
 * A domain's `migrations[fromVersion]` receives data authored in
 * `fromVersion` and must return data valid for `fromVersion + 1`. The runner
 * walks the chain until the data reaches `currentVersion`.
 */

/**
 * A migration receives the parsed JSON of one schema version and returns the
 * same document upgraded by exactly one version. Bodies are untyped by
 * design: they operate on historical shapes only this function knows.
 */
export type Migration = (data: Record<string, unknown>) => Record<string, unknown>

export class UnsupportedSchemaVersionError extends Error {
  constructor(
    public readonly foundVersion: number,
    public readonly supportedVersion: number,
    public readonly domain: string
  ) {
    super(
      `${domain} schema version ${foundVersion} is not supported. This build supports versions 1 through ${supportedVersion}.`
    )
    this.name = 'UnsupportedSchemaVersionError'
  }
}

export function runMigrations<T extends { schemaVersion: number }>(
  domain: string,
  data: T,
  migrations: Record<number, Migration>,
  currentVersion: number
): T {
  let current = data
  while (current.schemaVersion < currentVersion) {
    const step = migrations[current.schemaVersion]
    if (!step) {
      throw new UnsupportedSchemaVersionError(current.schemaVersion, currentVersion, domain)
    }
    current = step(structuredClone(current) as unknown as Record<string, unknown>) as unknown as T
    current.schemaVersion = current.schemaVersion + 1
  }
  if (current.schemaVersion > currentVersion) {
    throw new UnsupportedSchemaVersionError(current.schemaVersion, currentVersion, domain)
  }
  return current
}
