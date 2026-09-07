import { useMemo, useRef, useState } from 'react'
import { Box, FileImage, FolderOpen, Mountain, Package, PackageOpen, Search, Trash2, Upload } from 'lucide-react'
import type { AssetRecord } from '@ahengine/project-schema'
import { importAssetFiles, resolveAssetUri, useEditorStore } from '@ahengine/editor-core'
import { instantiatePrefabAction } from '@ahengine/editor-core'
import { useContextMenu } from '../hooks.js'

/** Asset browser: imported models / textures / environments + authored prefabs. */

const typeIcon = (asset: AssetRecord | { type: string }) => {
  switch (asset.type) {
    case 'model':
      return <Box size={22} />
    case 'texture':
      return <FileImage size={22} />
    case 'environment':
      return <Mountain size={22} />
    default:
      return <Package size={22} />
  }
}

export function AssetBrowser({ compact = false }: { compact?: boolean }) {
  const assets = useEditorStore((s) => s.assets)
  const prefabs = useEditorStore((s) => s.prefabs)
  const [query, setQuery] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)
  const contextMenu = useContextMenu()

  const filteredAssets = useMemo(
    () => assets.filter((a) => a.name.toLowerCase().includes(query.toLowerCase())),
    [assets, query]
  )
  const filteredPrefabs = useMemo(
    () => prefabs.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())),
    [prefabs, query]
  )

  return (
    <div className="ah-panel-body">
      <div className={compact ? 'ah-assets-toolbar' : 'ah-assets-toolbar'}>
        <div className="ah-search" style={{ flex: 1, maxWidth: 220 }}>
          <Search size={12} />
          <input placeholder="Search assets…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div style={{ flex: 1 }} />
        <button className="ah-btn" onClick={() => fileInput.current?.click()}>
          <Upload size={13} /> Import
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.hdr,.exr"
          style={{ display: 'none' }}
          onChange={async (event) => {
            const files = event.target.files
            if (files && files.length > 0) {
              const imported = await importAssetFiles(files)
              if (imported.length > 0) {
                useEditorStore.getState().notify('success', `Imported ${imported.length} asset(s)`)
              }
            }
            event.target.value = ''
          }}
        />
      </div>

      <div className="ah-assets">
        <div className="ah-asset-grid">
          {filteredPrefabs.map((prefab) => (
            <div
              key={prefab.id}
              className="ah-asset-card"
              draggable
              onDragStart={(event) => event.dataTransfer.setData('ah/prefab', prefab.id)}
              onDoubleClick={() => instantiatePrefabAction(prefab.id)}
              onContextMenu={(event) =>
                contextMenu.open(event, [
                  { label: 'Instantiate in Scene', onClick: () => instantiatePrefabAction(prefab.id) },
                  {
                    separatorBefore: true,
                    label: 'Delete Prefab',
                    danger: true,
                    icon: <Trash2 size={13} />,
                    onClick: () => {
                      const store = useEditorStore.getState()
                      store.setPrefabs(store.prefabs.filter((p) => p.id !== prefab.id))
                    },
                  },
                ])
              }
            >
              <div className="ah-asset-thumb" style={{ color: 'var(--accent)' }}>
                <PackageOpen size={22} />
              </div>
              <div className="ah-asset-name" title={prefab.name}>
                {prefab.name}
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>PREFAB</div>
            </div>
          ))}

          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              className="ah-asset-card"
              draggable
              onDragStart={(event) => event.dataTransfer.setData('ah/asset', asset.id)}
              onDoubleClick={() => {
                if (asset.type === 'model') {
                  useEditorStore.getState().notify('info', 'Drag the model into the viewport to place it')
                }
              }}
              onContextMenu={(event) =>
                contextMenu.open(event, [
                  { label: 'Rename…', onClick: () => {
                    const name = window.prompt('Asset name', asset.name)
                    if (name) {
                      const store = useEditorStore.getState()
                      store.setAssets(store.assets.map((a) => (a.id === asset.id ? { ...a, name } : a)))
                    }
                  } },
                  {
                    separatorBefore: true,
                    label: 'Delete Asset',
                    danger: true,
                    icon: <Trash2 size={13} />,
                    onClick: () => {
                      const store = useEditorStore.getState()
                      store.setAssets(store.assets.filter((a) => a.id !== asset.id))
                    },
                  },
                ])
              }
            >
              <div className="ah-asset-thumb">
                {asset.type === 'texture' ? (
                  <AssetThumbnail uri={asset.uri} />
                ) : (
                  typeIcon(asset)
                )}
              </div>
              <div className="ah-asset-name" title={asset.name}>
                {asset.name}
              </div>
              <div style={{ fontSize: 9.5, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
                {asset.type.toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        {filteredAssets.length === 0 && filteredPrefabs.length === 0 && (
          <div className="ah-empty">
            <FolderOpen size={20} style={{ marginBottom: 6, opacity: 0.5 }} />
            <div>No assets yet — import GLB / textures / HDR</div>
          </div>
        )}
      </div>
      {contextMenu.node}
    </div>
  )
}

function AssetThumbnail({ uri }: { uri: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useMemo(() => {
    if (uri.startsWith('idb://')) {
      void resolveAssetUri(uri).then(setUrl).catch(() => setUrl(null))
    } else {
      setUrl(uri)
    }
    return null
  }, [uri])
  return url ? <img src={url} alt="" draggable={false} /> : <FileImage size={22} />
}
