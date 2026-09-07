import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Box,
  Circle,
  Clapperboard,
  Command,
  Download,
  FileImage,
  Layers,
  Lightbulb,
  Mountain,
  PackageOpen,
  Palette,
  Play,
  Redo2,
  Save,
  Sparkles,
  Square,
  Undo2,
  Wind,
} from 'lucide-react'
import {
  enterPlayMode,
  exportProjectJson,
  listSceneEntityNames,
  openAsset,
  saveProject,
  stopPlayMode,
  undo,
  redo,
  useEditorStore,
} from '@ahengine/editor-core'

/**
 * Command palette (Ctrl/Cmd+K) — one search box across every document object
 * (entities, assets, materials, prefabs, clips, controllers, particle
 * effects) plus global commands. Selecting anything navigates via the same
 * typed openAsset routing the rest of the editor uses.
 */

interface PaletteItem {
  id: string
  label: string
  hint: string
  icon: React.ReactNode
  run: () => void
}

export function CommandPalette() {
  const open = useEditorStore((s) => s.paletteOpen)
  const setPaletteOpen = useEditorStore((s) => s.setPaletteOpen)
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setQuery('')
      setIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const items = useMemo<PaletteItem[]>(() => buildItems(query), [query])
  const activeIndex = Math.min(index, Math.max(0, items.length - 1))

  if (!open) return null

  const activate = (item: PaletteItem | undefined) => {
    if (!item) return
    setPaletteOpen(false)
    item.run()
  }

  return (
    <div
      className="ah-palette-overlay"
      onMouseDown={(event) => {
        // Only a direct backdrop press dismisses — a press on an item must
        // survive so its click can activate (bubbled mousedowns unmount it).
        if (event.target === event.currentTarget) setPaletteOpen(false)
      }}
    >
      <div className="ah-palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="ah-palette-input">
          <Command size={14} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search entities, assets, materials, prefabs, animations…"
            onChange={(event) => {
              setQuery(event.target.value)
              setIndex(0)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setIndex((i) => Math.min(i + 1, items.length - 1))
              } else if (event.key === 'ArrowUp') {
                event.preventDefault()
                setIndex((i) => Math.max(i - 1, 0))
              } else if (event.key === 'Enter') {
                event.preventDefault()
                activate(items[activeIndex])
              } else if (event.key === 'Escape') {
                setPaletteOpen(false)
              }
            }}
          />
          <span className="ah-palette-esc">esc</span>
        </div>
        <div className="ah-palette-list">
          {items.length === 0 && <div className="ah-palette-empty">No matches</div>}
          {items.map((item, i) => (
            <button
              key={item.id}
              className={`ah-palette-item ${i === activeIndex ? 'active' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => activate(item)}
            >
              <span className="ah-palette-icon">{item.icon}</span>
              <span className="ah-palette-label">{item.label}</span>
              <span className="ah-palette-hint">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function buildItems(query: string): PaletteItem[] {
  const store = useEditorStore.getState()
  const q = query.trim().toLowerCase()
  const items: PaletteItem[] = []

  for (const entity of listSceneEntityNames()) {
    items.push({
      id: `entity:${entity.uuid}`,
      label: entity.name,
      hint: 'Scene entity',
      icon: <Box size={14} />,
      run: () => openAsset({ kind: 'entity', id: entity.uuid }),
    })
  }
  for (const asset of store.assets) {
    const icons: Record<string, React.ReactNode> = {
      model: <Box size={14} />,
      texture: <FileImage size={14} />,
      environment: <Mountain size={14} />,
    }
    items.push({
      id: `asset:${asset.id}`,
      label: asset.name,
      hint: `Asset · ${asset.type}`,
      icon: icons[asset.type] ?? <FileImage size={14} />,
      run: () => openAsset({ kind: 'asset', id: asset.id }),
    })
  }
  for (const material of store.materials) {
    items.push({
      id: `material:${material.id}`,
      label: material.name,
      hint: 'Material',
      icon: <Palette size={14} />,
      run: () => openAsset({ kind: 'material', id: material.id }),
    })
  }
  for (const prefab of store.prefabs) {
    items.push({
      id: `prefab:${prefab.id}`,
      label: prefab.name,
      hint: 'Prefab',
      icon: <PackageOpen size={14} />,
      run: () => openAsset({ kind: 'prefab', id: prefab.id }),
    })
  }
  for (const clip of store.animations) {
    items.push({
      id: `clip:${clip.id}`,
      label: clip.name,
      hint: 'Animation clip',
      icon: <Clapperboard size={14} />,
      run: () => openAsset({ kind: 'clip', id: clip.id }),
    })
  }
  for (const controller of store.controllers) {
    items.push({
      id: `controller:${controller.id}`,
      label: controller.name,
      hint: 'Animator controller',
      icon: <Circle size={14} />,
      run: () => openAsset({ kind: 'controller', id: controller.id }),
    })
  }
  for (const effect of store.particleEffects) {
    items.push({
      id: `fx:${effect.id}`,
      label: effect.name,
      hint: 'Particle effect',
      icon: <Sparkles size={14} />,
      run: () => openAsset({ kind: 'particleEffect', id: effect.id }),
    })
  }

  const commands: PaletteItem[] = [
    {
      id: 'cmd:workspace:scene',
      label: 'Go to Scene',
      hint: 'Workspace',
      icon: <Box size={14} />,
      run: () => store.setWorkspace('scene'),
    },
    {
      id: 'cmd:workspace:prefab',
      label: 'Go to Prefab',
      hint: 'Workspace',
      icon: <PackageOpen size={14} />,
      run: () => store.setWorkspace('prefab'),
    },
    {
      id: 'cmd:workspace:material',
      label: 'Go to Material',
      hint: 'Workspace',
      icon: <Palette size={14} />,
      run: () => store.setWorkspace('material'),
    },
    {
      id: 'cmd:workspace:animation',
      label: 'Go to Animation',
      hint: 'Workspace',
      icon: <Clapperboard size={14} />,
      run: () => store.setWorkspace('animation'),
    },
    {
      id: 'cmd:workspace:particle',
      label: 'Go to Particle',
      hint: 'Workspace',
      icon: <Wind size={14} />,
      run: () => store.setWorkspace('particle'),
    },
    {
      id: 'cmd:save',
      label: 'Save Project',
      hint: 'Ctrl+S',
      icon: <Save size={14} />,
      run: () => void saveProject(),
    },
    {
      id: 'cmd:export',
      label: 'Export Project JSON',
      hint: 'Command',
      icon: <Download size={14} />,
      run: () => exportProjectJson(),
    },
    {
      id: 'cmd:stop',
      label: 'Stop Play Mode',
      hint: 'Command',
      icon: <Square size={14} />,
      run: () => stopPlayMode(),
    },
    {
      id: 'cmd:grid',
      label: 'Toggle Grid',
      hint: 'Command',
      icon: <Layers size={14} />,
      run: () => store.setGridVisible(!store.gridVisible),
    },
    {
      id: 'cmd:undo',
      label: 'Undo',
      hint: 'Ctrl+Z',
      icon: <Undo2 size={14} />,
      run: () => undo(),
    },
    {
      id: 'cmd:redo',
      label: 'Redo',
      hint: 'Ctrl+Shift+Z',
      icon: <Redo2 size={14} />,
      run: () => redo(),
    },
    {
      id: 'cmd:light',
      label: 'Create Directional Light',
      hint: 'Command',
      icon: <Lightbulb size={14} />,
      run: () => void import('@ahengine/editor-core').then((m) => m.createLight('directional')),
    },
  ]
  const playItem: PaletteItem = {
    id: 'cmd:play',
    label: 'Enter Play Mode',
    hint: 'Command',
    icon: <Play size={14} />,
    run: () => enterPlayMode(),
  }
  items.push(...commands)
  if (store.playMode === 'edit') items.push(playItem)

  if (!q) {
    // No query: commands first, then a slice of document objects.
    const documentItems = items.filter((item) => !item.id.startsWith('cmd:'))
    return [...items.filter((item) => item.id.startsWith('cmd:')), ...documentItems.slice(0, 8)]
  }
  return items
    .map((item) => {
      const label = item.label.toLowerCase()
      const at = label.indexOf(q)
      return { item, score: at === -1 ? Infinity : at + label.length * 0.001 }
    })
    .filter((entry) => entry.score !== Infinity)
    .sort((a, b) => a.score - b.score)
    .slice(0, 40)
    .map((entry) => entry.item)
}
