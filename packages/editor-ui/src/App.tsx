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
  redo,
  saveProject,
  undo,
  useEditorStore,
  bootstrapDefaultProject,
  openSavedProject,
} from '@ahengine/editor-core'
import * as THREE from 'three'
import { findEntityByUuid, Transform } from '@ahengine/ecs-runtime'
import { gizmoDragTargets } from '@ahengine/ecs-runtime/react'
import { editComponentField } from '@ahengine/editor-core'
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
      if (event.key === 'Shift' && (viewportState.arrowNav.up || viewportState.arrowNav.down || viewportState.arrowNav.left || viewportState.arrowNav.right)) {
        // Boost engages the moment Shift goes down — never waits for the
        // next (repeat-suppressed) arrow keydown.
        viewportState.arrowNav.fast = true
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
        case 'arrowdown': {
          // Held-state arrow movement: the render loop drives an eased
          // velocity while the key stays down — camera when nothing is
          // selected, the selected entity otherwise. Independent of OS
          // key-repeat (which stops when a second key like Shift is
          // pressed — that used to freeze movement mid-flight).
          const nav = viewportState.arrowNav
          if (event.key === 'ArrowLeft') nav.left = true
          else if (event.key === 'ArrowRight') nav.right = true
          else if (event.key === 'ArrowUp') nav.up = true
          else nav.down = true
          nav.fast = event.shiftKey || nav.fast
          nav.lastKeydownAt = performance.now()
          break
        }
        default:
          break
      }
      if (event.key.startsWith('Arrow')) event.preventDefault()
    }
    const releaseKey = (event: KeyboardEvent) => {
      const nav = viewportState.arrowNav
      const isArrow = event.key.startsWith('Arrow')
      if (event.key === 'ArrowLeft') nav.left = false
      else if (event.key === 'ArrowRight') nav.right = false
      else if (event.key === 'ArrowUp') nav.up = false
      else if (event.key === 'ArrowDown') nav.down = false
      else if (event.key === 'Shift') nav.fast = false
      if (isArrow) nav.lastKeyupAt = performance.now()
      if (!isArrow) return
      // Quick tap whose gesture never reached the render loop (starved
      // frames): perform one discrete grid step right here so taps stay
      // crisp regardless of frame rate.
      const held = performance.now() - nav.lastKeydownAt < 200
      if (held && !nav.gestureActive) tapStep(event.key)
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
 * Frame-rate-independent tap: one grid step (camera-relative, ground
 * plane) for the camera, or for the selected entity via a single undoable
 * command. Used when the key is released before the render loop ever saw
 * it held; longer presses are handled by the eased per-frame system.
 */
function tapStep(key: string): void {
  const store = useEditorStore.getState()
  const camera = viewportState.camera
  if (!camera) return
  const step = store.snapEnabled ? store.snapTranslate : 0.25
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
  fwd.y = 0
  if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1)
  fwd.normalize()
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion)
  right.y = 0
  if (right.lengthSq() < 1e-6) right.set(1, 0, 0)
  right.normalize()
  const dir = new THREE.Vector3()
  if (key === 'ArrowLeft') dir.copy(right).negate()
  else if (key === 'ArrowRight') dir.copy(right)
  else if (key === 'ArrowUp') dir.copy(fwd)
  else if (key === 'ArrowDown') dir.copy(fwd).negate()
  dir.multiplyScalar(step)

  const uuid = store.selection[0]
  const entity = uuid ? findEntityByUuid(store.world, uuid) : undefined
  const transform = entity?.get(Transform)
  if (entity && transform && !gizmoDragTargets.has(uuid!)) {
    editComponentField(uuid!, 'core.transform', {
      position: {
        x: transform.position.x + dir.x,
        y: transform.position.y,
        z: transform.position.z + dir.z,
      },
    })
  } else {
    camera.position.add(dir)
    const controls = viewportState.controls
    if (controls) {
      controls.target.add(dir)
      controls.update()
    }
  }
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
