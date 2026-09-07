import { useMemo, useState } from 'react'
import type { Entity } from 'koota'
import { Camera, ChevronDown, ChevronRight, Eye, EyeOff, Lightbulb, Box, Package, Search } from 'lucide-react'
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
  renameEntity,
  reparent,
  setEnabled,
  unpackInstance,
  revertInstance,
  applyInstanceOverridesToPrefab,
  createPrefabFromSelection,
  instantiatePrefabAction,
} from '@ahengine/editor-core'
import { useEditorStore } from '@ahengine/editor-core'
import { useContextMenu } from '../hooks.js'

/** Hierarchy tree — driven entirely by Koota relations; no shadow state. */

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
  const world = useEditorStore((s) => s.world)
  const worldVersion = useEditorStore((s) => s.worldVersion)
  const selection = useEditorStore((s) => s.selection)
  const prefabs = useEditorStore((s) => s.prefabs)
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [renaming, setRenaming] = useState<string | null>(null)
  const contextMenu = useContextMenu()
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragMode, setDragMode] = useState<'before' | 'inside'>('inside')

  const rows = useMemo<RowInfo[]>(() => {
    void worldVersion
    const out: RowInfo[] = []
    const visible = new Set<string>()
    if (query) {
      // Search mode: flat list of matches.
      for (const entity of world.query(EntityMeta)) {
        const meta = entity.get(EntityMeta)!
        if (meta.name.toLowerCase().includes(query.toLowerCase())) {
          out.push({
            entity,
            uuid: meta.uuid,
            name: meta.name,
            enabled: meta.enabled,
            depth: 0,
            hasChildren: getChildren(world, entity).length > 0,
            expanded: false,
            isPrefabRoot: entity.has(PrefabInstance),
            isInstanceMember: entity.has(InstanceMember),
          })
        }
      }
      return out
    }
    const walk = (entity: Entity, depth: number) => {
      const meta = entity.get(EntityMeta)!
      const children = getChildren(world, entity)
      out.push({
        entity,
        uuid: meta.uuid,
        name: meta.name,
        enabled: meta.enabled,
        depth,
        hasChildren: children.length > 0,
        expanded: expanded.has(meta.uuid),
        isPrefabRoot: entity.has(PrefabInstance),
        isInstanceMember: entity.has(InstanceMember),
      })
      if (expanded.has(meta.uuid)) for (const child of children) walk(child, depth + 1)
    }
    for (const entity of world.query(EntityMeta)) {
      if (entity.targetFor(ChildOf) === undefined) walk(entity, 0)
    }
    void visible
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
      const next = current.includes(uuid) ? current.filter((u) => u !== uuid) : [...current, uuid]
      useEditorStore.getState().select(next)
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
    <div className="ah-panel">
      <div className="ah-panel-header">
        <span className="ah-panel-title">Hierarchy</span>
        <div style={{ flex: 1 }} />
        <div className="ah-search" style={{ width: 130 }}>
          <Search size={12} />
          <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>
      <div className="ah-tree" onContextMenu={emptyContextMenu}>
        {rows.length === 0 && <div className="ah-empty">No entities</div>}
        {rows.map((info) => {
          const selected = selection.includes(info.uuid)
          return (
            <div
              key={info.uuid}
              className={[
                'ah-tree-row',
                selected ? 'selected' : '',
                !info.enabled ? 'disabled-entity' : '',
                dragOver === info.uuid && dragMode === 'inside' ? 'ah-tree-drop-inside' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ paddingLeft: 4 }}
              onClick={(event) => onRowClick(event, info.uuid)}
              onDoubleClick={() => setRenaming(info.uuid)}
              onContextMenu={(event) => rowContextMenu(event, info)}
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
            >
              <span className="ah-tree-indent" style={{ width: info.depth * 14 }}>
                {info.depth > 0 && <span style={{ position: 'absolute', left: 6, top: 0, bottom: 0, width: 1, background: '#ffffff0f' }} />}
              </span>
              {info.hasChildren ? (
                <span className="ah-tree-caret" onClick={(e) => { e.stopPropagation(); toggleExpand(info.uuid) }}>
                  {info.expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
              ) : (
                <span style={{ width: 16, flex: 'none' }} />
              )}
              <EntityIcon info={info} />
              {renaming === info.uuid ? (
                <input
                  autoFocus
                  defaultValue={info.name}
                  onBlur={(e) => { renameEntity(info.uuid, e.target.value.trim() || info.name); setRenaming(null) }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <span className="ah-tree-name">{info.name}</span>
              )}
              {info.isPrefabRoot && (
                <span title="Prefab instance" style={{ color: 'var(--accent)', display: 'flex' }}>
                  <Package size={12} />
                </span>
              )}
              <span className="ah-tree-actions">
                <button
                  className="ah-icon-btn"
                  title={info.enabled ? 'Disable' : 'Enable'}
                  onClick={(e) => { e.stopPropagation(); setEnabled(info.uuid, !info.enabled) }}
                >
                  {info.enabled ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </span>
            </div>
          )
        })}
      </div>
      {contextMenu.node}
    </div>
  )
}

function EntityIcon({ info }: { info: RowInfo }) {
  const entity = info.entity
  if (info.isPrefabRoot)
    return (
      <span className="ah-tree-icon">
        <Package size={13} />
      </span>
    )
  return (
    <span className="ah-tree-icon">
      {entity.has(CameraTrait) ? (
        <Camera size={13} />
      ) : entity.has(Light) ? (
        <Lightbulb size={13} />
      ) : entity.has(ModelRenderer) ? (
        <Package size={13} />
      ) : entity.has(PrimitiveMesh) ? (
        <Box size={13} />
      ) : (
        <span style={{ width: 13, height: 13, borderRadius: 3, border: '1px solid var(--text-muted)' }} />
      )}
    </span>
  )
}
