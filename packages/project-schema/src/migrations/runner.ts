/**
 * Migration runner shared by every domain.
 *
 * A domain's `migrations[fromVersion]` receives data authored in
 * `fromVersion` and must return data valid for `fromVersion + 1`. The runner
 * walks the chain until the data reaches `currentVersion`.
 */

export type Migration = (data: any) => any
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- migrations inherently operate on unknown historical shapes

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
    current = step(structuredClone(current))
    current.schemaVersion = current.schemaVersion + 1
  }
  if (current.schemaVersion > currentVersion) {
    throw new UnsupportedSchemaVersionError(current.schemaVersion, currentVersion, domain)
  }
  return current
}
