import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import type { Entity } from 'koota'
import {
  EntityMeta,
  ThreeObject,
  Transform,
  findEntityByUuid,
} from '@ahengine/ecs-runtime'
import { KootaScene, gizmoDragTargets } from '@ahengine/ecs-runtime/react'
import {
  animator as editorAnimator,
  environmentLookup,
  getPlayHandle,
  materialService,
  resolveAssetUri,
  stopPlayMode,
  useEditorStore,
} from '@ahengine/editor-core'
import { createEntity, instantiatePrefabAction } from '@ahengine/editor-core'
import { commandStack } from '@ahengine/editor-core'
import { getComponentDef, applyPatch } from '@ahengine/ecs-runtime'

/**
 * WebGPU viewport: orbit camera, transform gizmo, click picking, grid,
 * selection outline, diagnostics. Per-frame work stays imperative — React
 * never rerenders on transform movement.
 */

/** Shared bridge between the R3F scene and HTML overlays (no React per frame). */
export const viewportState = {
  camera: null as THREE.PerspectiveCamera | null,
  focusRequests: 0,
  stats: { fps: 0, frameMs: 0, calls: 0, triangles: 0 },
}

function isInSceneGraph(object: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = object
  while (cursor) {
    if ((cursor as THREE.Scene).isScene) return true
    cursor = cursor.parent
  }
  return false
}

export function Viewport() {
  const playMode = useEditorStore((s) => s.playMode)
  const playWorld = useEditorStore((s) => s.playWorld)
  const diagnosticsOpen = useEditorStore((s) => s.diagnosticsOpen)

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
      className="ah-viewport-wrap"
      onDrop={onDropAsset}
      onDragOver={(event) => event.preventDefault()}
    >
      <Canvas
        gl={gl}
        dpr={[1, 2]}
        camera={{ fov: 50, near: 0.1, far: 600, position: [9, 6, 12] }}
        shadows
        onCreated={({ gl, camera }) => {
          viewportState.camera = camera as THREE.PerspectiveCamera
          void gl
        }}
      >
        <ViewportScene />
      </Canvas>

      <ViewportToolbar />
      {playMode !== 'edit' && <PlayModeBanner mode={playMode} />}
      {diagnosticsOpen && <DiagnosticsPanel />}
      <ViewportInfo />
      <AxisWidget />
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

  return (
    <>
      {!isPlay && <EditorRig selection={selection} tool={tool} space={space} snapEnabled={snapEnabled} world={world} />}
      <KootaScene
        world={activeWorld}
        runtime={{ materials: materialService, animator: isPlay ? playAnimator : editorAnimator }}
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

function EditorRig({
  selection,
  tool,
  space,
  snapEnabled,
  world,
}: {
  selection: string[]
  tool: 'translate' | 'rotate' | 'scale'
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
  const fpsAccum = useRef({ frames: 0, time: 0 })

  /* Orbit controls */
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement)
    controls.target.set(0, 1, 0)
    controls.enableDamping = true
    controls.dampingFactor = 0.12
    controls.maxPolarAngle = Math.PI * 0.495
    controls.minDistance = 0.5
    controls.maxDistance = 220
    controlsRef.current = controls
    return () => {
      controls.dispose()
      controlsRef.current = null
    }
  }, [camera, gl])

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
        const before = dragStart.current
        const after = { position: attached!.position, rotation: attached!.rotation, scale: attached!.scale }
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
    return () => {
      gizmo.removeEventListener('dragging-changed', onDraggingChanged)
      gizmo.detach()
      gizmo.dispose()
      scene.remove(helper)
      gizmoRef.current = null
    }
  }, [camera, gl, scene, world])

  /* Tool / space / snapping */
  useEffect(() => {
    const gizmo = gizmoRef.current
    if (!gizmo) return
    gizmo.setMode(tool)
    gizmo.setSpace(space === 'world' ? 'world' : 'local')
    const store = useEditorStore.getState()
    gizmo.translationSnap = snapEnabled ? store.snapTranslate : null
    gizmo.rotationSnap = snapEnabled ? THREE.MathUtils.degToRad(store.snapRotateDeg) : null
    gizmo.scaleSnap = snapEnabled ? 0.1 : null
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
  useFrame((_, delta) => {
    controlsRef.current?.update()

    // Gizmo attach — self-healing every frame; only objects already in the
    // scene graph may attach (TransformControls throws otherwise).
    const gizmo = gizmoRef.current
    if (gizmo) {
      const uuid = selection[0]
      const expected = uuid ? findEntityByUuid(world, uuid)?.get(ThreeObject)?.object ?? null : null
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

    // Stats
    const stats = fpsAccum.current
    stats.frames += 1
    stats.time += delta
    if (stats.time >= 0.5) {
      viewportState.stats.fps = Math.round(stats.frames / stats.time)
      viewportState.stats.frameMs = Number(((stats.time / stats.frames) * 1000).toFixed(1))
      const renderer = gl as unknown as { info?: { render: { calls: number; triangles: number } } }
      viewportState.stats.calls = renderer.info?.render.calls ?? 0
      viewportState.stats.triangles = renderer.info?.render.triangles ?? 0
      stats.frames = 0
      stats.time = 0
    }
  })

  return (
    <>
      <gridHelper args={[80, 80, '#46536a', '#2a3341']} position={[0, -0.001, 0]} />
      <axesHelper args={[1.2]} position={[0, 0.002, 0]} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Overlays                                                            */
/* ------------------------------------------------------------------ */

function ViewportToolbar() {
  return (
    <div className="ah-viewport-toolbar">
      <span style={{ fontSize: 10.5, color: 'var(--text-dim)', padding: '0 8px', letterSpacing: '0.06em' }}>
        PERSPECTIVE
      </span>
      <span className="ah-separator" />
      <span style={{ fontSize: 10.5, color: 'var(--text-muted)', padding: '0 8px' }}>
        Lit · Grid · Gizmo
      </span>
    </div>
  )
}

function PlayModeBanner({ mode }: { mode: 'play' | 'paused' }) {
  return (
    <div className="ah-playmode-banner">
      {mode === 'play' ? '▶ PLAY MODE' : '⏸ PAUSED'}
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

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const node = ref.current
      if (node) {
        const entities = world.query(EntityMeta).length
        const ui = {
          backend: node.querySelector<HTMLElement>('[data-k="backend"] b'),
          fps: node.querySelector<HTMLElement>('[data-k="fps"] b'),
          frame: node.querySelector<HTMLElement>('[data-k="frame"] b'),
          calls: node.querySelector<HTMLElement>('[data-k="calls"] b'),
          tris: node.querySelector<HTMLElement>('[data-k="tris"] b'),
          entities: node.querySelector<HTMLElement>('[data-k="entities"] b'),
        }
        if (ui.backend) ui.backend.textContent = backend.toUpperCase()
        if (ui.fps) ui.fps.textContent = String(viewportState.stats.fps)
        if (ui.frame) ui.frame.textContent = `${viewportState.stats.frameMs} ms`
        if (ui.calls) ui.calls.textContent = String(viewportState.stats.calls)
        if (ui.tris) ui.tris.textContent = viewportState.stats.triangles.toLocaleString()
        if (ui.entities) ui.entities.textContent = String(entities)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [world, backend, worldVersion])

  return (
    <div className="ah-diagnostics" ref={ref}>
      <div data-k="backend">Renderer Backend <b /></div>
      <div data-k="fps">FPS <b /></div>
      <div data-k="frame">Frame Time <b /></div>
      <div data-k="calls">Draw Calls <b /></div>
      <div data-k="tris">Triangles <b /></div>
      <div data-k="entities">Entities <b /></div>
      <div>Loaded Assets <b>{assets.length}</b></div>
    </div>
  )
}

function ViewportInfo() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const camera = viewportState.camera
      if (camera && ref.current) {
        const p = camera.position
        ref.current.textContent = `Cam  x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])
  return <div className="ah-viewport-info" ref={ref} />
}

/** Orientation gizmo rendered as projected SVG axes (bottom-right). */
function AxisWidget() {
  const svgRef = useRef<SVGSVGElement>(null)
  useEffect(() => {
    let raf = 0
    const camera = () => viewportState.camera
    const project = (axis: THREE.Vector3) => {
      const cam = camera()
      if (!cam) return { x: 0, y: 0, z: 0 }
      const quaternion = cam.quaternion.clone().invert()
      const v = axis.clone().applyQuaternion(quaternion)
      return { x: v.x, y: -v.y, z: v.z }
    }
    const tick = () => {
      const svg = svgRef.current
      if (svg) {
        const axes: [string, THREE.Vector3, string][] = [
          ['X', new THREE.Vector3(1, 0, 0), '#ff6b6b'],
          ['Y', new THREE.Vector3(0, 1, 0), '#7df17d'],
          ['Z', new THREE.Vector3(0, 0, 1), '#6ba8ff'],
        ]
        for (const [name, dir, color] of axes) {
          const line = svg.querySelector<SVGLineElement>(`[data-axis="${name}"]`)
          const label = svg.querySelector<SVGTextElement>(`[data-axis-label="${name}"]`)
          if (!line || !label) continue
          const p = project(dir)
          const x2 = 34 + p.x * 24
          const y2 = 34 - p.y * 24
          line.setAttribute('x1', '34')
          line.setAttribute('y1', '34')
          line.setAttribute('x2', String(x2))
          line.setAttribute('y2', String(y2))
          label.setAttribute('x', String(34 + p.x * 33))
          label.setAttribute('y', String(34 - p.y * 33 + 3))
          label.setAttribute('fill', color)
          line.setAttribute('stroke', color)
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

function onDropAsset(event: React.DragEvent): void {
  event.preventDefault()
  const assetId = event.dataTransfer.getData('ah/asset')
  const prefabId = event.dataTransfer.getData('ah/prefab')
  const materialId = event.dataTransfer.getData('ah/material')
  const store = useEditorStore.getState()

  if (prefabId) {
    instantiatePrefabAction(prefabId)
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
  }
}
