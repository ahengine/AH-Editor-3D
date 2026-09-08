/**
 * Named layout manager — save/load/import/export/remove named panel
 * layouts. Layouts are editor preferences (never project data): they live
 * in localStorage and export as standalone JSON files.
 *
 * A "layout" captures the resizable panel sizes for EVERY workspace plus
 * the grid/snap/viewport preferences, so switching between named layouts
 * restores a complete editing environment.
 */

const STORE_KEY = 'ahengine.layouts.v1'

export interface SavedLayout {
  name: string
  createdAt: string
  /** Panel sizes per workspace group (from react-resizable-panels). */
  panelLayouts: Record<string, Record<string, number>>
  /** Editor preferences snapshot. */
  preferences: {
    snapEnabled: boolean
    snapTranslate: number
    snapRotateDeg: number
    snapScale: number
    gridVisible: boolean
    viewportScale: number
  }
}

interface LayoutStore {
  /** Active layout name (restored on boot). */
  active: string | null
  layouts: Record<string, SavedLayout>
}

function readStore(): LayoutStore {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (!raw) return { active: null, layouts: {} }
    return JSON.parse(raw) as LayoutStore
  } catch {
    return { active: null, layouts: {} }
  }
}

function writeStore(store: LayoutStore): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store))
  } catch {
    /* storage unavailable */
  }
}

const PANEL_KEY = 'ahengine.panel-layout.v2'

function readPanelLayouts(): Record<string, Record<string, number>> {
  try {
    const raw = localStorage.getItem(PANEL_KEY)
    return raw ? (JSON.parse(raw) as Record<string, Record<string, number>>) : {}
  } catch {
    return {}
  }
}

function writePanelLayouts(layouts: Record<string, Record<string, number>>): void {
  try {
    localStorage.setItem(PANEL_KEY, JSON.stringify(layouts))
  } catch {
    /* ignore */
  }
}

const PREFS_KEY = 'ahengine.prefs.v1'

function readPreferences(): SavedLayout['preferences'] {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return defaultPrefs()
    return { ...defaultPrefs(), ...(JSON.parse(raw) as Partial<SavedLayout['preferences']>) }
  } catch {
    return defaultPrefs()
  }
}

function defaultPrefs(): SavedLayout['preferences'] {
  return {
    snapEnabled: false,
    snapTranslate: 0.5,
    snapRotateDeg: 15,
    snapScale: 0.1,
    gridVisible: true,
    viewportScale: 1,
  }
}

/** Capture the current editing environment as a named layout. */
export function saveNamedLayout(name: string): SavedLayout {
  const layout: SavedLayout = {
    name,
    createdAt: new Date().toISOString(),
    panelLayouts: readPanelLayouts(),
    preferences: readPreferences(),
  }
  const store = readStore()
  store.layouts[name] = layout
  store.active = name
  writeStore(store)
  return layout
}

/** Apply a named layout (panel sizes + preferences). Returns null if missing. */
export function loadNamedLayout(name: string): SavedLayout | null {
  const store = readStore()
  const layout = store.layouts[name]
  if (!layout) return null
  store.active = name
  writeStore(store)
  writePanelLayouts(layout.panelLayouts)
  try {
    const current = readPreferences()
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...layout.preferences }))
  } catch {
    /* ignore */
  }
  return layout
}

/** Remove a named layout. */
export function removeNamedLayout(name: string): boolean {
  const store = readStore()
  if (!store.layouts[name]) return false
  delete store.layouts[name]
  if (store.active === name) store.active = null
  writeStore(store)
  return true
}

/** List all saved layouts (name → metadata). */
export function listNamedLayouts(): { name: string; createdAt: string }[] {
  const store = readStore()
  return Object.values(store.layouts)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(({ name, createdAt }) => ({ name, createdAt }))
}

/** Get the active layout name. */
export function getActiveLayout(): string | null {
  return readStore().active
}

/** Export a named layout as a JSON download. */
export function exportNamedLayout(name: string): boolean {
  const store = readStore()
  const layout = store.layouts[name]
  if (!layout) return false
  const blob = new Blob([JSON.stringify(layout, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${name.replace(/\s+/g, '-').toLowerCase()}.ahengine-layout.json`
  anchor.click()
  URL.revokeObjectURL(url)
  return true
}

/** Import a layout from a JSON file/object. Returns the stored name. */
export function importNamedLayout(json: unknown): string | null {
  try {
    const data = json as Partial<SavedLayout>
    if (!data.name || typeof data.name !== 'string' || !data.panelLayouts) return null
    const layout: SavedLayout = {
      name: data.name,
      createdAt: data.createdAt ?? new Date().toISOString(),
      panelLayouts: data.panelLayouts,
      preferences: { ...defaultPrefs(), ...(data.preferences ?? {}) },
    }
    const store = readStore()
    store.layouts[layout.name] = layout
    writeStore(store)
    return layout.name
  } catch {
    return null
  }
}
