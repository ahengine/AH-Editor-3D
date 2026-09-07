import type { AssetRecord, AssetType } from '@ahengine/project-schema'
import { idbPutBlob } from './idb.js'
import { useEditorStore } from './store.js'
import { projectBackend } from './backend.js'

/** Asset database: file imports land here as stable-id records + backend blobs. */

const EXTENSION_TYPES: Record<string, AssetType> = {
  glb: 'model',
  gltf: 'model',
  png: 'texture',
  jpg: 'texture',
  jpeg: 'texture',
  webp: 'texture',
  hdr: 'environment',
  exr: 'environment',
}

export function assetTypeForFile(fileName: string): AssetType | null {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_TYPES[extension] ?? null
}

/** Reads a chosen file into the asset DB (backend blob + record). */
export async function importAssetFile(file: File): Promise<AssetRecord | null> {
  const type = assetTypeForFile(file.name)
  if (!type) {
    useEditorStore.getState().notify('error', `Unsupported asset type: ${file.name}`)
    return null
  }
  const id = `asset-${crypto.randomUUID()}`
  let uri: string
  try {
    uri = await projectBackend.importAsset(file)
  } catch (error) {
    useEditorStore.getState().notify('error', `Asset import failed: ${(error as Error).message}`)
    return null
  }
  const record: AssetRecord = {
    id,
    type,
    name: file.name,
    uri,
    metadata: { size: file.size, importedAt: new Date().toISOString() },
  }
  const store = useEditorStore.getState()
  store.setAssets([...store.assets, record])
  return record
}

export async function importAssetFiles(files: FileList | File[]): Promise<AssetRecord[]> {
  const imported: AssetRecord[] = []
  for (const file of Array.from(files)) {
    const record = await importAssetFile(file)
    if (record) imported.push(record)
  }
  return imported
}

export function deleteAsset(assetId: string): void {
  const store = useEditorStore.getState()
  const asset = store.assets.find((a) => a.id === assetId)
  if (asset) void projectBackend.deleteAsset(asset.uri)
  store.setAssets(store.assets.filter((a) => a.id !== assetId))
}

export function renameAsset(assetId: string, name: string): void {
  const store = useEditorStore.getState()
  store.setAssets(store.assets.map((a) => (a.id === assetId ? { ...a, name } : a)))
}

export function findAsset(assetId: string): AssetRecord | undefined {
  return useEditorStore.getState().assets.find((a) => a.id === assetId)
}

export { idbPutBlob }
