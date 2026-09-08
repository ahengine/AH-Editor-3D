import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, X, Pin, PinOff, LayoutGrid } from 'lucide-react'
import {
  useWindowPanels,
  useEditorStore,
  type PanelInstance,
  type DockSide,
} from '@ahengine/editor-core'
import { useContextMenu } from '../hooks.js'
import { HierarchyPanel } from './HierarchyPanel.js'
import { Inspector } from './Inspector.js'
import { Viewport } from './Viewport.js'
import { BottomContextPanel } from './BottomContextPanel.js'

/**
 * WindowPanel — renders a single panel instance (docked or floating) with
 * Unity-style context menu, drag-to-dock zones, maximize, close, lock.
 */

/** Map panel type to its content component. */
function PanelContent({ instance }: { instance: PanelInstance }) {
  switch (instance.type) {
    case 'hierarchy':
      return <HierarchyPanel />
    case 'viewport':
      return <Viewport />
    case 'inspector':
      return <Inspector />
    case 'project':
      return <BottomContextPanel workspace={useEditorStore.getState().workspace} />
    default:
      return <div className="ah-empty">{instance.label}</div>
  }
}

export function WindowPanel({ instance }: { instance: PanelInstance }) {
  const maximizedId = useWindowPanels((s) => s.maximizedId)
  const draggingId = useWindowPanels((s) => s.draggingId)
  const contextMenu = useContextMenu()
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const isMaximized = maximizedId === instance.instanceId
  const isFloating = instance.dock === null
  const isLocked = instance.lockedUuid !== null && instance.lockedUuid !== undefined

  // Esc to un-maximize
  useEffect(() => {
    if (!isMaximized) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useWindowPanels.getState().toggleMaximize(instance.instanceId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMaximized, instance.instanceId])

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const items: { label: string; onClick: () => void; separatorBefore?: boolean }[] = []

      if (instance.type === 'inspector') {
        const selection = useEditorStore.getState().selection[0]
        items.push({
          label: isLocked ? 'Unlock Inspector' : 'Lock Inspector to Selection',
          onClick: () => {
            if (isLocked) {
              useWindowPanels.getState().setLocked(instance.instanceId, null)
            } else if (selection) {
              useWindowPanels.getState().setLocked(instance.instanceId, selection)
            }
          },
        })
      }

      items.push(
        {
          label: isMaximized ? 'Restore Panel' : 'Maximize Panel',
          onClick: () => useWindowPanels.getState().toggleMaximize(instance.instanceId),
        },
        {
          label: isFloating ? 'Dock Panel' : 'Float Panel',
          onClick: () => {
            if (isFloating) {
              useWindowPanels.getState().dockPanel(instance.instanceId, 'right')
            } else {
              useWindowPanels.getState().floatPanel(instance.instanceId)
            }
          },
        }
      )

      if (isFloating) {
        items.push(
          { separatorBefore: true, label: 'Dock Left', onClick: () => useWindowPanels.getState().dockPanel(instance.instanceId, 'left') },
          { label: 'Dock Center', onClick: () => useWindowPanels.getState().dockPanel(instance.instanceId, 'center') },
          { label: 'Dock Right', onClick: () => useWindowPanels.getState().dockPanel(instance.instanceId, 'right') },
          { label: 'Dock Bottom', onClick: () => useWindowPanels.getState().dockPanel(instance.instanceId, 'bottom') }
        )
      }

      items.push(
        { separatorBefore: true, label: 'Close Panel', onClick: () => useWindowPanels.getState().closePanel(instance.instanceId) }
      )

      contextMenu.open(event, items)
    },
    [instance, isLocked, isMaximized, isFloating, contextMenu]
  )

  const onDragStart = useCallback(
    (event: React.PointerEvent) => {
      if (!isFloating) return
      dragRef.current = { x: event.clientX, y: event.clientY }
      useWindowPanels.getState().setDragging(instance.instanceId)
      const onMove = (e: PointerEvent) => {
        if (!dragRef.current) return
        const dx = e.clientX - dragRef.current.x
        const dy = e.clientY - dragRef.current.y
        dragRef.current = { x: e.clientX, y: e.clientY }
        const p = useWindowPanels.getState().panels.find((p) => p.instanceId === instance.instanceId)
        if (p) {
          useWindowPanels.getState().moveFloating(instance.instanceId, p.x + dx, p.y + dy)
        }
        // Detect dock zones (edges of the workspace)
        detectDockZone(e.clientX, e.clientY, useWindowPanels.getState())
      }
      const onUp = () => {
        dragRef.current = null
        useWindowPanels.getState().setDragging(null)
        // If over a zone, dock
        const zone = useWindowPanels.getState().zoneHighlight
        if (zone) {
          useWindowPanels.getState().dockPanel(instance.instanceId, zone.side)
        }
        useWindowPanels.getState().setZoneHighlight(null)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [isFloating, instance.instanceId]
  )

  // Floating panel
  if (isFloating) {
    return (
      <>
        <div
          className={`ah-panel ah-window-panel-floating ${draggingId === instance.instanceId ? 'dragging' : ''}`}
          style={{
            position: 'fixed',
            left: instance.x,
            top: instance.y,
            width: instance.width,
            height: instance.height,
            zIndex: 900,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,.45)',
          }}
          onContextMenu={onContextMenu}
        >
          <div
            className="ah-window-panel-head"
            onPointerDown={onDragStart}
            onDoubleClick={() => useWindowPanels.getState().toggleMaximize(instance.instanceId)}
          >
            <span>{instance.label}</span>
            {isLocked && <Pin size={10} style={{ color: 'var(--accent)' }} />}
            <div style={{ flex: 1 }} />
            <button className="ah-window-panel-btn" title="Maximize" onClick={() => useWindowPanels.getState().toggleMaximize(instance.instanceId)}>
              <Maximize2 size={10} />
            </button>
            <button className="ah-window-panel-btn" title="Close" onClick={() => useWindowPanels.getState().closePanel(instance.instanceId)}>
              <X size={10} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <PanelContent instance={instance} />
          </div>
        </div>
        {contextMenu.node}
      </>
    )
  }

  // Docked panel
  return (
    <>
      <div
        className={`ah-panel ah-window-panel ${isMaximized ? 'maximized' : ''}`}
        style={{
          ...(isMaximized
            ? { position: 'fixed' as const, inset: 8, zIndex: 900, boxShadow: '0 24px 80px rgba(0,0,0,.5)' }
            : {}),
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flex: 1,
        }}
        onContextMenu={onContextMenu}
      >
        <div
          className="ah-window-panel-head"
          onDoubleClick={() => useWindowPanels.getState().toggleMaximize(instance.instanceId)}
        >
          <span>{instance.label}</span>
          {isLocked && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--accent)' }}>
              <Pin size={9} /> Locked
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button className="ah-window-panel-btn" title={isMaximized ? 'Restore (Esc)' : 'Maximize'} onClick={() => useWindowPanels.getState().toggleMaximize(instance.instanceId)}>
            {isMaximized ? <Minimize2 size={10} /> : <Maximize2 size={10} />}
          </button>
          <button className="ah-window-panel-btn" title="Float" onClick={() => useWindowPanels.getState().floatPanel(instance.instanceId)}>
            <LayoutGrid size={10} />
          </button>
          <button className="ah-window-panel-btn" title="Close" onClick={() => useWindowPanels.getState().closePanel(instance.instanceId)}>
            <X size={10} />
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <PanelContent instance={instance} />
        </div>
      </div>
      {contextMenu.node}
    </>
  )
}

/**
 * Detect which dock zone the cursor is in — Unity-style tight strips:
 * the cursor must be INSIDE a narrow band (56px) along a workspace edge.
 * The highlight rect is exactly that band (the actual drop location), not
 * a giant region. No giant "center" zone — releasing outside every band
 * simply keeps the panel floating.
 */
function detectDockZone(
  x: number,
  y: number,
  store: ReturnType<typeof useWindowPanels.getState>
): void {
  const workspace = document.querySelector('.ah-shell')?.getBoundingClientRect()
  if (!workspace) return
  const band = 56
  const inLeft = x >= workspace.left && x <= workspace.left + band
  const inRight = x <= workspace.right && x >= workspace.right - band
  const inBottom = y >= workspace.bottom - band && y <= workspace.bottom
  const inTop = y >= workspace.top && y <= workspace.top + band

  // Priority: left/right edges first (vertical strips), then top/bottom.
  let side: DockSide | null = null
  const rect = { left: 0, top: 0, width: 0, height: 0 }
  if (inLeft && !(inBottom || inTop)) {
    side = 'left'
    Object.assign(rect, { left: workspace.left, top: workspace.top, width: band, height: workspace.height })
  } else if (inRight && !(inBottom || inTop)) {
    side = 'right'
    Object.assign(rect, { left: workspace.right - band, top: workspace.top, width: band, height: workspace.height })
  } else if (inBottom) {
    side = 'bottom'
    Object.assign(rect, { left: workspace.left, top: workspace.bottom - band, width: workspace.width, height: band })
  } else if (inTop) {
    side = 'center'
    Object.assign(rect, { left: workspace.left, top: workspace.top, width: workspace.width, height: band })
  }

  if (side) {
    store.setZoneHighlight({ side, rect })
  } else {
    store.setZoneHighlight(null)
  }
}

/** Dock zone overlay highlight (Unity-style blue preview). */
export function DockZoneOverlay() {
  const zoneHighlight = useWindowPanels((s) => s.zoneHighlight)
  if (!zoneHighlight) return null
  const r = zoneHighlight.rect
  return (
    <div
      style={{
        position: 'fixed',
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        background: 'rgba(120,168,255,.15)',
        border: '2px solid rgba(120,168,255,.5)',
        borderRadius: 12,
        pointerEvents: 'none',
        zIndex: 850,
        transition: 'all 120ms ease',
      }}
    />
  )
}
