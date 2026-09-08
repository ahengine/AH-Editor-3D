import { useEffect, useState } from 'react'

declare global {
  interface ImportMeta {
    readonly env?: { readonly DEV?: boolean }
  }
}

/** True in vite dev/HMR builds; the bundler replaces this statically. */
const isDevBuild = import.meta.env?.DEV === true
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react'
import {
  deleteSelection,
  duplicateSelection,
  editComponentField,
  redo,
  saveProject,
  undo,
  useEditorStore,
  bootstrapDefaultProject,
  openSavedProject,
} from '@ahengine/editor-core'
import { findEntityByUuid, Transform } from '@ahengine/ecs-runtime'
import { viewportState } from './viewportState.js'
import { installTransformChainProbe } from './transformChainProbe.js'
import { TopBar } from './components/TopBar.js'
import { Viewport } from './components/Viewport.js'
import { Inspector } from './components/Inspector.js'
import { BottomContextPanel, workspaceConfigs } from './components/BottomContextPanel.js'
import { CommandPalette } from './components/CommandPalette.js'
import { ProblemsPanel } from './components/ProblemsPanel.js'

/**
 * Editor shell — pixel-locked to Design/Editor Concept.png (1672×941):
 * a floating 22px-radius window on a dark page; top bar 46px; workspace =
 * hierarchy 292 | center (viewport + timeline 246) | inspector 352.
 * Hierarchy and inspector span the full workspace height; the timeline
 * exists only beneath the viewport.
 */
export function EditorApp() {
  const [booted, setBooted] = useState(false)
  if (isDevBuild) installTransformChainProbe()
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

  return (
    <div className="ah-page">
      <div className="ah-shell">
        <TopBar />
        <div className={`ah-layout ah-layout-${workspace}`}>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>{config.left}</div>
          <div className={`ah-layout-center ah-layout-center-${workspace}`}>
            <Viewport dpr={viewportScale} />
            <BottomContextPanel workspace={workspace} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Inspector />
          </div>
        </div>
      </div>
      <Notifications />
      <CommandPalette />
      <ProblemsPanel />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Panel layout persistence — editor-only (localStorage, never scene   */
/* data). Groups restore via defaultLayout on next mount.              */
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
        useEditorStore.getState().setPaletteOpen(true)
        return
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelection()
        return
      }
      if (event.key === 'Escape') {
        // Cancel the current interaction: palette/problems close first,
        // then drop selection (menus/dialogs close themselves).
        if (store.paletteOpen) store.setPaletteOpen(false)
        else if (store.problemsOpen) store.setProblemsOpen(false)
        else if (store.selection.length > 0) store.select([])
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
        case 'arrowleft':
        case 'arrowright':
        case 'arrowup':
        case 'arrowdown':
          if (store.selection[0]) nudgeSelection(event.key, event.shiftKey)
          else {
            // Smooth navigation: mark the key as held — the render loop
            // drives the camera with eased velocity while it stays down.
            const nav = viewportState.arrowNav
            if (event.key === 'ArrowLeft') nav.left = true
            else if (event.key === 'ArrowRight') nav.right = true
            else if (event.key === 'ArrowUp') nav.up = true
            else nav.down = true
            nav.fast = event.shiftKey || nav.fast
          }
          break
        default:
          break
      }
      if (event.key.startsWith('Arrow')) event.preventDefault()
    }
    const releaseKey = (event: KeyboardEvent) => {
      const nav = viewportState.arrowNav
      if (event.key === 'ArrowLeft') nav.left = false
      else if (event.key === 'ArrowRight') nav.right = false
      else if (event.key === 'ArrowUp') nav.up = false
      else if (event.key === 'ArrowDown') nav.down = false
      else if (event.key === 'Shift') nav.fast = false
    }
    const releaseAll = () => {
      viewportState.arrowNav.up = false
      viewportState.arrowNav.down = false
      viewportState.arrowNav.left = false
      viewportState.arrowNav.right = false
      viewportState.arrowNav.fast = false
    }
    window.addEventListener('keydown', handler)
    window.addEventListener('keyup', releaseKey)
    window.addEventListener('blur', releaseAll)
    return () => {
      window.removeEventListener('keydown', handler)
      window.removeEventListener('keyup', releaseKey)
      window.removeEventListener('blur', releaseAll)
    }
  }, [enabled])
}

/**
 * Unity-style arrow-key nudge: moves the selected entity on the ground
 * plane (left/right = X, up/down = Z forward/back). Shift speeds it up;
 * snapping, when enabled, defines the base step. Rapid presses coalesce
 * into ONE undo entry (SetComponentFieldCommand coalesceKey).
 */
function nudgeSelection(key: string, fast: boolean): void {
  const store = useEditorStore.getState()
  const uuid = store.selection[0]
  if (!uuid) return
  const base = store.snapEnabled ? store.snapTranslate : 0.25
  const step = base * (fast ? 4 : 1)
  const entity = findEntityByUuid(store.world, uuid)
  const transform = entity?.get(Transform)
  if (!transform) return
  const position = { x: transform.position.x, y: transform.position.y, z: transform.position.z }
  const arrow = key.toLowerCase()
  if (arrow === 'arrowleft') position.x -= step
  else if (arrow === 'arrowright') position.x += step
  else if (arrow === 'arrowup') position.z -= step
  else if (arrow === 'arrowdown') position.z += step
  editComponentField(uuid, 'core.transform', { position })
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
