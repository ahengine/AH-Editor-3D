/**
 * Generates the example scene using the same serializer the editor uses for
 * exports (createDefaultProject → serialize). Run: pnpm generate:example
 *
 * When test-assets/animated-box.glb exists (pnpm exec tsx
 * scripts/generate-test-asset.ts), the example also includes a model asset,
 * an Animator Controller and an animated entity so the runtime demo
 * exercises the full GLTF + animation pipeline.
 */
import { existsSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDefaultProject, buildProjectData, loadProject } from '@ahengine/editor-core'
import type { ProjectData } from '@ahengine/project-schema'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const examplesDir = resolve(root, 'examples')
const publicDir = resolve(root, 'apps/runtime-demo/public')

// Serialize through the real editor pipeline: load default project into the
// store, then export. This guarantees the example matches editor output.
loadProject(createDefaultProject())
const project = buildProjectData()

const glbPath = resolve(root, 'test-assets/animated-box.glb')
if (existsSync(glbPath)) {
  const modelAssetId = 'asset-animated-box'
  const controllerId = 'anim-spin'
  const stateId = 'state-spin'
  const animatedEntityId = crypto.randomUUID()
  const withAnimation: ProjectData = {
    ...project,
    assets: [
      ...project.assets,
      {
        id: modelAssetId,
        type: 'model',
        name: 'animated-box.glb',
        uri: 'animated-box.glb',
        metadata: { animations: ['SpinBounce'] },
      },
    ],
    animatorControllers: [
      {
        id: controllerId,
        name: 'Spin Controller',
        modelAssetId,
        parameters: [],
        states: [{ id: stateId, name: 'Spin', clip: 'SpinBounce', loop: true, speed: 1 }],
        transitions: [],
        entryStateId: stateId,
      },
    ],
    scene: {
      ...project.scene,
      settings: {
        ...project.scene.settings,
        defaultCameraId: project.scene.settings.defaultCameraId ?? project.scene.entities[0].id,
      },
      entities: [
        ...project.scene.entities,
        {
          id: animatedEntityId,
          name: 'Animated Box',
          enabled: true,
          parentId: null,
          components: {
            'core.transform': { position: [-3.5, 0, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
            'render.model': { assetId: modelAssetId, visible: true, castShadow: true, receiveShadow: true },
            'render.material': { slots: [{ materialId: null }] },
            'animation.animator': {
              controllerId,
              playing: true,
              speed: 1,
              initialState: stateId,
            },
          },
        },
      ],
    },
  }
  Object.assign(project, withAnimation)
}

mkdirSync(examplesDir, { recursive: true })
mkdirSync(publicDir, { recursive: true })

const scenePath = resolve(examplesDir, 'basic-scene.koota-scene.json')
const projectPath = resolve(publicDir, 'basic-scene.koota-project.json')

writeFileSync(scenePath, JSON.stringify(project.scene, null, 2) + '\n', 'utf8')
writeFileSync(projectPath, JSON.stringify(project, null, 2) + '\n', 'utf8')
copyFileSync(projectPath, resolve(examplesDir, 'basic-scene.koota-project.json'))

console.log(`Wrote ${scenePath}`)
console.log(`Wrote ${projectPath}`)
