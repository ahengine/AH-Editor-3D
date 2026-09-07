import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import type { AssetRecord } from '@ahengine/project-schema'

/**
 * Asset resolution is infrastructure agnostic. The editor resolves to
 * IndexedDB object URLs; a game can resolve to a CDN, S3, IPFS…
 */
export type AssetResolverLegacy = AssetResolver
interface AssetResolver {
  resolve(asset: AssetRecord): Promise<string>
}

/** Resolves every asset against a base URL (`/assets`, `https://cdn…/`). */
export class UrlAssetResolver implements AssetResolver {
  constructor(private base = '') {}
  async resolve(asset: AssetRecord): Promise<string> {
    const tail = asset.uri.replace(/^idb:\/\//, '')
    return `${this.base}/${tail}`.replace(/\/+/g, '/').replace(/^\/?(https?:)/, '$1//')
  }
}

/** Everything already addressable — pass through as-is. */
export class PassthroughResolver implements AssetResolver {
  async resolve(asset: AssetRecord): Promise<string> {
    return asset.uri
  }
}

export interface LoadedModel {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
  boundingBox: THREE.Box3
  nodeNames: string[]
  materialNames: string[]
}

/**
 * Central async asset cache. One place for GLTF / texture / environment
 * loading, refcount-free with simple url keys — good enough for the editor
 * and small runtime scenes.
 */
export class AssetCache {
  private models = new Map<string, Promise<LoadedModel>>()
  private textures = new Map<string, Promise<THREE.Texture>>()
  private environments = new Map<string, Promise<THREE.Texture>>()
  private gltf = new GLTFLoader()

  loadModel(url: string): Promise<LoadedModel> {
    const cached = this.models.get(url)
    if (cached) return cached
    const entry: Promise<LoadedModel> = this.gltf.loadAsync(url).then((gltf) => {
      const boundingBox = new THREE.Box3().setFromObject(gltf.scene)
      const nodeNames: string[] = []
      gltf.scene.traverse((child: THREE.Object3D) => nodeNames.push(child.name))
      const materialNames: string[] = []
      gltf.scene.traverse((child: THREE.Object3D) => {
        const mesh = child as THREE.Mesh
        if (!mesh.isMesh) return
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const mat of mats) if (mat?.name && !materialNames.includes(mat.name)) materialNames.push(mat.name)
      })
      return {
        scene: gltf.scene,
        animations: gltf.animations ?? [],
        boundingBox,
        nodeNames,
        materialNames,
      }
    })
    this.models.set(url, entry)
    return entry
  }

  loadTexture(url: string, colorSpace?: THREE.ColorSpace): Promise<THREE.Texture> {
    const key = `${url}|${colorSpace ?? ''}`
    const cached = this.textures.get(key)
    if (cached) return cached
    const entry: Promise<THREE.Texture> = new THREE.TextureLoader()
      .loadAsync(url)
      .then((texture: THREE.Texture) => {
        if (colorSpace) texture.colorSpace = colorSpace
        return texture
      })
    this.textures.set(key, entry)
    return entry
  }

  /** HDR / EXR environment maps. */
  loadEnvironment(url: string): Promise<THREE.Texture> {
    const cached = this.environments.get(url)
    if (cached) return cached
    const entry: Promise<THREE.Texture> = new RGBELoader()
      .loadAsync(url)
      .then((texture: THREE.Texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping
        return texture
      })
    this.environments.set(url, entry)
    return entry
  }

  dispose(): void {
    for (const promise of this.textures.values())
      promise.then((t) => t.dispose()).catch(() => undefined)
    for (const promise of this.environments.values())
      promise.then((t) => t.dispose()).catch(() => undefined)
    this.models.clear()
    this.textures.clear()
    this.environments.clear()
  }
}

/** @deprecated use sharedAssetCache from asset-cache.js */
export const legacyAssetCache = new AssetCache()

/** Model animation clips by asset id, used by the animator runtime and editor. */
export const modelAnimations = new Map<string, THREE.AnimationClip[]>()

export function rememberModelAnimations(assetId: string, clips: THREE.AnimationClip[]): void {
  if (clips.length > 0) modelAnimations.set(assetId, clips)
}
