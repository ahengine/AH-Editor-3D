import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, parseProject, parseScene, validateSceneIntegrity, migrateProject, migrateScene, UnsupportedSchemaVersionError } from '@ahengine/project-schema'
import { createDefaultProject, buildProjectData, loadProject } from '@ahengine/editor-core'
import { validateSceneComponents } from '@ahengine/ecs-runtime'

/* Serialization / deserialization / schema validation round trips. */

describe('project schema', () => {
  it('accepts the generated default project', () => {
    loadProject(createDefaultProject())
    const project = buildProjectData()
    const parsed = parseProject(JSON.parse(JSON.stringify(project)))
    expect(parsed.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(parsed.format).toBe('koota-3d-project')
  })

  it('rejects corrupt data with meaningful errors', () => {
    expect(() => parseScene({ format: 'koota-3d-scene', schemaVersion: 99, id: 'x', name: 'x', settings: null, entities: [] })).toThrow(
      /schema version 99 is not supported/i
    )
  })

  it('reports field-level validation errors', () => {
    const project = createDefaultProject()
    project.scene.entities[0].components['core.transform'] = { position: 'nope' } as never
    // Schema-level parse passes (components are open records); the registry
    // validator catches component-shape corruption.
    const issues = validateSceneComponents(project.scene.entities)
    expect(issues.length).toBeGreaterThan(0)
    expect(issues[0].message).toMatch(/invalid|expected/i)
  })

  it('flags unknown parent references', () => {
    const project = createDefaultProject()
    project.scene.entities[0].parentId = 'ghost-uuid'
    const parsed = parseProject(project)
    expect(() => validateSceneIntegrity(parsed.scene)).toThrow(/unknown entity UUID ghost-uuid/i)
  })

  it('flags cyclic hierarchies', () => {
    const project = createDefaultProject()
    const entities = project.scene.entities
    // Make the first two entities point at each other.
    const a = entities.find((e) => e.name === 'Camera')!
    const b = entities.find((e) => e.name === 'Sun')!
    a.parentId = b.id
    b.parentId = a.id
    const parsed = parseProject(project)
    expect(() => validateSceneIntegrity(parsed.scene)).toThrow(/cyclic/i)
  })
})

describe('migrations', () => {
  it('passes through current-version project data untouched', () => {
    const project = createDefaultProject()
    expect(migrateProject(project)).toEqual(project)
  })

  it('scene dispatcher refuses versions from the future', () => {
    const project = createDefaultProject()
    expect(() => migrateScene({ ...project.scene, schemaVersion: CURRENT_SCHEMA_VERSION + 5 })).toThrow(
      UnsupportedSchemaVersionError
    )
  })

  it('project dispatcher refuses versions from the future', () => {
    const project = createDefaultProject()
    expect(() => migrateProject({ ...project, schemaVersion: CURRENT_SCHEMA_VERSION + 5 })).toThrow(
      UnsupportedSchemaVersionError
    )
  })

  it('refuses historical versions with no registered migration', () => {
    // v1 is the oldest version; nothing below it exists — fabricate v0.
    const project = createDefaultProject()
    expect(() => migrateScene({ ...project.scene, schemaVersion: 0 })).toThrow(UnsupportedSchemaVersionError)
  })
})
