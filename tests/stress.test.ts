import { describe, expect, it } from 'vitest'
import { createWorld, type World } from 'koota'
import { EntityMeta, Transform, serializeSceneEntities, deserializeScene } from '@ahengine/ecs-runtime'
import { validateProjectIntegrity, type ProjectData } from '@ahengine/project-schema'

/* Stabilization §3: entity-scale stress. Timings are recorded with generous
 * upper bounds only — they guard against pathological regressions (accidental
 * O(n²)), not hardware claims. */

function spawnScene(world: World, count: number): void {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `stress-${i}-${crypto.randomUUID().slice(0, 6)}`,
    name: `Entity ${i}`,
    enabled: true,
    parentId: i > 0 && i % 10 === 0 ? `stress-${i - 1}-${''}` : null,
    components: {
      'core.transform': { position: [i % 20, (i / 20) % 20, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      'render.mesh': { shape: 'box', size: 1 },
    },
  }))
  // Fix parents to real uuids (first pass placeholders → second pass)
  const uuids = rows.map((r) => r.id)
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].parentId !== null) rows[i].parentId = uuids[i - 1]
  }
  deserializeScene(world, rows)
}

describe('entity stress', () => {
  for (const count of [100, 1000, 5000]) {
    it(`${count} entities: spawn, query, serialize, destroy — no pathological regressions`, () => {
      const world = createWorld()

      const t0 = performance.now()
      spawnScene(world, count)
      const spawnMs = performance.now() - t0

      expect(world.query(EntityMeta).length).toBe(count)

      const t1 = performance.now()
      const transforms = world.query(Transform)
      const queryMs = performance.now() - t1
      expect(transforms.length).toBe(count)

      const t2 = performance.now()
      const serialized = serializeSceneEntities(world)
      const serializeMs = performance.now() - t2
      expect(serialized.length).toBe(count)
      // Authored ids survive the round-trip verbatim.
      const idSet = new Set(serialized.map((row) => row.id))
      expect(idSet.size).toBe(count)

      const t3 = performance.now()
      // ChildOf cascades: destroying a parent destroys its subtree, so later
      // entities in the list may already be gone — guard with isAlive().
      for (const entity of [...world.query(EntityMeta)]) {
        if (entity.isAlive()) entity.destroy()
      }
      const destroyMs = performance.now() - t3
      expect(world.query(EntityMeta).length).toBe(0)

      // Generous ceilings (dev hardware varies): catch quadratic blowups only.
      const budget = count >= 5000 ? 4000 : count >= 1000 ? 800 : 120
      expect(spawnMs, `spawn ${count}`).toBeLessThan(budget)
      expect(queryMs, `query ${count}`).toBeLessThan(budget / 4)
      expect(serializeMs, `serialize ${count}`).toBeLessThan(budget)
      expect(destroyMs, `destroy ${count}`).toBeLessThan(budget)

       
      console.log(
        `[stress] ${count}: spawn ${spawnMs.toFixed(0)}ms query ${queryMs.toFixed(1)}ms ` +
          `serialize ${serializeMs.toFixed(0)}ms destroy ${destroyMs.toFixed(0)}ms`
      )
    })
  }

  it('integrity validation scales on large projects', () => {
    const project = {
      project: { id: 'p', name: 'stress', createdAt: new Date().toISOString() },
      format: 'koota-3d-project',
      schemaVersion: 1,
      assets: [],
      materials: [],
      prefabs: [],
      animatorControllers: [],
      animations: [],
      particleEffects: [],
      scene: {
        format: 'koota-3d-scene',
        schemaVersion: 1,
        id: 's',
        name: 'stress',
        settings: {},
        entities: Array.from({ length: 2000 }, (_, i) => ({
          id: crypto.randomUUID(),
          name: `E${i}`,
          enabled: true,
          parentId: null,
          components: { 'render.model': { assetId: 'missing-asset' } },
        })),
      },
    } as unknown as ProjectData

    const t0 = performance.now()
    const issues = validateProjectIntegrity(project)
    const ms = performance.now() - t0
    expect(issues.length).toBe(2000) // every entity flags the missing asset
    expect(ms).toBeLessThan(2000)
  })
})
