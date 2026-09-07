import { useEffect, useState } from 'react'
import { Panel, Group, Separator } from 'react-resizable-panels'
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import {
  deleteSelection,
  duplicateSelection,
  redo,
  saveProject,
  undo,
  useEditorStore,
  bootstrapDefaultProject,
  openSavedProject,
} from '@ahengine/editor-core'
import { MenuBar } from './components/MenuBar.js'
import { Toolbar } from './components/Toolbar.js'
import { HierarchyPanel } from './components/HierarchyPanel.js'
import { Viewport, viewportState } from './components/Viewport.js'
import { Inspector } from './components/Inspector.js'
import { BottomPanel } from './components/BottomPanel.js'

/**
 * Editor shell — layout mirrors Design/Editor Concept.png:
 * full-height Hierarchy on the left; Viewport + Inspector above a wide
 * bottom dock (Assets / Materials / Animator).
 */
export function EditorApp() {
  const [booted, setBooted] = useState(false)

  useEffect(() => {
    void (async () => {
      const restored = await openSavedProject()
      if (!restored) bootstrapDefaultProject()
      setBooted(true)
    })()
  }, [])

  useGlobalShortcuts(booted)
  useAutosave(booted)

  return (
    <div className="ah-app">
      <MenuBar />
      <Toolbar />
      <div className="ah-body">
        <Group orientation="horizontal" className="ah-group-h">
          <Panel defaultSize="19%" minSize="12%" maxSize="32%">
            <HierarchyPanel />
          </Panel>
          <Separator className="ah-resize-handle" />
          <Panel minSize="30%">
            <Group orientation="vertical" className="ah-group-v">
              <Panel defaultSize="62%" minSize="25%">
                <Group orientation="horizontal" className="ah-group-h">
                  <Panel defaultSize="68%" minSize="30%">
                    <Viewport />
                  </Panel>
                  <Separator className="ah-resize-handle" />
                  <Panel defaultSize="32%" minSize="18%" maxSize="45%">
                    <Inspector />
                  </Panel>
                </Group>
              </Panel>
              <Separator className="ah-resize-handle" />
              <Panel defaultSize="38%" minSize="10%">
                <BottomPanel />
              </Panel>
            </Group>
          </Panel>
        </Group>
      </div>
      <Notifications />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function useGlobalShortcuts(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable
      const store = useEditorStore.getState()
      const mod = event.ctrlKey || event.metaKey

      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveProject()
        return
      }
      if (typing) return

      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
        return
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      switch (event.key.toLowerCase()) {
        case 'w':
          store.setTool('translate')
          break
        case 'e':
          store.setTool('rotate')
          break
        case 'r':
          store.setTool('scale')
          break
        case 'f':
          viewportState.focusRequests += 1
          break
        case 'delete':
        case 'backspace':
          deleteSelection()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled])
}

function useAutosave(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return
    const interval = window.setInterval(() => {
      if (useEditorStore.getState().dirty) void saveProject()
    }, 30_000)
    return () => window.clearInterval(interval)
  }, [enabled])
}

function Notifications() {
  const notifications = useEditorStore((s) => s.notifications)
  const dismiss = useEditorStore((s) => s.dismissNotification)

  useEffect(() => {
    if (notifications.length === 0) return
    const timer = window.setTimeout(() => {
      dismiss(notifications[0].id)
    }, 4200)
    return () => window.clearTimeout(timer)
  }, [notifications, dismiss])

  if (notifications.length === 0) return null
  return (
    <div className="ah-notifications">
      {notifications.map((notification) => (
        <div className={`ah-notification ${notification.kind}`} key={notification.id}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            {notification.kind === 'error' ? (
              <AlertCircle size={14} style={{ flex: 'none', marginTop: 1 }} />
            ) : notification.kind === 'success' ? (
              <CheckCircle2 size={14} style={{ flex: 'none', marginTop: 1 }} />
            ) : (
              <Info size={14} style={{ flex: 'none', marginTop: 1 }} />
            )}
            <span style={{ flex: 1 }}>{notification.message}</span>
            <button
              onClick={() => dismiss(notification.id)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0 }}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
