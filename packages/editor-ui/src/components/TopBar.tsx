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
  Play,
  Save,
  Search,
  Share2,
  Upload,
} from 'lucide-react'
import { useEditorStore } from '@ahengine/editor-core'
import { redo, returnFromDocument, undo } from '@ahengine/editor-core'
import { enterPlayMode, stopPlayMode } from '@ahengine/editor-core'
import {
  bootstrapDefaultProject,
  exportProjectJson,
  exportSceneJson,
  importProjectJson,
  openSavedProject,
  saveProject,
} from '@ahengine/editor-core'
import { createCamera, createEntity, createLight, createPrimitive } from '@ahengine/editor-core'
import { SegmentedControl, IconButton } from '../ui/primitives.js'
import { workspaceConfigs } from './BottomContextPanel.js'
import { MenuList, type MenuItemSpec } from '../hooks.js'
import { ProblemsChip } from './ProblemsPanel.js'

const icon13 = { size: 13, strokeWidth: 1.7 }

/**
 * Top bar (46px) — left: logo + project; center: Scene|Animate|Render;
 * right: Share (export), Play, zoom, overflow menu (File/Edit/Create).
 */
export function TopBar() {
  const workspace = useEditorStore((s) => s.workspace)
  const playMode = useEditorStore((s) => s.playMode)
  const projectName = useEditorStore((s) => s.projectName)
  const dirty = useEditorStore((s) => s.dirty)
  const dirtyDocs = useEditorStore((s) => s.dirtyDocs)
  const backend = useEditorStore((s) => s.backend)
  const undoDepth = useEditorStore((s) => s.undoDepth)
  const redoDepth = useEditorStore((s) => s.redoDepth)
  const diagnosticsOpen = useEditorStore((s) => s.diagnosticsOpen)
  const saveState = useEditorStore((s) => s.saveState)
  const viewportScale = useEditorStore((s) => s.viewportScale)
  const returnWorkspace = useEditorStore((s) => s.returnWorkspace)
  const editingMaterialId = useEditorStore((s) => s.editingMaterialId)
  const editingControllerId = useEditorStore((s) => s.editingControllerId)
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
    View: [
      { label: 'Diagnostics', shortcut: '', onClick: () => store().setDiagnosticsOpen(!diagnosticsOpen) },
      { label: 'Grid', onClick: () => store().setGridVisible(!store().gridVisible) },
    ],
  }

  return (
    <div className="ah-topbar">
      <div className="ah-topbar-left">
        <div className="ah-logo">
          <div className="ah-logo-mark" />
          <span className="ah-logo-name">
            AH<em>Engine</em>
          </span>
        </div>
        <span className="ah-topbar-project" title={projectName}>
          {saveState === 'unsaved' && <span className="dirty-dot" />}
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
        {dirty && dirtyDocLabels.length > 0 && (
          <span className="ah-doc-dots" title={`Unsaved documents: ${dirtyDocLabels.join(', ')}`}>
            {dirtyDocLabels.map((label) => (
              <span key={label} className="ah-doc-dot">
                {label}
              </span>
            ))}
          </span>
        )}
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
        {workspace === 'material' && editingMaterialId && (
          <DocumentCrumb doc="Material" id={editingMaterialId} />
        )}
        {workspace === 'animation' && editingControllerId && (
          <DocumentCrumb doc="Controller" id={editingControllerId} />
        )}
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
        <IconButton
          icon={<Play size={15} />}
          label="Play mode"
          active={playMode !== 'edit'}
          disabled={playMode === 'play'}
          onClick={playMode === 'edit' ? enterPlayMode : stopPlayMode}
        />
        <select
          className="ah-input"
          style={{ width: 64, height: 28 }}
          title="Viewport resolution scale"
          value={String(viewportScale)}
          onChange={(event) => store().setViewportScale(parseFloat(event.target.value) || 1)}
        >
          {[0.5, 0.75, 1, 1.5, 2].map((scale) => (
            <option key={scale} value={scale}>
              {Math.round(scale * 100)}%
            </option>
          ))}
        </select>
        <span className={`ah-topbar-chip ${backend === 'webgpu' ? 'gpu' : ''}`} title="Renderer backend">
          <span className="dot" />
          {backend === 'webgpu' ? 'WebGPU' : backend === 'webgl2' ? 'WebGL2' : '…'}
        </span>
        <div className={`ah-menu ${menuOpen ? 'open' : ''}`}>
          <IconButton icon={<MoreHorizontal size={15} />} label="Menu" active={menuOpen} onClick={() => setMenuOpen(!menuOpen)} />
          {menuOpen && (
            <div className="ah-menu-pop" style={{ right: 0, left: 'auto' }}>
              {Object.entries(menus).map(([name, items]) => (
                <div key={name}>
                  <div className="ah-menu-label">{name}</div>
                  <MenuList items={items} onDone={() => setMenuOpen(false)} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Small breadcrumb naming the open document inside the current workspace. */
function DocumentCrumb({ doc, id }: { doc: string; id: string }) {
  const name =
    useEditorStore((s) =>
      doc === 'Material' ? s.materials.find((m) => m.id === id)?.name : s.controllers.find((c) => c.id === id)?.name
    ) ?? id
  return (
    <span className="ah-doc-crumb" title={`${doc}: ${name}`}>
      <span className="ah-doc-crumb-kind">{doc}</span>
      {name}
    </span>
  )
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
