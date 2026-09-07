/* Authoring-data contracts: domain schemas → per-domain migrations → validation.
 * Everything exported here is pure primitive data — no engine imports. */

export { CURRENT_SCHEMA_VERSION } from './versions.js'

export * from './schema/index.js'
export * from './migrations/index.js'
export * from './validation/index.js'
