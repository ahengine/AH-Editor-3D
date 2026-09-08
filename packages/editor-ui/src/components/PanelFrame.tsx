import { useCallback, useEffect, useRef, useState } from 'react'
import { Maximize2, Minimize2, X, Pin, PinOff, Copy } from 'lucide-react'
import {
  usePanelStore,
  useEditorStore,
  panelContextMenuItems,
  type PanelId,
} from '@ahengine/editor-core'
import { useContextMenu } from '../hooks.js'

/**
 * PanelFrame — wraps any workspace panel with Unity-style behaviors:
 * - Right-click → context menu (Maximize, Float, Close)
 * - Double-click header → toggle maximize
 * - Floating mode: draggable, dock back via context menu
 * - Maximized: fills the workspace, Esc to restore
 * - Inspector Lock: pins to the current entity regardless of selection
 */

const PANEL_LABELS: Record<PanelId, string> = {
  hierarchy: 'Hierarchy',
  viewport: 'Viewport',
  inspector: 'Inspector',
  bottom: 'Project',
}

export function PanelFrame({
  id,
  children,
  side = 'left',
}: {
  id: PanelId
  children: React.ReactNode
  side?: 'left' | 'center' | 'right' | 'bottom'
}) {
  const maximized = usePanelStore((s) => s.maximized)
  const closed = usePanelStore((s) => s.closed)
  const floating = usePanelStore((s) => s.floating)
  const lockedUuid = usePanelStore((s) => s.lockedUuid)
  const dragging = usePanelStore((s) => s.dragging)
  const contextMenu = useContextMenu()
  const notify = useEditorStore.getState().notify
  const dragRef = useRef<{ x: number; y: number } | null>(null)

  const isMaximized = maximized === id
  const isClosed = closed.has(id)
  const isFloating = floating.has(id)
  const floatData = floating.get(id)
  const isLocked = id === 'inspector' && lockedUuid !== null
  const panelStore = usePanelStore.getState()

  // Esc to un-maximize
  useEffect(() => {
    if (!isMaximized) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') panelStore.toggleMaximize(id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isMaximized, id, panelStore])

  const onContextMenu = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const items = panelContextMenuItems(id, notify)
      if (id === 'inspector') {
        const selection = useEditorStore.getState().selection[0]
        items.unshift({
          label: isLocked ? 'Unlock Inspector' : 'Lock Inspector to Selection',
          onClick: () => {
            if (isLocked) {
              panelStore.setLocked(null)
              notify('info', 'Inspector unlocked — follows selection')
            } else if (selection) {
              panelStore.setLocked(selection)
              notify('success', 'Inspector locked — selection changes ignored')
            } else {
              notify('error', 'Select an entity first to lock the Inspector')
            }
          },
        })
      }
      contextMenu.open(event, items)
    },
    [id, isLocked, notify, contextMenu, panelStore]
  )

  const onDragStart = useCallback(
    (event: React.PointerEvent) => {
      if (!isFloating) return
      dragRef.current = { x: event.clientX, y: event.clientY }
      panelStore.setDragging(id)
      const onMove = (e: PointerEvent) => {
        if (!dragRef.current) return
        const dx = e.clientX - dragRef.current.x
        const dy = e.clientY - dragRef.current.y
        dragRef.current = { x: e.clientX, y: e.clientY }
        const current = usePanelStore.getState().floating.get(id)
        if (current) {
          panelStore.updateFloat(id, current.x + dx, current.y + dy)
        }
      }
      const onUp = () => {
        dragRef.current = null
        panelStore.setDragging(null)
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [isFloating, id, panelStore]
  )

  if (isClosed) {
    return (
      <div
        className="ah-panel ah-panel-closed"
        onContextMenu={onContextMenu}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: 40 }}
        onClick={() => panelStore.restorePanel(id)}
        title="Click to restore this panel"
      >
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {PANEL_LABELS[id]} — closed (click to restore)
        </span>
      </div>
    )
  }

  // Floating: absolute positioned overlay
  if (isFloating && floatData) {
    return (
      <>
        <div
          className={`ah-panel ah-panel-floating ${dragging === id ? 'dragging' : ''}`}
          style={{
            position: 'fixed',
            left: floatData.x,
            top: floatData.y,
            width: floatData.width,
            height: floatData.height,
            zIndex: 900,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 60px rgba(0,0,0,.45)',
          }}
          onContextMenu={onContextMenu}
        >
          <div
            className="ah-panel-head"
            style={{ cursor: 'grab', borderBottom: '1px solid var(--border-subtle)' }}
            onPointerDown={onDragStart}
            onDoubleClick={() => panelStore.toggleMaximize(id)}
          >
            <span className="ah-panel-title">{PANEL_LABELS[id]}</span>
            {isLocked && <Pin size={11} style={{ color: 'var(--accent)' }} />}
            <div style={{ flex: 1 }} />
            <button className="ah-icon-btn small" title="Dock back" onClick={() => panelStore.toggleFloat(id)}>
              <Minimize2 size={11} />
            </button>
            <button className="ah-icon-btn small" title="Close" onClick={() => panelStore.closePanel(id)}>
              <X size={11} />
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>{children}</div>
        </div>
        {contextMenu.node}
      </>
    )
  }

  // Normal docked or maximized
  return (
    <>
      <div
        className={`ah-panel ah-panel-frame ${isMaximized ? 'maximized' : ''}`}
        style={{
          ...(isMaximized
            ? { position: 'fixed', inset: 8, zIndex: 900, boxShadow: '0 24px 80px rgba(0,0,0,.5)' }
            : {}),
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          flex: side === 'center' ? 1 : 'none',
        }}
        onContextMenu={onContextMenu}
      >
        {/* Panel header bar (only for floating-capable panels) */}
        <div
          className="ah-panel-head"
          style={{
            height: 28,
            minHeight: 28,
            borderBottom: '1px solid var(--border-subtle)',
            cursor: 'default',
            userSelect: 'none',
          }}
          onDoubleClick={() => panelStore.toggleMaximize(id)}
        >
          <span className="ah-panel-title" style={{ fontSize: 10 }}>{PANEL_LABELS[id]}</span>
          {isLocked && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--accent)' }}>
              <Pin size={10} /> Locked
            </span>
          )}
          <div style={{ flex: 1 }} />
          {!isMaximized && (
            <button
              className="ah-icon-btn small"
              style={{ width: 18, height: 18 }}
              title="Maximize (dbl-click header or Esc to restore)"
              onClick={() => panelStore.toggleMaximize(id)}
            >
              <Maximize2 size={10} />
            </button>
          )}
          {isMaximized && (
            <button
              className="ah-icon-btn small"
              style={{ width: 18, height: 18 }}
              title="Restore (Esc)"
              onClick={() => panelStore.toggleMaximize(id)}
            >
              <Minimize2 size={10} />
            </button>
          )}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
      </div>
      {contextMenu.node}
    </>
  )
}
