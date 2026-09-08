import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import {
  Activity,
  ChevronDown,
  Focus,
  LayoutGrid,
  Magnet,
  MousePointer2,
  Move3d,
  Orbit,
  Rotate3d,
  Scale3d,
  Sun,
} from 'lucide-react'
import { Light, EntityMeta, ThreeObject, Transform, findEntityByUuid } from '@ahengine/ecs-runtime'
import { KootaScene, gizmoDragTargets } from '@ahengine/ecs-runtime/react'
import { viewportState } from '../viewportState.js'
import {
  animator as editorAnimator,
  environmentLookup,
  getPlayHandle,
  materialService,
  pausePlayMode,
  resolveAssetUri,
  resumePlayMode,
  stopPlayMode,
  useEditorStore,
} from '@ahengine/editor-core'
import { createEntity, editComponentField, instantiatePrefabAction } from '@ahengine/editor-core'
import { commandStack, savePreferences } from '@ahengine/editor-core'
import { getComponentDef, applyPatch } from '@ahengine/ecs-runtime'
import { IconButton, Popover } from '../ui/primitives.js'
import { MenuList } from '../hooks.js'

/**
 * WebGPU viewport: orbit camera, transform gizmo, click picking, grid,
 * selection outline, diagnostics. Per-frame work stays imperative — React
 * never rerenders on transform movement.
 */

function isInSceneGraph(object: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = object
  while (cursor) {
    if ((cursor as THREE.Scene).isScene) return true
    cursor = cursor.parent
  }
  return false
}

/** GPU capability preflight — never pretend a backend is active. */
function detectBackendSupport(): 'webgpu' | 'webgl2' | 'none' {
  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu) return 'webgpu'
  } catch {
    /* navigator.gpu access threw — treat as absent */
  }
  try {
    const canvas = document.createElement('canvas')
    if (canvas.getContext('webgl2')) return 'webgl2'
  } catch {
    /* WebGL2 probe threw */
  }
  return 'none'
}

export function Viewport({ dpr = 1 }: { dpr?: number }) {
  const playMode = useEditorStore((s) => s.playMode)
  const diagnosticsOpen = useEditorStore((s) => s.diagnosticsOpen)
  const [dragState, setDragState] = useState('')
  const [support] = useState(detectBackendSupport)

  const gl = useMemo(
    () =>
      async (props: unknown): Promise<import('three/webgpu').WebGPURenderer> => {
        let renderer: import('three/webgpu').WebGPURenderer | null = null
        try {
          const primary = new WebGPURenderer({ ...(props as object), antialias: true })
          await primary.init()
          renderer = primary
        } catch {
          // WebGPU unavailable — WebGPURenderer falls back to its WebGL2 backend.
          const fallback = new WebGPURenderer({ ...(props as object), antialias: true, forceWebGL: true })
          await fallback.init()
          renderer?.dispose()
          useEditorStore.getState().setBackend('webgl2')
          return fallback
        }
        const backend = (renderer as unknown as { backend: { isWebGPUBackend?: boolean } }).backend
        useEditorStore.getState().setBackend(backend?.isWebGPUBackend ? 'webgpu' : 'webgl2')
        return renderer as import('three/webgpu').WebGPURenderer
      },
    []
  )

  return (
    <div
      className={`ah-viewport-wrap ${dragState}`}
      onDrop={onDropAsset}
      onDragOver={onDragOverAsset}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragState('')
      }}
    >
      {support === 'none' ? (
        <div className="ah-viewport-fatal" role="alert">
          <div className="ah-viewport-fatal-title">No GPU backend available</div>
          <div>
            This editor requires WebGPU (preferred) or WebGL2. Neither could be
            initialized in this browser.
          </div>
          <ul>
            <li>Use a Chromium-based browser (Chrome/Edge 113+) for WebGPU</li>
            <li>Enable hardware acceleration in browser settings</li>
            <li>WebGPU requires a secure context (https or localhost)</li>
          </ul>
          <div>
            All authoring tools (hierarchy, inspector, materials, animation,
            prefabs, particles) still work — only the 3D preview is unavailable.
          </div>
        </div>
      ) : (
        <Canvas
          gl={gl}
          dpr={dpr}
          camera={{ fov: 50, near: 0.1, far: 600, position: [9, 6, 12] }}
          shadows
          onCreated={({ gl, camera }) => {
            viewportState.camera = camera as THREE.PerspectiveCamera
            void gl
          }}
        >
          <ViewportScene />
        </Canvas>
      )}

      <ViewportToolbar />
      <ViewportRail />
      <ViewportStatus />
      {playMode !== 'edit' && <PlayModeBanner mode={playMode} />}
      {diagnosticsOpen && <DiagnosticsPanel />}
      {support !== 'none' && <AxisWidget />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Scene contents                                                      */
/* ------------------------------------------------------------------ */

function ViewportScene() {
  const world = useEditorStore((s) => s.world)
  const playWorld = useEditorStore((s) => s.playWorld)
  const playMode = useEditorStore((s) => s.playMode)
  const selection = useEditorStore((s) => s.selection)
  const tool = useEditorStore((s) => s.tool)
  const space = useEditorStore((s) => s.space)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const sceneSettings = useEditorStore((s) => s.sceneSettings)

  const activeWorld = playMode === 'edit' ? world : (playWorld ?? world)
  const isPlay = playMode !== 'edit'
  const playAnimator = getPlayHandle()?.animator ?? editorAnimator
  const animator = isPlay ? playAnimator : editorAnimator

  // Stable identity: KootaScene tears down and rebuilds every runtime object
  // when this prop changes, so an inline object literal here would recreate
  // the whole scene graph on every ordinary re-render (selection, tool…).
  const runtime = useMemo(() => ({ materials: materialService, animator }), [animator])

  return (
    <>
      {!isPlay && <EditorRig selection={selection} tool={tool} space={space} snapEnabled={snapEnabled} world={world} />}
      <KootaScene
        world={activeWorld}
        runtime={runtime}
        useGameCamera={isPlay}
        settings={sceneSettings}
        environmentLookup={environmentLookup}
        resolveAssetUri={resolveAssetUri}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Editor rig: grid, orbit, gizmo, picking, outline, focus             */
/* ------------------------------------------------------------------ */

const _pivotVec = new THREE.Vector3()
const _orbitOffset = new THREE.Vector3()
const _orbitSpherical = new THREE.Spherical()

/** Modifier-held state for the Unity-style left-button orbit swaps. */
let eventAltHeld = false
let eventCtrlOrbit = false

function EditorRig({
  selection,
  tool,
  space,
  snapEnabled,
  world,
}: {
  selection: string[]
  tool: 'select' | 'translate' | 'rotate' | 'scale'
  space: 'local' | 'world'
  snapEnabled: boolean
  world: import('koota').World
}) {
  const scene = useThree((state) => state.scene)
  const gl = useThree((state) => state.gl)
  const camera = useThree((state) => state.camera)
  const controlsRef = useRef<OrbitControls | null>(null)
  const gizmoRef = useRef<TransformControls | null>(null)
  const outlineRef = useRef<THREE.BoxHelper | null>(null)
  const dragStart = useRef<{ position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } | null>(null)
  const pointerDown = useRef<{ x: number; y: number; gizmoDragging: boolean } | null>(null)
  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const fpsAccum = useRef({ frames: 0, time: 0, lastCalls: 0, lastTriangles: 0 })

  /* Orbit controls */
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.target.set(0, 1, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.maxPolarAngle = Math.PI * 0.495
    controls.minDistance = 0.5
    controls.maxDistance = 220

    // Unity Scene-view navigation: wheel = zoom (toward the cursor),
    // middle-drag = pan, right-drag = orbit, Alt+left-drag = orbit.
    // Left button alone stays free for selection and the transform gizmo.
    controls.zoomToCursor = true
    const unityButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE } as unknown as typeof controls.mouseButtons
    const applyButtons = () => {
      const leftOrbit = eventAltHeld || eventCtrlOrbit
      controls.mouseButtons = leftOrbit ? { ...unityButtons, LEFT: THREE.MOUSE.ROTATE } : unityButtons
    }
    const onAltDown = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return
      eventAltHeld = true
      applyButtons()
    }
    const onAltUp = (event: KeyboardEvent) => {
      if (event.key !== 'Alt') return
      eventAltHeld = false
      applyButtons()
    }

    // Ctrl+left-drag = orbit AROUND the selected entity: while Ctrl is held
    // the orbit pivot snaps to the selection's world position and STAYS
    // there after release (Unity-like — no look-jump when the gesture
    // ends). Without a selection the gesture stays inert; Ctrl+click
    // multi-select is unaffected (pointer drags never reach the click
    // handler).
    const selectionPivot = () => {
      const uuid = useEditorStore.getState().selection[0]
      if (!uuid) return null
      const object = findEntityByUuid(world, uuid)?.get(ThreeObject)?.object ?? null
      return object && isInSceneGraph(object) ? object.getWorldPosition(_pivotVec) : null
    }
    const onCtrlDown = (event: KeyboardEvent) => {
      if (event.key !== 'Control' || event.repeat || eventCtrlOrbit) return
      const pivot = selectionPivot()
      if (!pivot) return
      controls.target.copy(pivot)
      controls.update()
      eventCtrlOrbit = true
      applyButtons()
    }
    const onCtrlUp = (event: KeyboardEvent) => {
      if (event.key !== 'Control' || !eventCtrlOrbit) return
      eventCtrlOrbit = false
      endSelectionOrbit()
      applyButtons()
    }
    const onBlur = () => {
      eventAltHeld = false
      eventCtrlOrbit = false
      endSelectionOrbit()
      applyButtons()
    }

    // Manual orbit for Ctrl+left-drag: OrbitControls itself converts any
    // ctrl/meta/shift-drag into PAN (three.js convention), which would
    // hijack the gesture. We arm on pointerdown (capture phase — without
    // swallowing the event, so Ctrl+CLICK multi-select still works) and
    // take over only once the pointer actually MOVES: OrbitControls is
    // disabled for the rest of the gesture and we rotate the camera
    // around controls.target ourselves. controls.update() re-derives
    // spherical state from the camera each frame, so the manual placement
    // is preserved afterwards.
    const selectionOrbit = { armed: false, started: false, x: 0, y: 0 }
    const onCanvasPointerDownCapture = (event: PointerEvent) => {
      if (event.button !== 0 || !eventCtrlOrbit || !event.isPrimary) return
      selectionOrbit.armed = true
      selectionOrbit.started = false
      selectionOrbit.x = event.clientX
      selectionOrbit.y = event.clientY
      window.addEventListener('pointermove', onSelectionOrbitMove)
      window.addEventListener('pointerup', endSelectionOrbit)
    }
    const onSelectionOrbitMove = (event: PointerEvent) => {
      if (!selectionOrbit.armed) return
      // A gizmo drag under the pointer wins — stand down.
      if (gizmoRef.current?.dragging) {
        endSelectionOrbit()
        return
      }
      const dx = event.clientX - selectionOrbit.x
      const dy = event.clientY - selectionOrbit.y
      selectionOrbit.x = event.clientX
      selectionOrbit.y = event.clientY
      if (!selectionOrbit.started) {
        if (Math.abs(dx) + Math.abs(dy) < 4) return // still a click — let selection run
        selectionOrbit.started = true
        controls.enabled = false // freeze OrbitControls (incl. its ctrl→PAN)
      }
      const speed = (2 * Math.PI) / gl.domElement.clientHeight
      _orbitOffset.copy(camera.position).sub(controls.target)
      _orbitSpherical.setFromVector3(_orbitOffset)
      _orbitSpherical.theta -= dx * speed
      _orbitSpherical.phi = Math.min(
        controls.maxPolarAngle - 0.001,
        Math.max(controls.minPolarAngle + 0.001, _orbitSpherical.phi - dy * speed)
      )
      camera.position.copy(controls.target).add(_orbitOffset.setFromSpherical(_orbitSpherical))
      camera.lookAt(controls.target)
    }
    function endSelectionOrbit(): void {
      if (!selectionOrbit.armed) return
      selectionOrbit.armed = false
      if (selectionOrbit.started) controls.enabled = true
      selectionOrbit.started = false
      window.removeEventListener('pointermove', onSelectionOrbitMove)
      window.removeEventListener('pointerup', endSelectionOrbit)
    }
    gl.domElement.addEventListener('pointerdown', onCanvasPointerDownCapture, { capture: true })

    applyButtons()
    window.addEventListener('keydown', onAltDown)
    window.addEventListener('keyup', onAltUp)
    window.addEventListener('keydown', onCtrlDown)
    window.addEventListener('keyup', onCtrlUp)
    window.addEventListener('blur', onBlur)

    controlsRef.current = controls
    viewportState.controls = controls
    return () => {
      if (viewportState.controls === controls) viewportState.controls = null
      gl.domElement.removeEventListener('pointerdown', onCanvasPointerDownCapture, { capture: true })
      endSelectionOrbit()
      window.removeEventListener('keydown', onAltDown)
      window.removeEventListener('keyup', onAltUp)
      window.removeEventListener('keydown', onCtrlDown)
      window.removeEventListener('keyup', onCtrlUp)
      window.removeEventListener('blur', onBlur)
      controls.dispose()
      controlsRef.current = null
    }
  }, [camera, gl, world])

  /* Transform gizmo */
  useEffect(() => {
    const gizmo = new TransformControls(camera, gl.domElement)
    gizmo.setSize(0.85)
    const helper = (gizmo as unknown as { getHelper?: () => THREE.Object3D }).getHelper?.() ?? (gizmo as unknown as THREE.Object3D)
    scene.add(helper)

    const onDraggingChanged = (event: { value: unknown }) => {
      const dragging = Boolean(event.value)
      const controls = controlsRef.current
      if (controls) controls.enabled = !dragging
      const attached = gizmo.object
      const uuid = attached?.userData?.entityUuid as string | undefined
      if (dragging) {
        if (attached && uuid) {
          dragStart.current = {
            position: attached.position.clone(),
            rotation: attached.rotation.clone(),
            scale: attached.scale.clone(),
          }
          gizmoDragTargets.add(uuid)
        }
      } else if (uuid && dragStart.current) {
        gizmoDragTargets.delete(uuid)
        // BEFORE and AFTER must be immutable snapshots — never references to
        // the live Object3D transform, or a later drag would silently rewrite
        // this command's redo values.
        const before = dragStart.current
        const after = {
          position: attached!.position.clone(),
          rotation: attached!.rotation.clone(),
          scale: attached!.scale.clone(),
        }
        const finite = (v: THREE.Vector3) =>
          Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)
        if (!finite(after.position) || !finite(after.scale)) {
          // Never commit NaN/Infinity into authored data — restore the drag
          // start snapshot instead.
          attached!.position.copy(before.position)
          attached!.rotation.copy(before.rotation)
          attached!.scale.copy(before.scale)
          dragStart.current = null
          return
        }
        const def = getComponentDef('core.transform')!
        const serialize = (p: THREE.Vector3, r: THREE.Euler, s: THREE.Vector3) =>
          def.serialize({
            position: { x: p.x, y: p.y, z: p.z },
            rotation: {
              x: THREE.MathUtils.radToDeg(r.x),
              y: THREE.MathUtils.radToDeg(r.y),
              z: THREE.MathUtils.radToDeg(r.z),
            },
            scale: { x: s.x, y: s.y, z: s.z },
          } as Record<string, unknown>)
        commandStack.push({
          label: 'Transform',
          execute: () => {
            const entity = findEntityByUuid(world, uuid)
            if (entity) applyPatch(entity, 'core.transform', serialize(after.position, after.rotation, after.scale))
          },
          undo: () => {
            const entity = findEntityByUuid(world, uuid)
            if (entity) applyPatch(entity, 'core.transform', serialize(before.position, before.rotation, before.scale))
          },
        })
        dragStart.current = null
        useEditorStore.getState().setDirty(true)
      }
    }
    gizmo.addEventListener('dragging-changed', onDraggingChanged)
    gizmoRef.current = gizmo
    viewportState.gizmo = gizmo
    return () => {
      gizmo.removeEventListener('dragging-changed', onDraggingChanged)
      gizmo.detach()
      gizmo.dispose()
      scene.remove(helper)
      gizmoRef.current = null
      if (viewportState.gizmo === gizmo) viewportState.gizmo = null
    }
  }, [camera, gl, scene, world])

  /* Tool / space / snapping */
  const snapTranslate = useEditorStore((s) => s.snapTranslate)
  const snapRotateDeg = useEditorStore((s) => s.snapRotateDeg)
  const snapScale = useEditorStore((s) => s.snapScale)
  useEffect(() => {
    const gizmo = gizmoRef.current
    if (!gizmo) return
    gizmo.setMode(tool === 'select' ? 'translate' : tool) // 'select' keeps the gizmo detached (see useFrame)
    gizmo.setSpace(space === 'world' ? 'world' : 'local')
    gizmo.translationSnap = snapEnabled ? snapTranslate : null
    gizmo.rotationSnap = snapEnabled ? THREE.MathUtils.degToRad(snapRotateDeg) : null
    gizmo.scaleSnap = snapEnabled ? snapScale : null
  }, [tool, space, snapEnabled, selection])

  /* Picking */
  useEffect(() => {
    const canvas = gl.domElement
    const onPointerDown = (event: PointerEvent) => {
      pointerDown.current = {
        x: event.clientX,
        y: event.clientY,
        gizmoDragging: gizmoRef.current?.dragging ?? false,
      }
    }
    const onPointerUp = (event: PointerEvent) => {
      const down = pointerDown.current
      pointerDown.current = null
      if (!down) return
      if (down.gizmoDragging || gizmoRef.current?.dragging) return
      const dx = Math.abs(event.clientX - down.x)
      const dy = Math.abs(event.clientY - down.y)
      if (dx > 4 || dy > 4) return // was an orbit drag

      const root = scene.getObjectByName('koota-scene-root')
      if (!root) return
      const rect = canvas.getBoundingClientRect()
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1
      )
      raycaster.setFromCamera(ndc, camera)
      const hits = raycaster.intersectObject(root, true)
      let uuid: string | null = null
      for (const hit of hits) {
        let cursor: THREE.Object3D | null = hit.object
        while (cursor) {
          if (cursor.userData?.entityUuid) {
            uuid = cursor.userData.entityUuid as string
            break
          }
          cursor = cursor.parent
        }
        if (uuid) break
      }
      const store = useEditorStore.getState()
      if (uuid) {
        if (event.ctrlKey || event.metaKey) {
          store.select(store.selection.includes(uuid) ? store.selection.filter((u) => u !== uuid) : [...store.selection, uuid])
        } else {
          store.select([uuid])
        }
      } else {
        store.select([])
      }
    }
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointerup', onPointerUp)
    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointerup', onPointerUp)
    }
  }, [camera, gl, raycaster, scene])

  /* Per-frame: outline update, gizmo attach, orbit damping, focus, stats */
  const lastPreset = useRef(viewportState.cameraPreset)
  const lastReset = useRef(viewportState.viewResetRequests)
  useFrame((_, delta) => {
    controlsRef.current?.update()

    // Camera preset switch (Perspective/Top/Front/Side) + explicit view resets.
    const presetChanged = viewportState.cameraPreset !== lastPreset.current
    const resetRequested = viewportState.viewResetRequests !== lastReset.current
    if (presetChanged || resetRequested) {
      lastPreset.current = viewportState.cameraPreset
      lastReset.current = viewportState.viewResetRequests
      const controls = controlsRef.current
      if (controls) {
        const presets: Record<string, [THREE.Vector3, THREE.Vector3]> = {
          perspective: [new THREE.Vector3(9, 6, 12), new THREE.Vector3(0, 1, 0)],
          top: [new THREE.Vector3(0, 24, 0.001), new THREE.Vector3(0, 0, 0)],
          front: [new THREE.Vector3(0, 2, 20), new THREE.Vector3(0, 1.5, 0)],
          side: [new THREE.Vector3(20, 2, 0), new THREE.Vector3(0, 1.5, 0)],
        }
        const [position, target] = presets[viewportState.cameraPreset] ?? presets.perspective
        camera.position.copy(position)
        controls.target.copy(target)
        controls.update()
      }
    }

    // Gizmo attach — self-healing every frame; only objects already in the
    // scene graph may attach (TransformControls throws otherwise). The
    // Select tool keeps the gizmo detached.
    const gizmo = gizmoRef.current
    if (gizmo) {
      const uuid = selection[0]
      const expected =
        tool === 'select' ? null : uuid ? findEntityByUuid(world, uuid)?.get(ThreeObject)?.object ?? null : null
      const attachable = expected !== null && isInSceneGraph(expected)
      if (attachable && gizmo.object !== expected) gizmo.attach(expected)
      else if (!attachable && gizmo.object) gizmo.detach()
    }

    // Selection outline
    const uuid = selection[0]
    const object = uuid ? findEntityByUuid(world, uuid)?.get(ThreeObject)?.object : null
    if (object) {
      if (!outlineRef.current) {
        outlineRef.current = new THREE.BoxHelper(object, 0xf3c940)
        scene.add(outlineRef.current)
      }
      if (outlineRef.current.object !== object) outlineRef.current.setFromObject(object)
      else outlineRef.current.update()
      outlineRef.current.visible = true
    } else if (outlineRef.current) {
      outlineRef.current.visible = false
    }

    // Focus / frame selected (F)
    if (viewportState.focusRequests > 0) {
      viewportState.focusRequests = 0
      const target = object ?? scene.getObjectByName('koota-scene-root')
      if (target) {
        const box = new THREE.Box3().setFromObject(target)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3()).length() || 3
        const controls = controlsRef.current
        if (controls) {
          controls.target.copy(center)
          const direction = camera.position.clone().sub(controls.target).normalize()
          camera.position.copy(center.clone().add(direction.multiplyScalar(Math.max(size * 1.4, 2)))
          )
          controls.update()
        }
      }
    }

    // Stats — render counters on the WebGPU renderer are cumulative across
    // frames, so report the delta over this interval (per-frame values).
    const stats = fpsAccum.current
    stats.frames += 1
    stats.time += delta
    if (stats.time >= 0.5) {
      viewportState.stats.fps = Math.round(stats.frames / stats.time)
      viewportState.stats.frameMs = Number(((stats.time / stats.frames) * 1000).toFixed(1))
      const renderer = gl as unknown as { info?: { render: { calls: number; triangles: number } } }
      const info = renderer.info?.render
      if (info) {
        const dCalls = info.calls - stats.lastCalls
        const dTris = info.triangles - stats.lastTriangles
        const interval = stats.frames || 1
        viewportState.stats.calls = dCalls >= 0 ? Math.round(dCalls / interval) : info.calls
        // WebGPURenderer 0.185.1 leaves info.triangles at 0; report -1 ("n/a")
        // so the HUD never implies a triangle-less scene that has draw calls.
        viewportState.stats.triangles = dTris > 0 ? Math.round(dTris / interval) : info.triangles > 0 ? info.triangles : -1
        stats.lastCalls = info.calls
        stats.lastTriangles = info.triangles
      }
      stats.frames = 0
      stats.time = 0
    }
  })

  const gridVisible = useEditorStore((s) => s.gridVisible)
  return (
    <>
      {gridVisible && <gridHelper args={[80, 80, '#46536a', '#2a3341']} position={[0, -0.001, 0]} />}
      {gridVisible && <axesHelper args={[1.2]} position={[0, 0.002, 0]} />}
      <LightGizmos />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

/**
 * Floating viewport chrome per reference: grouped pill toolbars at the top
 * (Perspective | layout … Select/Move/Rotate/Scale … Global), a vertical
 * utility rail on the right edge, and a compact bottom-right status cluster.
 */
function ViewportToolbar() {
  const tool = useEditorStore((s) => s.tool)
  const space = useEditorStore((s) => s.space)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const gridVisible = useEditorStore((s) => s.gridVisible)
  const store = useEditorStore.getState
  const [cameraMenu, setCameraMenu] = useState(false)
  const [spaceMenu, setSpaceMenu] = useState(false)

  const setCameraPreset = (preset: 'perspective' | 'top' | 'front' | 'side') => {
    viewportState.cameraPreset = preset
    setCameraMenu(false)
  }

  return (
    <div className="ah-vptools">
      <div className="ah-toolbar-group">
        <div className={`ah-menu ${cameraMenu ? 'open' : ''}`}>
          <button className="ah-vtool" onClick={() => setCameraMenu(!cameraMenu)}>
            Perspective <ChevronDown size={12} style={{ opacity: 0.6 }} />
          </button>
          {cameraMenu && (
            <div className="ah-menu-pop">
              <MenuList
                items={[
                  { label: 'Perspective', onClick: () => setCameraPreset('perspective') },
                  { label: 'Top', onClick: () => setCameraPreset('top') },
                  { label: 'Front', onClick: () => setCameraPreset('front') },
                  { label: 'Side', onClick: () => setCameraPreset('side') },
                ]}
                onDone={() => setCameraMenu(false)}
              />
            </div>
          )}
        </div>
        <span className="ah-vtool-sep" />
        <IconButton
          icon={<LayoutGrid size={15} />}
          label="Toggle grid"
          active={gridVisible}
          onClick={() => store().setGridVisible(!gridVisible)}
        />
      </div>

      <div className="ah-toolbar-group">
        <IconButton icon={<MousePointer2 size={15} />} label="Select (Q)" active={tool === 'select'} onClick={() => store().setTool('select')} />
        <IconButton icon={<Move3d size={15} />} label="Move (W)" active={tool === 'translate'} onClick={() => store().setTool('translate')} />
        <IconButton icon={<Rotate3d size={15} />} label="Rotate (E)" active={tool === 'rotate'} onClick={() => store().setTool('rotate')} />
        <IconButton icon={<Scale3d size={15} />} label="Scale (R)" active={tool === 'scale'} onClick={() => store().setTool('scale')} />
        <IconButton icon={<Magnet size={15} />} label="Toggle snapping" active={snapEnabled} onClick={() => store().setSnap(!snapEnabled)} />
      </div>

      <div className="ah-toolbar-group ah-menu-space">
        <button className="ah-tool-wide" style={{ border: 0, background: 'transparent', color: 'var(--muted)', cursor: 'pointer' }} onClick={() => setSpaceMenu(!spaceMenu)}>
          {space === 'local' ? 'Local' : 'World'} ▾
        </button>
        {spaceMenu && (
          <div className="ah-menu-pop">
            <MenuList
              items={[
                { label: 'Local', onClick: () => { store().setSpace('local'); setSpaceMenu(false) } },
                { label: 'World', onClick: () => { store().setSpace('world'); setSpaceMenu(false) } },
              ]}
              onDone={() => setSpaceMenu(false)}
            />
          </div>
        )}
      </div>
    </div>
  )
}

/** Vertical pill rail on the viewport's right edge — 42px wide, 34px buttons. */
function ViewportRail() {
  const diagnosticsOpen = useEditorStore((s) => s.diagnosticsOpen)
  const settings = useEditorStore((s) => s.sceneSettings)
  const store = useEditorStore.getState
  return (
    <div className="ah-viewport-rail">
      <IconButton icon={<Focus size={15} />} label="Frame selection (F)" onClick={() => { viewportState.focusRequests += 1 }} />
      <IconButton
        icon={<Sun size={15} />}
        label="Toggle scene lights"
        active={settings.shadowEnabled}
        onClick={() => store().setSceneSettings({ ...settings, shadowEnabled: !settings.shadowEnabled })}
      />
      <IconButton icon={<Orbit size={15} />} label="Reset view" onClick={() => { viewportState.viewResetRequests += 1 }} />
      <IconButton icon={<Activity size={15} />} label="Diagnostics" active={diagnosticsOpen} onClick={() => store().setDiagnosticsOpen(!diagnosticsOpen)} />
    </div>
  )
}

/** Bottom-right status cluster: Grid 1m · Snap · RTX — floats over canvas. */
function ViewportStatus() {
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const gridVisible = useEditorStore((s) => s.gridVisible)
  const backend = useEditorStore((s) => s.backend)
  const store = useEditorStore.getState
  return (
    <div className="ah-viewport-status">
      <span className="chip">Grid <b>{gridVisible ? '1m' : 'off'}</b></span>
      <span className="chip">
        Snap{' '}
        <button className={`ah-switch ${snapEnabled ? 'on' : ''}`} title="Toggle snapping" onClick={() => store().setSnap(!snapEnabled)} />
      </span>
      <span className="chip">
        {backend === 'webgpu' ? 'WebGPU' : backend === 'webgl2' ? 'WebGL2' : 'GPU'}{' '}
        <span className={`ah-switch ${backend !== 'initializing' ? 'on' : ''}`} title="GPU acceleration" />
      </span>
    </div>
  )
}

function PlayModeBanner({ mode }: { mode: 'play' | 'paused' }) {
  return (
    <div className="ah-playmode-banner">
      {mode === 'play' ? '▶ PLAY MODE' : '⏸ PAUSED'}
      {mode === 'play' ? (
        <button onClick={pausePlayMode}>Pause</button>
      ) : (
        <button onClick={resumePlayMode}>Resume</button>
      )}
      <button onClick={stopPlayMode}>Stop</button>
    </div>
  )
}

function DiagnosticsPanel() {
  const world = useEditorStore((s) => s.world)
  const worldVersion = useEditorStore((s) => s.worldVersion)
  const backend = useEditorStore((s) => s.backend)
  const assets = useEditorStore((s) => s.assets)
  const ref = useRef<HTMLDivElement>(null)

  // Entity count changes only on structural edits — never query per frame.
  const entityCount = useMemo(() => world.query(EntityMeta).length, [world, worldVersion])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const node = ref.current
      if (node) {
        const ui = {
          backend: node.querySelector<HTMLElement>('[data-k="backend"] b'),
          fps: node.querySelector<HTMLElement>('[data-k="fps"] b'),
          frame: node.querySelector<HTMLElement>('[data-k="frame"] b'),
          calls: node.querySelector<HTMLElement>('[data-k="calls"] b'),
          tris: node.querySelector<HTMLElement>('[data-k="tris"] b'),
        }
        if (ui.backend) ui.backend.textContent = backend.toUpperCase()
        if (ui.fps) ui.fps.textContent = String(viewportState.stats.fps)
        if (ui.frame) ui.frame.textContent = `${viewportState.stats.frameMs} ms`
        if (ui.calls) ui.calls.textContent = String(viewportState.stats.calls)
        if (ui.tris) ui.tris.textContent = viewportState.stats.triangles < 0 ? 'n/a' : viewportState.stats.triangles.toLocaleString()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [backend])

  return (
    <div className="ah-diagnostics" ref={ref}>
      <div data-k="backend">Renderer Backend <b /></div>
      <div data-k="fps">FPS <b /></div>
      <div data-k="frame">Frame Time <b /></div>
      <div data-k="calls">Draw Calls / frame <b /></div>
      <div data-k="tris">Triangles / frame <b /></div>
      <div data-k="entities">Entities <b>{entityCount}</b></div>
      <div>Loaded Assets <b>{assets.length}</b></div>
    </div>
  )
}

/** Orientation gizmo rendered as projected SVG axes (bottom-right). */
const AXIS_DIRS: ReadonlyArray<readonly [string, THREE.Vector3, string]> = [
  ['X', new THREE.Vector3(1, 0, 0), '#ff6b6b'],
  ['Y', new THREE.Vector3(0, 1, 0), '#7df17d'],
  ['Z', new THREE.Vector3(0, 0, 1), '#6ba8ff'],
]
const axisTmpVec = new THREE.Vector3()
const axisTmpQuat = new THREE.Quaternion()

function AxisWidget() {
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    let raf = 0
    const camera = () => viewportState.camera
    const tick = () => {
      const svg = svgRef.current
      if (svg) {
        const cam = camera()
        if (cam) {
          axisTmpQuat.copy(cam.quaternion).invert()
          for (const [name, dir, color] of AXIS_DIRS) {
            const line = svg.querySelector<SVGLineElement>(`[data-axis="${name}"]`)
            const label = svg.querySelector<SVGTextElement>(`[data-axis-label="${name}"]`)
            if (!line || !label) continue
            const v = axisTmpVec.copy(dir).applyQuaternion(axisTmpQuat)
            const x2 = 34 + v.x * 24
            const y2 = 34 - v.y * 24
            line.setAttribute('x1', '34')
            line.setAttribute('y1', '34')
            line.setAttribute('x2', String(x2))
            line.setAttribute('y2', String(y2))
            label.setAttribute('x', String(34 + v.x * 33))
            label.setAttribute('y', String(34 - v.y * 33 + 3))
            label.setAttribute('fill', color)
            line.setAttribute('stroke', color)
          }
        }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return (
    <svg className="ah-axis-widget" ref={svgRef} width="68" height="68" viewBox="0 0 68 68">
      <circle cx="34" cy="34" r="31" fill="#10151bd0" stroke="#3d4754" strokeWidth="1" />
      <line data-axis="X" strokeWidth="2" />
      <line data-axis="Y" strokeWidth="2" />
      <line data-axis="Z" strokeWidth="2" />
      <text data-axis-label="X" fontSize="9" fontWeight="700" textAnchor="middle">X</text>
      <text data-axis-label="Y" fontSize="9" fontWeight="700" textAnchor="middle">Y</text>
      <text data-axis-label="Z" fontSize="9" fontWeight="700" textAnchor="middle">Z</text>
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Asset drag & drop into viewport                                     */
/* ------------------------------------------------------------------ */

function onDragOverAsset(event: React.DragEvent): void {
  const types = event.dataTransfer.types
  const known = ['ah/asset', 'ah/prefab', 'ah/material', 'ah/particle'].some((type) =>
    types.includes(type)
  )
  event.preventDefault()
  event.dataTransfer.dropEffect = known ? 'copy' : 'none'
  const wrap = event.currentTarget as HTMLElement
  wrap.classList.toggle('drop-deny', !known && types.length > 0)
  wrap.classList.toggle('drop-ok', known)
}

function onDropAsset(event: React.DragEvent): void {
  event.preventDefault()
  const wrap = event.currentTarget as HTMLElement
  wrap.classList.remove('drop-ok', 'drop-deny')
  const assetId = event.dataTransfer.getData('ah/asset')
  const prefabId = event.dataTransfer.getData('ah/prefab')
  const materialId = event.dataTransfer.getData('ah/material')
  const particleId = event.dataTransfer.getData('ah/particle')
  const store = useEditorStore.getState()

  if (prefabId) {
    instantiatePrefabAction(prefabId)
    return
  }
  if (materialId) {
    assignDroppedMaterial(store, materialId)
    return
  }
  if (particleId) {
    createParticleEmitter(store, particleId)
    return
  }
  if (assetId) {
    const asset = store.assets.find((a) => a.id === assetId)
    if (asset?.type === 'model') {
      createEntity({
        name: asset.name.replace(/\.(glb|gltf)$/i, ''),
        components: {
          'core.transform': {},
          'render.model': { assetId },
          'render.material': {},
        },
      })
      return
    }
    if (asset?.type === 'environment') {
      store.setSceneSettings({ ...store.sceneSettings, environmentAssetId: assetId })
      store.notify('info', `Environment set to ${asset.name}`)
      return
    }
    if (asset?.type === 'texture') {
      store.notify('info', 'Textures are assigned inside the Material editor')
      return
    }
    store.notify('error', `"${asset?.name ?? assetId}" can't be placed in the scene`)
    return
  }
}

/** Material drop: assign to the selected entity (or notify how to target one). */
function assignDroppedMaterial(
  store: ReturnType<typeof useEditorStore.getState>,
  materialId: string
): void {
  const material = store.materials.find((m) => m.id === materialId)
  if (!material) return
  const uuid = store.selection[0]
  if (!uuid) {
    store.notify('info', `Select an entity first, then drop "${material.name}" to assign it`)
    return
  }
  editComponentField(uuid, 'render.material', { slots: [{ materialId }] })
  store.notify('success', `"${material.name}" assigned to selection`)
}

/** Particle effect drop (from the particle workspace list or asset browser). */
function createParticleEmitter(
  store: ReturnType<typeof useEditorStore.getState>,
  effectId: string
): void {
  const effect = store.particleEffects.find((e) => e.id === effectId)
  const name = effect?.name ?? 'Particle Effect'
  createEntity({
    name,
    components: {
      'core.transform': {},
      'particle.emitter': { effectId },
    },
  })
  useEditorStore.getState().notify('success', `Emitter "${name}" placed in scene`)
}

/* ------------------------------------------------------------------ */
/* Snap settings — editor preferences, never scene data                */
/* ------------------------------------------------------------------ */

function setPref(key: 'snapTranslate' | 'snapRotateDeg' | 'snapScale', value: number): void {
  useEditorStore.setState({ [key]: value } as never)
  savePreferences({ [key]: value })
}

/* ------------------------------------------------------------------ */
/* Light gizmos — editor-only visual helpers, never serialized         */
/* ------------------------------------------------------------------ */

function LightGizmos() {
  const world = useEditorStore((s) => s.world)
  const worldVersion = useEditorStore((s) => s.worldVersion)
  const gizmoRefs = useRef<Map<string, THREE.Group>>(new Map())

  useFrame(({ scene }) => {
    void worldVersion
    // Remove stale gizmos
    for (const [uuid, group] of gizmoRefs.current) {
      const entity = [...world.query(EntityMeta)].find((e) => e.get(EntityMeta)?.uuid === uuid)
      if (!entity || !entity.has(Light)) {
        scene.remove(group)
        gizmoRefs.current.delete(uuid)
      }
    }
    // Add/update gizmos for light entities
    for (const entity of world.query(Light, ThreeObject)) {
      const uuid = entity.get(EntityMeta)?.uuid
      const lightData = entity.get(Light)
      const object = entity.get(ThreeObject)?.object
      if (!uuid || !lightData || !object) continue

      let gizmo = gizmoRefs.current.get(uuid)
      if (!gizmo) {
        gizmo = new THREE.Group()
        gizmo.name = 'light-gizmo'
        scene.add(gizmo)
        gizmoRefs.current.set(uuid, gizmo)
      }

      // Position gizmo at light's world position
      object.updateWorldMatrix(true, false)
      gizmo.position.setFromMatrixPosition(object.matrixWorld)

      // Update gizmo content based on type
      updateGizmoContent(gizmo, lightData)
    }
  })

  return null
}

function updateGizmoContent(gizmo: THREE.Group, lightData: { type: string; distance: number; angle: number }) {
  const color = 0xf3c940
  const existing = gizmo.children[0]
  const key = `${lightData.type}:${lightData.distance}:${lightData.angle}`

  if (existing?.userData?.gizmoKey === key) return

  // Clear and rebuild
  gizmo.clear()

  if (lightData.type === 'directional') {
    // Direction indicator: arrow pointing along local -Z
    const dir = new THREE.ArrowHelper(
      new THREE.Vector3(0, 0, -1),
      new THREE.Vector3(0, 0, 0),
      2,
      color,
      0.3,
      0.15
    )
    gizmo.add(dir)
  } else if (lightData.type === 'point') {
    // Range indicator: wireframe sphere
    const radius = lightData.distance > 0 ? lightData.distance : 1
    const geo = new THREE.SphereGeometry(radius, 12, 8)
    const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.15 })
    const mesh = new THREE.Mesh(geo, mat)
    gizmo.add(mesh)
  } else if (lightData.type === 'spot') {
    // Cone indicator
    const distance = lightData.distance > 0 ? lightData.distance : 3
    const geo = new THREE.ConeGeometry(Math.tan(lightData.angle) * distance, distance, 12, 1, true)
    const mat = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.15, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.rotation.x = -Math.PI / 2 // point along -Z
    mesh.position.z = -distance / 2
    gizmo.add(mesh)
  }

  gizmo.userData.gizmoKey = key
}
