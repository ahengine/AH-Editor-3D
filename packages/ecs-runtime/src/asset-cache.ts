import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js'
import type { AssetRecord } from '@ahengine/project-schema'

/**
 * Centralized reference-counted asset cache.
 * Runtime GPU objects (textures, geometries via models, environments) are
 * created exclusively through this cache. When the refcount for an entry
 * drops to zero its GPU resources are disposed.
 *
 * Usage:
 *   const handle = cache.acquireModel(assetId, url)
 *   // … use handle.model
 *   cache.release(assetId) // disposes when last holder releases
 */

export interface GLTFMetadata {
  nodeNames: string[]
  animationNames: string[]
  materialSlots: string[]
  boundingBox: { min: [number, number, number]; max: [number, number, number] }
  triangleCount: number
  /** Base64 PNG data URL, generated offscreen when a GLTF is first loaded. */
  thumbnail?: string
}

export interface LoadedModel {
  scene: THREE.Group
  animations: THREE.AnimationClip[]
  metadata: GLTFMetadata
}

interface CacheEntry<T> {
  value: T
  refcount: number
}

export class RefCountedAssetCache {
  private models = new Map<string, CacheEntry<LoadedModel>>()
  private textures = new Map<string, CacheEntry<THREE.Texture>>()
  private environments = new Map<string, CacheEntry<THREE.Texture>>()
  private inflight = new Map<string, Promise<unknown>>()
  private gltf = new GLTFLoader()

  /* ---------------- models ---------------- */

  acquireModel(assetId: string, url: string): Promise<LoadedModel> {
    return this.acquire(this.models, `model:${assetId}`, () =>
      this.gltf.loadAsync(url).then((gltf) => {
        const boundingBox = new THREE.Box3().setFromObject(gltf.scene)
        const nodeNames: string[] = []
        const materialSlots = new Set<string>()
        let triangleCount = 0
        gltf.scene.traverse((child) => {
          nodeNames.push(child.name)
          const mesh = child as THREE.Mesh
          if (!mesh.isMesh) return
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const mat of mats) if (mat?.name) materialSlots.add(mat.name)
          const geo = mesh.geometry as THREE.BufferGeometry
          if (geo.index) triangleCount += geo.index.count / 3
          else if (geo.attributes.position) triangleCount += geo.attributes.position.count / 3
        })
        const metadata: GLTFMetadata = {
          nodeNames,
          animationNames: (gltf.animations ?? []).map((clip) => clip.name).filter(Boolean),
          materialSlots: [...materialSlots],
          boundingBox: {
            min: [boundingBox.min.x, boundingBox.min.y, boundingBox.min.z],
            max: [boundingBox.max.x, boundingBox.max.y, boundingBox.max.z],
          },
          triangleCount: Math.round(triangleCount),
        }
        return {
          scene: gltf.scene,
          animations: gltf.animations ?? [],
          metadata,
        } satisfies LoadedModel
      })
    ) as Promise<LoadedModel>
  }

  loadModel(url: string, assetId?: string): Promise<LoadedModel> {
    return this.acquireModel(assetId ?? url, url)
  }

  loadTexture(url: string, colorSpace?: THREE.ColorSpace): Promise<THREE.Texture> {
    return this.acquireTexture(url, colorSpace)
  }

  loadEnvironment(url: string): Promise<THREE.Texture> {
    return this.acquireEnvironment(url)
  }

  /* ---------------- textures ---------------- */

  acquireTexture(url: string, colorSpace?: THREE.ColorSpace): Promise<THREE.Texture> {
    const key = `tex:${url}|${colorSpace ?? ''}`
    return this.acquire(this.textures, key, () =>
      new THREE.TextureLoader().loadAsync(url).then((texture) => {
        if (colorSpace) texture.colorSpace = colorSpace
        return texture
      })
    )
  }

  /* ---------------- environments ---------------- */

  acquireEnvironment(url: string): Promise<THREE.Texture> {
    return this.acquire(this.environments, `env:${url}`, () =>
      new RGBELoader().loadAsync(url).then((texture) => {
        texture.mapping = THREE.EquirectangularReflectionMapping
        return texture
      })
    )
  }

  /* ---------------- lifecycle ---------------- */

  release(assetIdOrUrl: string): void {
    for (const store of [this.models, this.textures, this.environments]) {
      for (const [key, entry] of store) {
        if (!key.endsWith(assetIdOrUrl) && !key.includes(assetIdOrUrl)) continue
        entry.refcount--
        if (entry.refcount <= 0) {
          disposeValue(entry.value)
          store.delete(key)
        }
      }
    }
  }

  /** Releases ALL entries and disposes GPU resources. Used on project unload. */
  dispose(): void {
    for (const store of [this.models, this.textures, this.environments]) {
      for (const entry of store.values()) disposeValue(entry.value)
      store.clear()
    }
    this.inflight.clear()
  }

  stats(): { models: number; textures: number; environments: number } {
    return { models: this.models.size, textures: this.textures.size, environments: this.environments.size }
  }

  /** Internal shared acquire-or-load with refcount. */
  private acquire<T>(
    store: Map<string, CacheEntry<T>>,
    key: string,
    loader: () => Promise<T>
  ): Promise<T> {
    const existing = store.get(key)
    if (existing) {
      existing.refcount++
      return Promise.resolve(existing.value)
    }
    let inflight = this.inflight.get(key)
    if (!inflight) {
      inflight = loader().then((value) => {
        store.set(key, { value, refcount: 1 })
        this.inflight.delete(key)
        return value
      })
      this.inflight.set(key, inflight)
    }
    return (inflight as Promise<T>).then((value) => {
      // A concurrent acquire while loading already counted; bump now.
      const entry = store.get(key)
      if (entry) entry.refcount++
      return value
    })
  }
}

function disposeValue(value: unknown): void {
  if (value instanceof THREE.Texture) {
    value.dispose()
    return
  }
  if (value && typeof value === 'object' && 'scene' in value) {
    const model = value as LoadedModel
    model.scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (mesh.isMesh) mesh.geometry?.dispose?.()
    })
  }
}

/** Backward-compat aliases — existing call sites use the old names. */
export const sharedAssetCache = new RefCountedAssetCache()
export type AssetCache = RefCountedAssetCache

/* ------------------------------------------------------------------ */
/* AssetResolver — pluggable asset URI resolution by stable ID         */
/* ------------------------------------------------------------------ */

export interface AssetResolver {
  resolve(asset: AssetRecord): Promise<string>
}

/** Resolves `idb://` to blob URLs in the editor; everything else passes through. */
export class EditorAssetResolver implements AssetResolver {
  private blobUrls = new Map<string, string>()

  async resolve(asset: AssetRecord): Promise<string> {
    return this.resolveUri(asset.uri)
  }

  async resolveUri(uri: string): Promise<string> {
    if (!uri.startsWith('idb://')) return uri
    const assetId = uri.slice('idb://'.length)
    const cached = this.blobUrls.get(assetId)
    if (cached) return cached
    const { idbGetBlob } = await import('./idb-shim.js')
    const blob = await idbGetBlob(assetId)
    if (!blob) throw new Error(`Asset blob ${assetId} not found in IndexedDB`)
    const url = URL.createObjectURL(blob)
    this.blobUrls.set(assetId, url)
    return url
  }

  revoke(assetId: string): void {
    const url = this.blobUrls.get(assetId)
    if (url) {
      URL.revokeObjectURL(url)
      this.blobUrls.delete(assetId)
    }
  }
}
