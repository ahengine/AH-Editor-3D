import type * as THREE from 'three'
import type { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'

/**
 * Live viewport state shared between the imperative render loop and DEV
 * diagnostics. Kept in its own module so Viewport.tsx exports only the
 * React component (React Fast Refresh requirement).
 */
export const viewportState = {
  camera: null as THREE.PerspectiveCamera | null,
  focusRequests: 0,
  viewResetRequests: 0,
  cameraPreset: 'perspective' as 'perspective' | 'top' | 'front' | 'side',
  stats: { fps: 0, frameMs: 0, calls: 0, triangles: 0 },
  /** Live editor gizmo — exposed for the DEV transform-chain probe. */
  gizmo: null as TransformControls | null,
  /** Live orbit controls — exposed for DEV navigation diagnostics. */
  controls: null as import('three/examples/jsm/controls/OrbitControls.js').OrbitControls | null,
  /** Held arrow-key state for smooth (per-frame, eased) camera navigation. */
  arrowNav: { up: false as boolean, down: false as boolean, left: false as boolean, right: false as boolean, fast: false as boolean },
}
