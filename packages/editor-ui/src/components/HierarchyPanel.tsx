import { useMemo, useState } from 'react'
import type { Entity } from 'koota'
import {
  Camera,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Lightbulb,
  Box,
  Package,
  PackageOpen,
  Power,
} from 'lucide-react'
import {
  ChildOf,
  EntityMeta,
  InstanceMember,
  PrefabInstance,
  Light,
  Camera as CameraTrait,
  ModelRenderer,
  PrimitiveMesh,
  findEntityByUuid,
  getChildren,
  isDescendantOf,
} from '@ahengine/ecs-runtime'
import {
  createCamera,
  createEntity,
  createLight,
  createPrimitive,
  deleteSelection,
  duplicateSelection,
  editComponentField,
  renameEntity,
  reparent,
  setEnabled,
  unpackInstance,
  revertInstance,
  applyInstanceOverridesToPrefab,
  createPrefabFromSelection,
  instantiatePrefabAction,
  useEditorStore,
} from '@ahengine/editor-core'
import { SegmentedControl, SearchInput } from '../ui/primitives.js'
import { TreeItem } from '../ui/primitives.js'
import { useContextMenu } from '../hooks.js'
import { AssetBrowser } from './AssetBrowser.js'

/**
 * Left hierarchy panel (292px): Scene|Assets segmented control, ⌘K search,
 * compact 28px tree rows with 17px nesting, muted-blue selection, and the
 * environment card pinned at the bottom (Scene tab only).
 */

interface RowInfo {
  entity: Entity
  uuid: string
  name: string
  enabled: boolean
  depth: number
  hasChildren: boolean
  expanded: boolean
  isPrefabRoot: boolean
  isInstanceMember: boolean
}

export function HierarchyPanel() {
  return (
    <div className="ah-panel">
      <div className="ah-panel-head" style={{ paddingBottom: 0 }}>
        <SegmentedControl
          value="scene"
          onChange={() => undefined}
          options={[{ value: 'scene', label: 'Scene' }]}
        />
      </div>
      <SceneTree />
    </div>
  )
}

function SceneTree() {
  const world = useEditorStore((s) => s.world)
  const worldVersion = useEditorStore((s) => s.worldVersion)
  const selection = useEditorStore((s) => s.selection)
  const prefabs = useEditorStore((s) => s.prefabs)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const contextMenu = useContextMenu()
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragMode, setDragMode] = useState<'before' | 'inside'>('inside')

  const rows = useMemo<RowInfo[]>(() => {
    void worldVersion
    const out: RowInfo[] = []
    if (query) {
      for (const entity of world.query(EntityMeta)) {
        const meta = entity.get(EntityMeta)!
        if (meta.name.toLowerCase().includes(query.toLowerCase())) {
          out.push({
            entity, uuid: meta.uuid, name: meta.name, enabled: meta.enabled,
            depth: 0, hasChildren: getChildren(world, entity).length > 0, expanded: false,
            isPrefabRoot: entity.has(PrefabInstance), isInstanceMember: entity.has(InstanceMember),
          })
        }
      }
      return out
    }
    const walk = (entity: Entity, depth: number) => {
      const meta = entity.get(EntityMeta)!
      const children = getChildren(world, entity)
      out.push({
        entity, uuid: meta.uuid, name: meta.name, enabled: meta.enabled,
        depth, hasChildren: children.length > 0, expanded: expanded.has(meta.uuid),
        isPrefabRoot: entity.has(PrefabInstance), isInstanceMember: entity.has(InstanceMember),
      })
      if (expanded.has(meta.uuid)) for (const child of children) walk(child, depth + 1)
    }
    for (const entity of world.query(EntityMeta)) {
      if (entity.targetFor(ChildOf) === undefined) walk(entity, 0)
    }
    return out
  }, [world, worldVersion, expanded, query])

  const toggleExpand = (uuid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(uuid)) next.delete(uuid)
      else next.add(uuid)
      return next
    })
  }

  const onRowClick = (event: React.MouseEvent, uuid: string) => {
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      const current = useEditorStore.getState().selection
      useEditorStore.getState().select(current.includes(uuid) ? current.filter((u) => u !== uuid) : [...current, uuid])
    } else {
      useEditorStore.getState().select([uuid])
    }
  }

  const rowContextMenu = (event: React.MouseEvent, info: RowInfo) => {
    if (!useEditorStore.getState().selection.includes(info.uuid)) {
      useEditorStore.getState().select([info.uuid])
    }
    const isRoot = info.entity.targetFor(ChildOf) === undefined
    contextMenu.open(event, [
      { sectionLabel: 'Create', label: 'Empty Entity', onClick: () => createEntity({ name: 'Entity', parentId: info.uuid, components: { 'core.transform': {} } }) },
      { label: 'Cube', onClick: () => createEntity({ name: 'Cube', parentId: info.uuid, components: { 'core.transform': {}, 'render.mesh': { shape: 'box' }, 'render.material': {} } }) },
      { label: 'Point Light', onClick: () => createLight('point') },
      { label: 'Camera', onClick: createCamera },
      { separatorBefore: true, label: 'Duplicate', shortcut: 'Ctrl+D', onClick: duplicateSelection },
      { label: 'Rename', shortcut: 'F2', onClick: () => setRenaming(info.uuid) },
      { label: 'Delete', shortcut: 'Del', danger: true, onClick: deleteSelection },
      ...(info.isPrefabRoot
        ? [
            { separatorBefore: true, sectionLabel: 'Prefab Instance', label: 'Revert to Prefab', onClick: () => revertInstance(info.uuid) },
            { label: 'Apply Overrides to Prefab', onClick: () => applyInstanceOverridesToPrefab(info.uuid) },
            { label: 'Unpack', onClick: () => unpackInstance(info.uuid) },
          ]
        : []),
      ...(!info.isPrefabRoot && !info.isInstanceMember
        ? [{ separatorBefore: true, label: 'Create Prefab from Entity', onClick: createPrefabFromSelection }]
        : []),
      ...(isRoot && prefabs.length > 0
        ? [
            { separatorBefore: true, sectionLabel: 'Instantiate Prefab', label: '', onClick: undefined },
            ...prefabs.slice(0, 6).map((prefab) => ({
              label: prefab.name,
              onClick: () => instantiatePrefabAction(prefab.id),
            })),
          ]
        : []),
    ])
  }

  const emptyContextMenu = (event: React.MouseEvent) => {
    contextMenu.open(event, [
      { sectionLabel: 'Create', label: 'Empty Entity', onClick: () => createEntity({ name: 'Entity', components: { 'core.transform': {} } }) },
      { label: 'Cube', onClick: () => createPrimitive('box') },
      { label: 'Sphere', onClick: () => createPrimitive('sphere') },
      { label: 'Plane', onClick: () => createPrimitive('plane') },
      { separatorBefore: true, label: 'Directional Light', onClick: () => createLight('directional') },
      { label: 'Point Light', onClick: () => createLight('point') },
      { label: 'Spot Light', onClick: () => createLight('spot') },
      { separatorBefore: true, label: 'Camera', onClick: createCamera },
    ])
  }

  return (
    <div className="ah-panel-body">
      <div className="ah-hierarchy-tools">
        <SearchInput
          id="ah-hierarchy-search"
          placeholder="Search objects, materials…"
          value={query}
          onChange={setQuery}
          shortcut="⌘K"
        />
      </div>
      <div className="ah-tree" onContextMenu={emptyContextMenu}>
        {rows.length === 0 && <div className="ah-empty">No entities</div>}
        {rows.map((info) => {
          const selected = selection.includes(info.uuid)
          return (
            <TreeItem
              key={info.uuid}
              depth={query ? 0 : info.depth}
              selected={selected}
              enabled={info.enabled}
              dropInside={dragOver === info.uuid && dragMode === 'inside'}
              icon={<EntityIcon info={info} />}
              caret={
                info.hasChildren ? (
                  info.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />
                ) : undefined
              }
              name={info.name}
              renaming={renaming === info.uuid}
              onRename={(name) => { renameEntity(info.uuid, name); setRenaming(null) }}
              onRenameCancel={() => setRenaming(null)}
              onToggleExpand={() => toggleExpand(info.uuid)}
              onClick={(event) => onRowClick(event, info.uuid)}
              onDoubleClick={() => setRenaming(info.uuid)}
              onContextMenu={(event) => rowContextMenu(event, info)}
              trailing={
                <>
                  {info.isPrefabRoot && (
                    <span title="Prefab instance" style={{ color: 'var(--accent)', display: 'flex' }}>
                      <Package size={12} />
                    </span>
                  )}
                  <span className="ah-tree-actions">
                    {rendererVisibilityTarget(info) && (
                      <button
                        className="ah-icon-btn small"
                        title={rendererVisible(info) ? 'Hide renderer' : 'Show renderer'}
                        onClick={(e) => { e.stopPropagation(); toggleRendererVisibility(info) }}
                      >
                        {rendererVisible(info) ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                    )}
                    <button
                      className={`ah-icon-btn small ${info.enabled ? '' : 'off'}`}
                      title={hasLight(info) ? (info.enabled ? 'Light on — click to turn off' : 'Light off — click to turn on') : info.enabled ? 'Disable entity' : 'Enable entity'}
                      onClick={(e) => { e.stopPropagation(); setEnabled(info.uuid, !info.enabled) }}
                    >
                      {hasLight(info) ? <Lightbulb size={13} /> : <Power size={13} />}
                    </button>
                  </span>
                </>
              }
              draggable
              onDragStart={(event) => event.dataTransfer.setData('ah/entity', info.uuid)}
              onDragOver={(event) => {
                event.preventDefault()
                const rect = event.currentTarget.getBoundingClientRect()
                const inside = event.clientY > rect.top + rect.height * 0.3 && event.clientY < rect.top + rect.height * 0.7
                setDragMode(inside ? 'inside' : 'before')
                setDragOver(info.uuid)
              }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(event) => {
                event.preventDefault()
                const draggedUuid = event.dataTransfer.getData('ah/entity')
                setDragOver(null)
                if (!draggedUuid || draggedUuid === info.uuid) return
                const dragged = findEntityByUuid(world, draggedUuid)
                const target = findEntityByUuid(world, info.uuid)
                if (!dragged || !target) return
                if (isDescendantOf(target, dragged)) return
                if (dragMode === 'inside') reparent(draggedUuid, info.uuid)
                else {
                  const parentUuid = target.targetFor(ChildOf)?.get(EntityMeta)?.uuid ?? null
                  reparent(draggedUuid, parentUuid)
                }
              }}
            />
          )
        })}
      </div>
      <EnvironmentCard />
      {contextMenu.node}
    </div>
  )
}

function EntityIcon({ info }: { info: RowInfo }) {
  const entity = info.entity
  if (info.isPrefabRoot)
    return (
      <span className="ah-tree-icon">
        <PackageOpen size={14} />
      </span>
    )
  return (
    <span className="ah-tree-icon">
      {entity.has(CameraTrait) ? (
        <Camera size={14} />
      ) : entity.has(Light) ? (
        <Lightbulb size={14} />
      ) : entity.has(ModelRenderer) ? (
        <Package size={14} />
      ) : entity.has(PrimitiveMesh) ? (
        <Box size={14} />
      ) : (
        <span style={{ width: 14, height: 14, borderRadius: 4, border: '1px solid currentColor', opacity: 0.55 }} />
      )}
    </span>
  )
}

/* Enable/disable (EntityMeta.enabled) is authored activation; renderer
 * visibility (PrimitiveMesh/ModelRenderer.visible) is a separate authored
 * flag. Eye = renderer visibility, Power/Lightbulb = activation. */
function hasLight(info: RowInfo): boolean {
  return info.entity.has(Light)
}

function rendererVisibilityTarget(info: RowInfo): 'render.mesh' | 'render.model' | null {
  if (info.entity.has(PrimitiveMesh)) return 'render.mesh'
  if (info.entity.has(ModelRenderer)) return 'render.model'
  return null
}

function rendererVisible(info: RowInfo): boolean {
  if (info.entity.has(PrimitiveMesh)) return info.entity.get(PrimitiveMesh)!.visible !== false
  if (info.entity.has(ModelRenderer)) return info.entity.get(ModelRenderer)!.visible !== false
  return true
}

function toggleRendererVisibility(info: RowInfo): void {
  const target = rendererVisibilityTarget(info)
  if (!target) return
  editComponentField(info.uuid, target, { visible: !rendererVisible(info) })
}

/** Compact environment summary pinned to the hierarchy bottom. */
function EnvironmentCard() {
  const settings = useEditorStore((s) => s.sceneSettings)
  const assets = useEditorStore((s) => s.assets)
  const projectName = useEditorStore((s) => s.projectName)
  const store = useEditorStore.getState
  const envAsset = assets.find((a) => a.id === settings.environmentAssetId)
  return (
    <button
      className="ah-sidefoot"
      onClick={() => {
        store().select([])
        store().setSceneSettingsOpen(true)
      }}
      title="Scene Settings — environment, ambient, fog"
    >
      <span
        className="ah-envthumb"
        style={{
          background: envAsset
            ? 'radial-gradient(circle at 35% 30%, #9db8d8, #2c3e57 70%)'
            : `linear-gradient(${settings.background} 0 47%, #38516b 48% 55%, #c49b62 56%)`,
        }}
      />
      <span style={{ textAlign: 'left', minWidth: 0 }}>
        <span className="ah-title" style={{ display: 'block' }}>{envAsset ? envAsset.name.replace(/\.(hdr|exr)$/i, '') : 'Gradient'}</span>
        <span className="ah-meta" style={{ display: 'block' }}>Environment · {projectName}</span>
      </span>
    </button>
  )
}
