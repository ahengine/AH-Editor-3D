import type { AssetRecord } from '@ahengine/project-schema'
import {
  AnimatorRuntime,
  AssetCache,
  MaterialService,
  modelAnimationRegistry,
  type AssetResolver,
} from '@ahengine/ecs-runtime'
import { idbGetBlob } from './idb.js'
import { useEditorStore } from './store.js'

/**
 * Editor-side service singletons. They read the live store through closures,
 * so they survive asset/material edits without recreation.
 */

function materialMap(): Map<string, import('@ahengine/project-schema').MaterialDefinition> {
  return new Map(useEditorStore.getState().materials.map((m) => [m.id, m]))
}

/** Resolves `idb://<assetId>` to a blob URL; everything else passes through. */
class EditorAssetResolver implements AssetResolver {
  private blobUrls = new Map<string, string>()

  async resolve(asset: AssetRecord): Promise<string> {
    return this.resolveUri(asset.uri)
  }

  async resolveUri(uri: string): Promise<string> {
    if (!uri.startsWith('idb://')) return uri
    const assetId = uri.slice('idb://'.length)
    const cached = this.blobUrls.get(assetId)
    if (cached) return cached
    const blob = await idbGetBlob(assetId)
    if (!blob) throw new Error(`Asset blob ${assetId} not found in IndexedDB`)
    const url = URL.createObjectURL(blob)
    this.blobUrls.set(assetId, url)
    return url
  }
}

export const assetResolver = new EditorAssetResolver()
export const assetCache = new AssetCache()

export const materialService = new MaterialService(
  materialMap,
  assetResolver,
  (id) => useEditorStore.getState().assets.find((a) => a.id === id)
)

export const animator = new AnimatorRuntime(
  () => new Map(useEditorStore.getState().controllers.map((c) => [c.id, c])),
  (modelAssetId) => modelAnimationRegistry.get(modelAssetId) ?? []
)

/** Shared lookups handed to KootaScene. */
export function environmentLookup(assetId: string): { uri: string } | undefined {
  const asset = useEditorStore.getState().assets.find((a) => a.id === assetId)
  return asset ? { uri: asset.uri } : undefined
}

export const resolveAssetUri = (uri: string) => assetResolver.resolveUri(uri)
