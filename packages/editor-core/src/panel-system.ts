import { create } from 'zustand'

/**
 * Unity-style panel system: maximize, float, close, lock/pin.
 * Floating panels are absolutely positioned overlays that can be dragged
 * and re-docked. Locked panels ignore selection changes (Inspector lock).
 */

export type PanelId = 'hierarchy' | 'viewport' | 'inspector' | 'bottom'

export interface FloatingPanel {
  id: PanelId
  x: number
  y: number
  width: number
  height: number
}

export interface PanelState {
  /** Which panel is maximized (only one at a time). */
  maximized: PanelId | null
  /** Panels hidden via context menu "Close Panel". */
  closed: Set<PanelId>
  /** Inspector locked to a specific entity UUID (null = follows selection). */
  lockedUuid: string | null
  /** Floating (undocked) panels with their position/size. */
  floating: Map<PanelId, FloatingPanel>
  /** Drag target highlight zone (for dock preview). */
  dockZone: 'left' | 'center' | 'right' | 'bottom' | null
  /** Which panel is being dragged. */
  dragging: PanelId | null

  toggleMaximize(id: PanelId): void
  closePanel(id: PanelId): void
  restorePanel(id: PanelId): void
  setLocked(uuid: string | null): void
  toggleFloat(id: PanelId): void
  updateFloat(id: PanelId, x: number, y: number): void
  setDockZone(zone: PanelState['dockZone']): void
  setDragging(id: PanelId | null): void
}

export const usePanelStore = create<PanelState>((set, get) => ({
  maximized: null,
  closed: new Set(),
  lockedUuid: null,
  floating: new Map(),
  dockZone: null,
  dragging: null,

  toggleMaximize: (id) => {
    const current = get().maximized
    set({ maximized: current === id ? null : id })
  },

  closePanel: (id) => {
    const closed = new Set(get().closed)
    closed.add(id)
    set({ closed })
  },

  restorePanel: (id) => {
    const closed = new Set(get().closed)
    closed.delete(id)
    set({ closed })
  },

  setLocked: (uuid) => set({ lockedUuid: uuid }),

  toggleFloat: (id) => {
    const floating = new Map(get().floating)
    if (floating.has(id)) {
      floating.delete(id)
    } else {
      floating.set(id, {
        id,
        x: 300 + floating.size * 30,
        y: 150 + floating.size * 30,
        width: id === 'inspector' ? 340 : id === 'bottom' ? 800 : 500,
        height: id === 'bottom' ? 250 : 400,
      })
    }
    set({ floating })
  },

  updateFloat: (id, x, y) => {
    const floating = new Map(get().floating)
    const panel = floating.get(id)
    if (panel) {
      floating.set(id, { ...panel, x, y })
      set({ floating })
    }
  },

  setDockZone: (dockZone) => set({ dockZone }),
  setDragging: (dragging) => set({ dragging }),
}))

/** Panel context-menu items (Unity-style). */
export function panelContextMenuItems(
  id: PanelId,
  notify: (kind: 'error' | 'info' | 'success', message: string) => void
): { label: string; onClick: () => void; separatorBefore?: boolean }[] {
  const store = usePanelStore.getState()
  const isFloating = store.floating.has(id)
  const isMaximized = store.maximized === id

  return [
    {
      label: isMaximized ? 'Restore Panel Size' : 'Maximize Panel',
      onClick: () => store.toggleMaximize(id),
    },
    {
      label: isFloating ? 'Dock Panel' : 'Float Panel',
      onClick: () => {
        store.toggleFloat(id)
        notify('info', isFloating ? 'Panel docked' : 'Panel floating — drag to move')
      },
    },
    { separatorBefore: true, label: 'Close Panel', onClick: () => store.closePanel(id) },
  ]
}
