/**
 * Generates a tiny animated GLB (rotating box) used to verify the
 * model + animator pipeline end-to-end. Run: tsx scripts/generate-test-asset.ts
 */
import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as THREE from 'three'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

// Minimal FileReader shim — GLTFExporter's binary path expects the browser API.
class FileReaderShim {
  result: ArrayBuffer | string | null = null
  onloadend: (() => void) | null = null
  onerror: (() => void) | null = null
  readAsArrayBuffer(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = buffer
        this.onloadend?.()
      })
      .catch(() => this.onerror?.())
  }
  readAsDataURL(blob: Blob): void {
    blob
      .arrayBuffer()
      .then((buffer) => {
        this.result = `data:application/octet-stream;base64,${Buffer.from(buffer).toString('base64')}`
        this.onloadend?.()
      })
      .catch(() => this.onerror?.())
  }
}
if (typeof globalThis.FileReader === 'undefined') {
  ;(globalThis as { FileReader?: unknown }).FileReader = FileReaderShim
}

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')

const scene = new THREE.Scene()
scene.name = 'AnimatedBox'

const mesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: new THREE.Color('#c05b4d') })
)
mesh.name = 'Box'
scene.add(mesh)

const times = [0, 1, 2]
const quaternionTrack = new THREE.QuaternionKeyframeTrack(
  'Box.quaternion',
  times,
  [
    0, 0, 0, 1,
    0, Math.SQRT1_2, 0, Math.SQRT1_2,
    0, 0, 0, 1,
  ]
)
const positionTrack = new THREE.VectorKeyframeTrack(
  'Box.position',
  times,
  [0, 0.5, 0, 0, 1.2, 0, 0, 0.5, 0]
)
const clip = new THREE.AnimationClip('SpinBounce', 2, [quaternionTrack, positionTrack])

const exporter = new GLTFExporter()
exporter.parse(
  scene,
  (result) => {
    const buffer = result as ArrayBuffer
    const outDir = resolve(root, 'test-assets')
    mkdirSync(outDir, { recursive: true })
    const outPath = resolve(outDir, 'animated-box.glb')
    writeFileSync(outPath, Buffer.from(buffer))
    const publicDir = resolve(root, 'apps/runtime-demo/public/assets')
    mkdirSync(publicDir, { recursive: true })
    copyFileSync(outPath, resolve(publicDir, 'animated-box.glb'))
    console.log(`Wrote ${outPath} (${buffer.byteLength} bytes) + public copy`)
  },
  (error) => {
    console.error('export failed', error)
    process.exitCode = 1
  },
  { binary: true, animations: [clip] }
)
