import { create } from 'zustand'

/**
 * Unity-style window/panel system.
 *
 * Supports multiple instances of any panel type (Inspector #2, Hierarchy #2…)
 * added via the Window menu. Panels can be floated (draggable overlays),
 * docked into zones (left/center/right/bottom with live preview highlights),
 * maximized, closed, and the Inspector can be locked to a specific entity.
 */

export type PanelType = 'hierarchy' | 'viewport' | 'inspector' | 'project' | 'console' | 'animation'

export type DockSide = 'left' | 'center' | 'right' | 'bottom'

export interface PanelInstance {
  /** Unique instance id (p1, p2, …). */
  instanceId: string
  /** What kind of panel this is. */
  type: PanelType
  /** Display label (Inspector, Inspector 2, …). */
  label: string
  /** Dock position; null = floating. */
  dock: DockSide | null
  /** Floating position/size (used when dock === null). */
  x: number
  y: number
  width: number
  height: number
  /** For inspector instances: locked entity UUID (null = follow selection). */
  lockedUuid?: string | null
}

export interface DockZoneHighlight {
  side: DockSide
  /** Screen rect of the highlighted zone. */
  rect: { left: number; top: number; width: number; height: number }
}

export interface WindowPanelState {
  /** All panel instances (docked + floating). */
  panels: PanelInstance[]
  /** Which instance is maximized. */
  maximizedId: string | null
  /** Currently-dragged instance (for dock zone detection). */
  draggingId: string | null
  /** Live dock-zone preview highlight. */
  zoneHighlight: DockZoneHighlight | null

  addPanel(type: PanelType, dock?: DockSide | null): string
  removePanel(instanceId: string): void
  closePanel(instanceId: string): void
  restorePanel(instanceId: string): void
  toggleMaximize(instanceId: string): void
  floatPanel(instanceId: string): void
  dockPanel(instanceId: string, side: DockSide): void
  moveFloating(instanceId: string, x: number, y: number): void
  setDragging(instanceId: string | null): void
  setZoneHighlight(highlight: DockZoneHighlight | null): void
  setLocked(instanceId: string, uuid: string | null): void
}

let panelSeq = 0
const nextInstanceId = () => `p${++panelSeq}`

const DEFAULT_SIZES: Record<PanelType, { w: number; h: number }> = {
  hierarchy: { w: 280, h: 420 },
  viewport: { w: 600, h: 400 },
  inspector: { w: 340, h: 440 },
  project: { w: 700, h: 220 },
  console: { w: 600, h: 180 },
  animation: { w: 500, h: 350 },
}

const TYPE_LABELS: Record<PanelType, string> = {
  hierarchy: 'Hierarchy',
  viewport: 'Viewport',
  inspector: 'Inspector',
  project: 'Project',
  console: 'Console',
  animation: 'Animation',
}

/** Default boot panels (Unity-like). */
function defaultPanels(): PanelInstance[] {
  return [
    { instanceId: nextInstanceId(), type: 'hierarchy', label: 'Hierarchy', dock: 'left', x: 0, y: 0, width: DEFAULT_SIZES.hierarchy.w, height: DEFAULT_SIZES.hierarchy.h },
    { instanceId: nextInstanceId(), type: 'viewport', label: 'Viewport', dock: 'center', x: 0, y: 0, width: DEFAULT_SIZES.viewport.w, height: DEFAULT_SIZES.viewport.h },
    { instanceId: nextInstanceId(), type: 'inspector', label: 'Inspector', dock: 'right', x: 0, y: 0, width: DEFAULT_SIZES.inspector.w, height: DEFAULT_SIZES.inspector.h },
    { instanceId: nextInstanceId(), type: 'project', label: 'Project', dock: 'bottom', x: 0, y: 0, width: DEFAULT_SIZES.project.w, height: DEFAULT_SIZES.project.h },
  ]
}

export const useWindowPanels = create<WindowPanelState>((set, get) => ({
  panels: defaultPanels(),
  maximizedId: null,
  draggingId: null,
  zoneHighlight: null,

  addPanel: (type, dock = null) => {
    const existing = get().panels.filter((p) => p.type === type).length
    const label = existing === 0 ? TYPE_LABELS[type] : `${TYPE_LABELS[type]} ${existing + 1}`
    const size = DEFAULT_SIZES[type]
    const instance: PanelInstance = {
      instanceId: nextInstanceId(),
      type,
      label,
      dock,
      x: 200 + (existing * 40) % 300,
      y: 120 + (existing * 30) % 200,
      width: size.w,
      height: size.h,
      lockedUuid: null,
    }
    set({ panels: [...get().panels, instance] })
    return instance.instanceId
  },

  removePanel: (instanceId) => {
    set({
      panels: get().panels.filter((p) => p.instanceId !== instanceId),
      maximizedId: get().maximizedId === instanceId ? null : get().maximizedId,
    })
  },

  closePanel: (instanceId) => {
    set({ panels: get().panels.filter((p) => p.instanceId !== instanceId) })
  },

  restorePanel: (instanceId) => {
    // Panels are re-added via the Window menu
    void instanceId
  },

  toggleMaximize: (instanceId) => {
    set({ maximizedId: get().maximizedId === instanceId ? null : instanceId })
  },

  floatPanel: (instanceId) => {
    set({
      panels: get().panels.map((p) => (p.instanceId === instanceId ? { ...p, dock: null } : p)),
    })
  },

  dockPanel: (instanceId, side) => {
    set({
      panels: get().panels.map((p) => (p.instanceId === instanceId ? { ...p, dock: side } : p)),
      zoneHighlight: null,
    })
  },

  moveFloating: (instanceId, x, y) => {
    set({
      panels: get().panels.map((p) => (p.instanceId === instanceId ? { ...p, x, y } : p)),
    })
  },

  setDragging: (draggingId) => set({ draggingId }),
  setZoneHighlight: (zoneHighlight) => set({ zoneHighlight }),

  setLocked: (instanceId, uuid) => {
    set({
      panels: get().panels.map((p) => (p.instanceId === instanceId ? { ...p, lockedUuid: uuid } : p)),
    })
  },
}))

/** Window menu items for the TopBar overflow (Unity-style). */
export function windowMenuItems(): { label: string; onClick: () => void; separatorBefore?: boolean }[] {
  const store = useWindowPanels.getState
  return (Object.keys(TYPE_LABELS) as PanelType[]).map((type, index) => ({
    label: `Add ${TYPE_LABELS[type]}`,
    separatorBefore: index === 0,
    onClick: () => {
      const id = store().addPanel(type)
      void id
    },
  }))
}

export { TYPE_LABELS, DEFAULT_SIZES }
