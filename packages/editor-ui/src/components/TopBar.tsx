import { createPortal } from 'react-dom'
import { useState } from 'react'
import {
  Box,
  Camera,
  ChevronLeft,
  Circle,
  Cone,
  Cylinder,
  Disc,
  Download,
  FilePlus2,
  FolderOpen,
  Globe,
  Lightbulb,
  MoreHorizontal,
  Save,
  Search,
  Share2,
  Upload,
} from 'lucide-react'
import { useEditorStore } from '@ahengine/editor-core'
import { redo, returnFromDocument, undo } from '@ahengine/editor-core'
import {
  bootstrapDefaultProject,
  exportProjectJson,
  exportSceneJson,
  importProjectJson,
  openSavedProject,
  saveProject,
} from '@ahengine/editor-core'
import { useWindowPanels } from '@ahengine/editor-core'
import { createCamera, createEntity, createLight, createPrimitive, exportNamedLayout, importNamedLayout, listNamedLayouts, loadNamedLayout, removeNamedLayout, saveNamedLayout } from '@ahengine/editor-core'
import { SegmentedControl, IconButton } from '../ui/primitives.js'
import { workspaceConfigs } from './BottomContextPanel.js'
import { MenuList, type MenuItemSpec } from '../hooks.js'
import { ProblemsChip } from './ProblemsPanel.js'

const icon13 = { size: 13, strokeWidth: 1.7 }

/**
 * Top bar (46px) — left: logo + project; center: Scene|Animate|Render;
 * right: Share (export), Play, zoom, overflow menu (File/Edit/Create).
 */
/* ------------------------------------------------------------------ */
/* Named layout menu items (Save/Load/Import/Export/Remove)             */
/* ------------------------------------------------------------------ */

function layoutMenuItems(): MenuItemSpec[] {
  const saved = listNamedLayouts()
  const items: MenuItemSpec[] = [{ separatorBefore: true, sectionLabel: 'Layouts', label: 'Save Current Layout…', onClick: () => {
    const name = window.prompt('Layout name', 'My Layout')
    if (name && name.trim()) {
      saveNamedLayout(name.trim())
      useEditorStore.getState().notify('success', `Layout "${name.trim()}" saved`)
    }
  } }]
  if (saved.length > 0) {
    for (const { name } of saved) {
      items.push({
        label: `Load: ${name}`,
        onClick: () => {
          const layout = loadNamedLayout(name)
          if (layout) {
            localStorage.setItem('ahengine.prefs.v1', JSON.stringify({ ...JSON.parse(localStorage.getItem('ahengine.prefs.v1') ?? '{}'), ...layout.preferences }))
            location.reload()
          }
        },
      })
    }
    for (const { name } of saved.slice(0, 4)) {
      items.push({
        label: `Export: ${name}`,
        onClick: () => {
          if (exportNamedLayout(name)) useEditorStore.getState().notify('success', `Layout "${name}" exported`)
        },
      })
    }
    const first = saved[0]?.name
    if (first) {
      items.push({ label: `Remove: ${first}…`, onClick: () => {
        const name = window.prompt('Layout name to remove', first)
        if (name && removeNamedLayout(name)) useEditorStore.getState().notify('info', `Layout "${name}" removed`)
      } })
    }
  }
  items.push({ label: 'Import Layout JSON…', onClick: () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.ahengine-layout.json'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      try {
        const name = importNamedLayout(JSON.parse(await file.text()))
        if (name) useEditorStore.getState().notify('success', `Layout "${name}" imported`)
        else useEditorStore.getState().notify('error', 'Invalid layout file')
      } catch {
        useEditorStore.getState().notify('error', 'Could not parse layout JSON')
      }
    }
    input.click()
  } })
  return items
}

export function TopBar() {
  const workspace = useEditorStore((s) => s.workspace)
  const playMode = useEditorStore((s) => s.playMode)
  const projectName = useEditorStore((s) => s.projectName)
  const dirtyDocs = useEditorStore((s) => s.dirtyDocs)
  const backend = useEditorStore((s) => s.backend)
  const undoDepth = useEditorStore((s) => s.undoDepth)
  const redoDepth = useEditorStore((s) => s.redoDepth)
  const diagnosticsOpen = useEditorStore((s) => s.diagnosticsOpen)
  const saveState = useEditorStore((s) => s.saveState)
  const viewportScale = useEditorStore((s) => s.viewportScale)
  const returnWorkspace = useEditorStore((s) => s.returnWorkspace)
  const [menuOpen, setMenuOpen] = useState(false)
  const store = useEditorStore.getState

  const dirtyDocLabels = Object.entries(dirtyDocs)
    .filter(([, value]) => value)
    .map(([key]) => key[0].toUpperCase() + key.slice(1))

  const menus: Record<string, MenuItemSpec[]> = {
    File: [
      { label: 'New Project', icon: <FilePlus2 {...icon13} />, onClick: () => bootstrapDefaultProject() },
      { label: 'Open Saved', icon: <FolderOpen {...icon13} />, onClick: () => void openSavedProject() },
      { label: 'Save All', icon: <Save {...icon13} />, shortcut: 'Ctrl+S', onClick: () => void saveProject() },
      { label: 'Save As…', onClick: () => {
        const name = window.prompt('Project name', useEditorStore.getState().projectName)
        if (name && name.trim()) void import('@ahengine/editor-core').then(m => m.saveProjectAs(name.trim()))
      } },
      { label: 'Import Project JSON…', icon: <Upload {...icon13} />, onClick: () => importJsonFile() },
      { separatorBefore: true, label: 'Export Project', icon: <Download {...icon13} />, onClick: exportProjectJson },
      { label: 'Export Scene', icon: <Download {...icon13} />, onClick: exportSceneJson },
    ],
    Edit: [
      { label: 'Undo', shortcut: 'Ctrl+Z', disabled: undoDepth === 0, onClick: undo },
      { label: 'Redo', shortcut: 'Ctrl+Shift+Z', disabled: redoDepth === 0, onClick: redo },
    ],
    Create: [
      { label: 'Empty Entity', onClick: () => createEntity({ name: 'Entity', components: { 'core.transform': {} } }) },
      { sectionLabel: '3D Objects', label: 'Cube', icon: <Box {...icon13} />, onClick: () => createPrimitive('box') },
      { label: 'Sphere', icon: <Globe {...icon13} />, onClick: () => createPrimitive('sphere') },
      { label: 'Plane', icon: <Disc {...icon13} />, onClick: () => createPrimitive('plane') },
      { label: 'Cylinder', icon: <Cylinder {...icon13} />, onClick: () => createPrimitive('cylinder') },
      { label: 'Cone', icon: <Cone {...icon13} />, onClick: () => createPrimitive('cone') },
      { sectionLabel: 'Lights', label: 'Directional Light', icon: <Lightbulb {...icon13} />, onClick: () => createLight('directional') },
      { label: 'Point Light', icon: <Circle {...icon13} />, onClick: () => createLight('point') },
      { label: 'Spot Light', icon: <Disc {...icon13} />, onClick: () => createLight('spot') },
      { label: 'Hemisphere Light', icon: <Globe {...icon13} />, onClick: () => createLight('hemisphere') },
      { sectionLabel: 'Other', label: 'Camera', icon: <Camera {...icon13} />, onClick: createCamera },
    ],
    Window: [
      { label: 'Add Hierarchy', onClick: () => useWindowPanels.getState().addPanel('hierarchy') },
      { label: 'Add Inspector', onClick: () => useWindowPanels.getState().addPanel('inspector') },
      { label: 'Add Viewport', onClick: () => useWindowPanels.getState().addPanel('viewport') },
      { label: 'Add Project', onClick: () => useWindowPanels.getState().addPanel('project') },
    ],
    View: [
      { label: 'Diagnostics', shortcut: '', onClick: () => store().setDiagnosticsOpen(!diagnosticsOpen) },
      { label: 'Grid', onClick: () => store().setGridVisible(!store().gridVisible) },
      { label: 'Reset Layout', onClick: () => { localStorage.removeItem('ahengine.panel-layout.v2'); location.reload() } },
      ...layoutMenuItems(),
    ],
  }

  return (
    <div className="ah-topbar">
      <div className="ah-topbar-left">
        <div className="ah-logo">
          <div className="ah-logo-mark" />
          <span className="ah-logo-name">AHEditor</span>
        </div>
        <span className="ah-topbar-project" title={projectName}>
          {projectName}
        </span>
        <span
          className={`ah-save-state ${saveState}`}
          title={
            dirtyDocLabels.length > 0
              ? `Unsaved: ${dirtyDocLabels.join(', ')} — Ctrl+S saves all documents`
              : saveState === 'saved'
                ? 'All changes saved'
                : saveState === 'saving'
                  ? 'Saving…'
                  : 'Unsaved changes'
          }
        >
          {saveState === 'saved' ? 'Saved' : saveState === 'saving' ? 'Saving…' : 'Unsaved'}
        </span>
      </div>

      <div className="ah-topbar-center">
        {returnWorkspace && workspace !== 'scene' && (
          <button
            className="ah-back-nav"
            title={`Back to ${returnWorkspace}`}
            onClick={returnFromDocument}
          >
            <ChevronLeft size={13} />
            {returnWorkspace[0].toUpperCase() + returnWorkspace.slice(1)}
          </button>
        )}
        <SegmentedControl
          size="top"
          value={workspace}
          onChange={(next) => {
            store().setWorkspace(next)
            store().setReturnWorkspace(null)
            // Workspaces own their inspector focus (Material → Library).
            const config = workspaceConfigs.find((entry) => entry.id === next)
            if (config) store().setInspectorTab(config.inspectorTab)
          }}
          options={workspaceConfigs.map((config) => ({ value: config.id, label: config.label }))}
        />
        <SelectionCrumb />
      </div>

      <div className="ah-topbar-right">
        <button className="ah-btn ah-search-btn" onClick={() => store().setPaletteOpen(true)} title="Search (Ctrl+K)">
          <Search size={13} /> Search
          <span className="ah-kbd">Ctrl K</span>
        </button>
        <ProblemsChip />
        <button className="ah-btn" onClick={exportProjectJson}>
          <Share2 size={13} /> Share
        </button>
        <button
          className="ah-btn"
          title="Viewport resolution scale"
          onClick={(event) => {
            const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
            setMenuOpen(false)
            void rect
          }}
        >
          {Math.round(viewportScale * 100)}% ▾
        </button>
        <button
          className="ah-btn"
          title="Resolution"
          onClick={() => {
            const scales = [0.5, 0.75, 1, 1.5, 2]
            const next = scales[(scales.indexOf(viewportScale) + 1) % scales.length]
            store().setViewportScale(next)
          }}
        >
          <span className="dot" style={{ width: 7, height: 7, borderRadius: '50%', background: backend === 'webgpu' ? '#62a0ff' : '#87919a', boxShadow: backend === 'webgpu' ? '0 0 9px #62a0ff' : 'none' }} />
          {backend === 'webgpu' ? 'WebGPU' : backend === 'webgl2' ? 'WebGL2' : '…'}
        </button>
        <IconButton icon={<Save size={15} />} label="Save project (Ctrl+S)" onClick={() => void saveProject()} />
        <div className={`ah-menu ${menuOpen ? 'open' : ''}`}>
          <IconButton icon={<MoreHorizontal size={15} />} label="Menu" active={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
          {menuOpen &&
            createPortal(
              <div
                className="ah-menu-pop"
                style={{
                  position: 'fixed',
                  right: 12,
                  top: 'calc(var(--topbar-height) + 10px)',
                  left: 'auto',
                  zIndex: 9999,
                }}
              >
                {Object.entries(menus).map(([name, items]) => (
                  <div key={name}>
                    <div className="ah-menu-label">{name}</div>
                    <MenuList items={items} onDone={() => setMenuOpen(false)} />
                  </div>
                ))}
              </div>,
              document.body
            )}
        </div>
      </div>
    </div>
  )
}

/**
 * The typed global selection, surfaced: names the open document object in
 * the workspace that owns it. Reads selectionFocus (set by openAsset and
 * single-entity selection), so every navigation surface stays in sync.
 */
function SelectionCrumb() {
  const focus = useEditorStore((s) => s.selectionFocus)
  const doc = focus ? docLabelFor(focus.kind) : null
  const name = useEditorStore((s) => (focus ? nameForSelection(s, focus) : null))
  if (!focus || !doc || focus.kind === 'entity') return null
  return (
    <span className="ah-doc-crumb" title={`${doc}: ${name ?? focus.id}`}>
      <span className="ah-doc-crumb-kind">{doc}</span>
      {name ?? focus.id}
    </span>
  )
}

function docLabelFor(kind: 'entity' | 'asset' | 'material' | 'prefab' | 'clip' | 'controller' | 'particleEffect'): string {
  switch (kind) {
    case 'material':
      return 'Material'
    case 'prefab':
      return 'Prefab'
    case 'clip':
      return 'Clip'
    case 'controller':
      return 'Controller'
    case 'particleEffect':
      return 'Effect'
    case 'asset':
      return 'Asset'
    default:
      return kind
  }
}

function nameForSelection(
  s: ReturnType<typeof useEditorStore.getState>,
  focus: { kind: 'entity' | 'asset' | 'material' | 'prefab' | 'clip' | 'controller' | 'particleEffect'; id: string }
): string | null {
  switch (focus.kind) {
    case 'material':
      return s.materials.find((m) => m.id === focus.id)?.name ?? null
    case 'prefab':
      return s.prefabs.find((p) => p.id === focus.id)?.name ?? null
    case 'clip':
      return s.animations.find((c) => c.id === focus.id)?.name ?? null
    case 'controller':
      return s.controllers.find((c) => c.id === focus.id)?.name ?? null
    case 'particleEffect':
      return s.particleEffects.find((e) => e.id === focus.id)?.name ?? null
    case 'asset':
      return s.assets.find((a) => a.id === focus.id)?.name ?? null
    default:
      return null
  }
}

function importJsonFile(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,.koota-project.json,.koota-scene.json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      importProjectJson(JSON.parse(await file.text()))
    } catch (error) {
      useEditorStore.getState().notify('error', `Invalid JSON: ${(error as Error).message}`)
    }
  }
  input.click()
}
