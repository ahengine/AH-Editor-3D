import { useState } from 'react'
import {
  Box,
  Camera,
  Circle,
  Cone,
  Cylinder,
  Disc,
  Download,
  FilePlus2,
  FolderOpen,
  Globe,
  Lightbulb,
  Redo2,
  Save,
  Square,
  Undo2,
  Upload,
} from 'lucide-react'
import { useEditorStore } from '@ahengine/editor-core'
import {
  createCamera,
  createLight,
  createPrimitive,
  redo,
  undo,
} from '@ahengine/editor-core'
import {
  bootstrapDefaultProject,
  exportProjectJson,
  importProjectJson,
  openSavedProject,
  saveProject,
} from '@ahengine/editor-core'
import { MenuList, type MenuItemSpec } from '../hooks.js'

const icon12 = { size: 13, strokeWidth: 1.8 }

export function MenuBar() {
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const projectName = useEditorStore((s) => s.projectName)
  const dirty = useEditorStore((s) => s.dirty)
  const undoDepth = useEditorStore((s) => s.undoDepth)
  const redoDepth = useEditorStore((s) => s.redoDepth)
  const backend = useEditorStore((s) => s.backend)

  const menus: Record<string, MenuItemSpec[]> = {
    File: [
      {
        label: 'New Project',
        icon: <FilePlus2 {...icon12} />,
        shortcut: '',
        onClick: () => bootstrapDefaultProject(),
      },
      { label: 'Open Saved', icon: <FolderOpen {...icon12} />, onClick: () => void openSavedProject() },
      { label: 'Save', icon: <Save {...icon12} />, shortcut: 'Ctrl+S', onClick: () => void saveProject() },
      { label: 'Import Project JSON…', icon: <Upload {...icon12} />, onClick: () => importJsonFile() },
      { separatorBefore: true, label: 'Export Project', icon: <Download {...icon12} />, onClick: exportProjectJson },
    ],
    Edit: [
      { label: 'Undo', icon: <Undo2 {...icon12} />, shortcut: 'Ctrl+Z', disabled: undoDepth === 0, onClick: undo },
      { label: 'Redo', icon: <Redo2 {...icon12} />, shortcut: 'Ctrl+Shift+Z', disabled: redoDepth === 0, onClick: redo },
    ],
    Create: [
      { sectionLabel: '3D Objects', label: 'Cube', icon: <Box {...icon12} />, onClick: () => createPrimitive('box') },
      { label: 'Sphere', icon: <Globe {...icon12} />, onClick: () => createPrimitive('sphere') },
      { label: 'Plane', icon: <Square {...icon12} />, onClick: () => createPrimitive('plane') },
      { label: 'Cylinder', icon: <Cylinder {...icon12} />, onClick: () => createPrimitive('cylinder') },
      { label: 'Cone', icon: <Cone {...icon12} />, onClick: () => createPrimitive('cone') },
      { sectionLabel: 'Lights', label: 'Directional Light', icon: <Lightbulb {...icon12} />, onClick: () => createLight('directional') },
      { label: 'Point Light', icon: <Circle {...icon12} />, onClick: () => createLight('point') },
      { label: 'Spot Light', icon: <Disc {...icon12} />, onClick: () => createLight('spot') },
      { label: 'Ambient Light', icon: <Circle {...icon12} />, onClick: () => createLight('ambient') },
      { label: 'Hemisphere Light', icon: <Circle {...icon12} />, onClick: () => createLight('hemisphere') },
      { sectionLabel: 'Other', label: 'Camera', icon: <Camera {...icon12} />, onClick: createCamera },
    ],
  }

  return (
    <div className="ah-menubar">
      <div className="ah-logo">
        <div className="ah-logo-mark" />
        <div className="ah-logo-name">
          AH<em>Engine</em>
        </div>
      </div>
      <div className="ah-project-chip" title={projectName}>
        {dirty && <span className="dirty-dot" />}
        {projectName}
      </div>
      {Object.entries(menus).map(([name, items]) => (
        <div className={`ah-menu ${openMenu === name ? 'open' : ''}`} key={name}>
          <button
            className="ah-menu-trigger"
            onClick={() => setOpenMenu(openMenu === name ? null : name)}
            onMouseEnter={() => openMenu && setOpenMenu(name)}
          >
            {name}
          </button>
          {openMenu === name && (
            <div className="ah-menu-pop">
              <MenuList items={items} onDone={() => setOpenMenu(null)} />
            </div>
          )}
        </div>
      ))}
      <div style={{ flex: 1 }} />
      <div className={`ah-backend-chip ${backend === 'webgpu' ? 'webgpu' : backend === 'webgl2' ? 'webgl2' : ''}`}>
        <span className="dot" />
        {backend === 'initializing' ? 'INITIALIZING…' : backend === 'webgpu' ? 'WEBGPU' : 'WEBGL2 FALLBACK'}
      </div>
    </div>
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
