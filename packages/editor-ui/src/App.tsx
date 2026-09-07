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
import { viewportState } from './components/Viewport.js'
import { TopBar } from './components/TopBar.js'
import { Viewport } from './components/Viewport.js'
import { Inspector } from './components/Inspector.js'
import { BottomContextPanel, workspaceConfigs } from './components/BottomContextPanel.js'

/**
 * Editor shell — pixel-locked to Design/Editor Concept.png (1672×941):
 * a floating 22px-radius window on a dark page; top bar 46px; workspace =
 * hierarchy 292 | center (viewport + timeline 246) | inspector 352.
 * Hierarchy and inspector span the full workspace height; the timeline
 * exists only beneath the viewport.
 */
export function EditorApp() {
  const [booted, setBooted] = useState(false)
  const workspace = useEditorStore((s) => s.workspace)
  const viewportScale = useEditorStore((s) => s.viewportScale)

  useEffect(() => {
    void (async () => {
      const restored = await openSavedProject()
      if (!restored) bootstrapDefaultProject()
      setBooted(true)
    })()
  }, [])

  useGlobalShortcuts(booted)
  useAutosave(booted)

  const config = workspaceConfigs.find((entry) => entry.id === workspace) ?? workspaceConfigs[0]
  // Animation keeps the reference's larger timeline; other workspaces start compact.
  const bottomDefault = workspace === 'animation' ? 246 : 200

  return (
    <div className="ah-page">
      <div className="ah-shell">
        <TopBar />
        <div className="ah-workspace">
          <Group
            orientation="horizontal"
            className="ah-group-h"
            defaultLayout={loadLayout('main')}
            onLayoutChange={(layout) => saveLayout('main', layout)}
          >
            <Panel id="left" defaultSize={292} minSize={240} maxSize={360}>
              {config.left}
            </Panel>
            <Separator className="ah-resize-handle" />
            <Panel id="center" minSize={400}>
              <Group
                orientation="vertical"
                className="ah-group-v"
                defaultLayout={loadLayout('center')}
                onLayoutChange={(layout) => saveLayout('center', layout)}
              >
                <Panel id="viewport" minSize={200}>
                  <Viewport dpr={viewportScale} />
                </Panel>
                <Separator className="ah-resize-handle" />
                <Panel id="bottom" defaultSize={bottomDefault} minSize={120} maxSize={520}>
                  <BottomContextPanel workspace={workspace} />
                </Panel>
              </Group>
            </Panel>
            <Separator className="ah-resize-handle" />
            <Panel id="right" defaultSize={352} minSize={290} maxSize={430}>
              <Inspector />
            </Panel>
          </Group>
        </div>
      </div>
      <Notifications />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel layout persistence — editor-only (localStorage, never scene   */
/* data). Groups restore via defaultLayout on next mount.              */
/* ------------------------------------------------------------------ */

const LAYOUT_KEY = 'ahengine.layout.v1'

function saveLayout(group: string, layout: Record<string, number>): void {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    const all = raw ? (JSON.parse(raw) as Record<string, Record<string, number>>) : {}
    all[group] = layout
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(all))
  } catch {
    /* storage unavailable — sizes stay session-only */
  }
}

export function loadLayout(group: string): Record<string, number> | undefined {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (!raw) return undefined
    const all = JSON.parse(raw) as Record<string, Record<string, number>>
    return all[group]
  } catch {
    return undefined
  }
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
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        const store2 = useEditorStore.getState()
        store2.setSidebarTab('scene')
        requestAnimationFrame(() => {
          document.getElementById('ah-hierarchy-search')?.focus()
        })
        return
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (event.key === 'Escape') {
        // Cancel the current interaction: drop selection (menus/dialogs close themselves).
        if (store.selection.length > 0) store.select([])
        return
      }
      switch (event.key.toLowerCase()) {
        case 'q':
          store.setTool('select')
          break
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
    // Debounced: bumpWorld / setDirty → scheduleAutosave (2s idle → one save)
    const unsub = useEditorStore.subscribe((state, prev) => {
      if (state.dirty && !prev.dirty) void import('@ahengine/editor-core').then(m => m.scheduleAutosave())
    })
    return unsub
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 0 }}
            >
              <X size={12} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
