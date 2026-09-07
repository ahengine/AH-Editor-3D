import { useMemo, useRef, useState } from 'react'
import {
  Box,
  FileImage,
  FolderOpen,
  Grid3x3,
  List,
  Mountain,
  PackageOpen,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import type { AssetRecord, AssetType } from '@ahengine/project-schema'
import { importAssetFiles, openAsset, resolveAssetUri, useEditorStore } from '@ahengine/editor-core'
import { deleteAsset } from '@ahengine/editor-core'
import { MaterialReference, ModelRenderer } from '@ahengine/ecs-runtime'
import { useContextMenu } from '../hooks.js'

/**
 * Asset Browser — dense grid/list with type filters, search, thumbnails,
 * rename/delete, drag-to-viewport (model → entity, material → assign).
 */

const TYPE_ORDER: { value: AssetType | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'model', label: 'Models' },
  { value: 'texture', label: 'Textures' },
  { value: 'environment', label: 'Env' },
  { value: 'material', label: 'Materials' },
  { value: 'prefab', label: 'Prefabs' },
]

export function AssetBrowser({ compact: _compact = false }: { compact?: boolean }) {
  const assets = useEditorStore((s) => s.assets)
  const prefabs = useEditorStore((s) => s.prefabs)
  const sceneSettings = useEditorStore((s) => s.sceneSettings)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AssetType | 'all'>('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')
  const fileInput = useRef<HTMLInputElement>(null)
  const contextMenu = useContextMenu()
  const store = useEditorStore.getState

  const filtered = useMemo(() => {
    let list = assets
    if (filter !== 'all') list = list.filter((a) => a.type === filter)
    if (query) list = list.filter((a) => a.name.toLowerCase().includes(query.toLowerCase()))
    return list
  }, [assets, filter, query])

  const filteredPrefabs = useMemo(() => {
    if (filter !== 'all' && filter !== 'prefab') return []
    if (query) return prefabs.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
    return prefabs
  }, [prefabs, filter, query])

  function assetContextMenu(event: React.MouseEvent, asset: AssetRecord) {
    contextMenu.open(event, [
      {
        label: 'Rename…',
        onClick: () => {
          const name = window.prompt('Asset name', asset.name)
          if (name) {
            store().setAssets(store().assets.map((a) => (a.id === asset.id ? { ...a, name } : a)))
          }
        },
      },
      {
        label: 'Copy Asset ID',
        onClick: () => {
          void navigator.clipboard?.writeText(asset.id)
          store().notify('info', `Copied ${asset.id}`)
        },
      },
      {
        separatorBefore: true,
        label: 'Delete Asset',
        danger: true,
        icon: <Trash2 size={13} />,
        onClick: () => {
          const refs = countReferences(asset.id)
          if (refs > 0) {
            store().notify('error', `Cannot delete "${asset.name}" — ${refs} scene reference(s)`)
            return
          }
          deleteAsset(asset.id)
          store().notify('success', `Deleted "${asset.name}"`)
        },
      },
    ])
  }

  function countReferences(assetId: string): number {
    let count = 0
    if (sceneSettings.environmentAssetId === assetId) count++
    for (const asset of assets) {
      if (asset.id !== assetId) continue
      // Count scene entities referencing this asset via the serialized component data
      }
    // Authoritative: scan all entities' ModelRenderer + material slots
        for (const entity of store().world.query(ModelRenderer)) {
      if (entity.get(ModelRenderer)?.assetId === assetId) count++
    }
    for (const entity of store().world.query(MaterialReference)) {
      const ref = entity.get(MaterialReference)
      for (const slot of ref?.slots ?? []) {
        if (slot.materialId === assetId) count++
      }
    }
        return count
  }

  const importInput = (
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
            store().notify('success', `Imported ${imported.length} asset(s)`)
          }
        }
        event.target.value = ''
      }}
    />
  )

  return (
    <div className="ah-panel-body">
      <div className="ah-assets-toolbar">
        <div className="ah-search" style={{ flex: 1, maxWidth: 200 }}>
          <Search size={12} />
          <input placeholder="Search assets…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {TYPE_ORDER.filter((t) => t.value === 'all' || assets.some((a) => a.type === t.value)).map((t) => (
          <button key={t.value} className={`ah-chip ${filter === t.value ? 'active' : ''}`} onClick={() => setFilter(t.value)}>
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className={`ah-chip ${view === 'grid' ? 'active' : ''}`} onClick={() => setView('grid')} title="Grid view">
          <Grid3x3 size={12} />
        </button>
        <button className={`ah-chip ${view === 'list' ? 'active' : ''}`} onClick={() => setView('list')} title="List view">
          <List size={12} />
        </button>
        <button className="ah-btn" onClick={() => fileInput.current?.click()}>
          <Upload size={13} /> Import
        </button>
        {importInput}
      </div>

      <div className="ah-assets">
        {view === 'grid' ? (
          <div className="ah-asset-grid">
            {filteredPrefabs.map((prefab) => (
              <div
                key={prefab.id}
                className="ah-asset-card"
                draggable
                onDragStart={(event) => event.dataTransfer.setData('ah/prefab', prefab.id)}
                onDoubleClick={() => openAsset({ kind: 'prefab', id: prefab.id })}
                title={`${prefab.name} — double-click to open, drag into viewport to instantiate`}
              >
                <div className="ah-asset-thumb" style={{ color: 'var(--accent)' }}>
                  <PackageOpen size={22} />
                </div>
                <div className="ah-asset-name">{prefab.name}</div>
                <div className="ah-asset-type">PREFAB</div>
              </div>
            ))}
            {filtered.map((asset) => (
              <div
                key={asset.id}
                className="ah-asset-card"
                draggable
                onDragStart={(event) => event.dataTransfer.setData('ah/asset', asset.id)}
                onDoubleClick={() => openAsset({ kind: 'asset', id: asset.id })}
                onContextMenu={(event) => assetContextMenu(event, asset)}
                title={`${asset.name} (${asset.type}) — double-click to open, drag into viewport`}
              >
                <div className="ah-asset-thumb">
                  <AssetThumbnail record={asset} />
                </div>
                <div className="ah-asset-name">{asset.name}</div>
                <div className="ah-asset-type">{asset.type.toUpperCase()}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filteredPrefabs.map((prefab) => (
              <div
                key={prefab.id}
                className="ah-list-row"
                draggable
                onDragStart={(event) => event.dataTransfer.setData('ah/prefab', prefab.id)}
                onDoubleClick={() => openAsset({ kind: 'prefab', id: prefab.id })}
              >
                <span className="ah-list-icon"><PackageOpen size={14} /></span>
                <span className="ah-list-name">{prefab.name}</span>
                <span className="ah-list-meta">prefab</span>
              </div>
            ))}
            {filtered.map((asset) => (
              <div
                key={asset.id}
                className="ah-list-row"
                draggable
                onDragStart={(event) => event.dataTransfer.setData('ah/asset', asset.id)}
                onDoubleClick={() => openAsset({ kind: 'asset', id: asset.id })}
                onContextMenu={(event) => assetContextMenu(event, asset)}
              >
                <span className="ah-list-icon"><AssetTypeIcon record={asset} /></span>
                <span className="ah-list-name">{asset.name}</span>
                <span className="ah-list-meta">{asset.type}</span>
              </div>
            ))}
          </div>
        )}
        {filtered.length === 0 && filteredPrefabs.length === 0 && (
          <div className="ah-empty">
            <FolderOpen size={20} style={{ marginBottom: 6, opacity: 0.5 }} />
            <div>No assets — import GLB / textures / HDR</div>
          </div>
        )}
      </div>
      {contextMenu.node}
    </div>
  )
}

function AssetThumbnail({ record }: { record: AssetRecord }) {
  const [url, setUrl] = useState<string | null>(null)
  useMemo(() => {
    if (record.type === 'texture' && record.uri.startsWith('idb://')) {
      void resolveAssetUri(record.uri).then(setUrl).catch(() => setUrl(null))
    } else {
      setUrl(null)
    }
    return null
  }, [record.uri, record.type])

  if (record.type === 'texture' && url) {
    return <img src={url} alt="" draggable={false} />
  }
  return <AssetTypeIcon record={record} size={22} />
}

function AssetTypeIcon({ record, size = 14 }: { record: AssetRecord; size?: number }) {
  switch (record.type) {
    case 'model':
      return <Box size={size} />
    case 'environment':
      return <Mountain size={size} />
    default:
      return <FileImage size={size} />
  }
}
