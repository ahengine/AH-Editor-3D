import * as THREE from 'three'
import { ThreeObject, Transform, findEntityByUuid } from '@ahengine/ecs-runtime'
import { gizmoDragTargets } from '@ahengine/ecs-runtime/react'
import { useEditorStore } from '@ahengine/editor-core'
import { viewportState } from './viewportState.js'

/**
 * DEV-only transform-chain diagnostics (never installed in prod builds).
 *
 * window.__ahTransformChain() reports the complete
 * selection → Koota entity → runtime Object3D → TransformControls chain
 * with ECS vs Three transform values — proving synchronization and
 * exposing stale references or remounts.
 *
 * window.__ahViewport exposes the live viewport state (camera, gizmo) so
 * harnesses can drive synthetic gizmo drags via dragging-changed events.
 *
 * Lives in its own module: exporting non-components from Viewport.tsx
 * breaks React Fast Refresh (vite-plugin-react requires component-only
 * exports) and turned every Viewport edit into a full page reload.
 */
export function installTransformChainProbe(): void {
  if (typeof window === 'undefined') return
  const w = window as typeof window & {
    __ahTransformChain?: () => unknown
    __ahViewport?: typeof viewportState
  }
  if (w.__ahTransformChain) return
  w.__ahViewport = viewportState
  w.__ahTransformChain = () => {
    const store = useEditorStore.getState()
    const uuid = store.selection[0] ?? null
    const gizmo = viewportState.gizmo
    const report = {
      selectedEntityUuid: uuid as string | null,
      kootaEntity: null as null | { id: number; alive: boolean },
      runtimeObject: null as null | { threeUuid: string; ownerUuid: unknown; inScene: boolean },
      transformControls: {
        attached: null as null | string,
        mode: (gizmo?.mode ?? null) as string | null,
        space: (gizmo?.space ?? null) as string | null,
        dragging: gizmo?.dragging ?? false,
      },
      ecs: null as null | { position: number[]; rotationDeg: number[]; scale: number[] },
      three: null as null | { position: number[]; rotationDeg: number[]; scale: number[] },
      match: null as null | boolean,
      activeDragTargets: [...gizmoDragTargets],
    }
    if (!uuid) return report
    const entity = findEntityByUuid(store.world, uuid)
    if (!entity) return report
    report.kootaEntity = { id: entity.id(), alive: entity.isAlive() }
    const object = entity.get(ThreeObject)?.object ?? null
    if (!object) return report
    report.runtimeObject = {
      threeUuid: object.uuid,
      ownerUuid: object.userData?.entityUuid ?? null,
      inScene: isInSceneGraph(object),
    }
    const attached = gizmo?.object ?? null
    report.transformControls.attached = attached ? attached.uuid : null
    const transform = entity.get(Transform)
    if (transform) {
      const deg = (r: number) => (r * 180) / Math.PI
      const round = (n: number) => Math.round(n * 1000) / 1000
      report.ecs = {
        position: [transform.position.x, transform.position.y, transform.position.z].map(round),
        rotationDeg: [transform.rotation.x, transform.rotation.y, transform.rotation.z].map(round),
        scale: [transform.scale.x, transform.scale.y, transform.scale.z].map(round),
      }
      report.three = {
        position: [object.position.x, object.position.y, object.position.z].map(round),
        rotationDeg: [deg(object.rotation.x), deg(object.rotation.y), deg(object.rotation.z)].map(round),
        scale: [object.scale.x, object.scale.y, object.scale.z].map(round),
      }
      const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.01)
      // Rotation compares as ORIENTATION: Euler decompositions aren't unique
      // (y>90° yields equivalent alternates), so compare the quaternions.
      const ecsQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          (transform.rotation.x * Math.PI) / 180,
          (transform.rotation.y * Math.PI) / 180,
          (transform.rotation.z * Math.PI) / 180
        )
      )
      const rotationMatches = Math.abs(ecsQuat.dot(object.quaternion)) > 0.9999
      report.match =
        close(report.ecs.position, report.three.position) &&
        rotationMatches &&
        close(report.ecs.scale, report.three.scale)
    }
    return report
  }
}

function isInSceneGraph(object: THREE.Object3D): boolean {
  let cursor: THREE.Object3D | null = object
  while (cursor) {
    if ((cursor as THREE.Scene).isScene) return true
    cursor = cursor.parent
  }
  return false
}
