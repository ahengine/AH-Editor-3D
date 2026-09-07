import {
  Activity,
  ArrowLeftRight,
  Download,
  Move3d,
  Pause,
  Play,
  Rotate3d,
  Save,
  Scale3d,
  Square,
  Undo2,
  Redo2,
  Magnet,
  Globe,
  Compass,
} from 'lucide-react'
import { useEditorStore } from '@ahengine/editor-core'
import { redo, undo } from '@ahengine/editor-core'
import { enterPlayMode, pausePlayMode, resumePlayMode, stopPlayMode } from '@ahengine/editor-core'
import { exportProjectJson, exportSceneJson, saveProject } from '@ahengine/editor-core'

const icon = { size: 16, strokeWidth: 1.7 }

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool)
  const space = useEditorStore((s) => s.space)
  const snapEnabled = useEditorStore((s) => s.snapEnabled)
  const playMode = useEditorStore((s) => s.playMode)
  const undoDepth = useEditorStore((s) => s.undoDepth)
  const redoDepth = useEditorStore((s) => s.redoDepth)
  const diagnosticsOpen = useEditorStore((s) => s.diagnosticsOpen)
  const store = useEditorStore.getState

  return (
    <div className="ah-toolbar">
      <div className="ah-toolbar-group">
        <button className="ah-icon-btn" title="Save (Ctrl+S)" onClick={() => void saveProject()}>
          <Save {...icon} />
        </button>
        <button
          className="ah-icon-btn"
          title="Undo (Ctrl+Z)"
          disabled={undoDepth === 0}
          onClick={undo}
        >
          <Undo2 {...icon} />
        </button>
        <button
          className="ah-icon-btn"
          title="Redo (Ctrl+Shift+Z)"
          disabled={redoDepth === 0}
          onClick={redo}
        >
          <Redo2 {...icon} />
        </button>
      </div>

      <div className="ah-separator" />

      <div className="ah-toolbar-group raised">
        <button
          className={`ah-icon-btn ${tool === 'translate' ? 'active' : ''}`}
          title="Translate (W)"
          onClick={() => store().setTool('translate')}
        >
          <Move3d {...icon} />
        </button>
        <button
          className={`ah-icon-btn ${tool === 'rotate' ? 'active' : ''}`}
          title="Rotate (E)"
          onClick={() => store().setTool('rotate')}
        >
          <Rotate3d {...icon} />
        </button>
        <button
          className={`ah-icon-btn ${tool === 'scale' ? 'active' : ''}`}
          title="Scale (R)"
          onClick={() => store().setTool('scale')}
        >
          <Scale3d {...icon} />
        </button>
        <div className="ah-separator" />
        <div className="ah-segment" title="Transform space">
          <button className={space === 'local' ? 'active' : ''} onClick={() => store().setSpace('local')}>
            <Compass size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
            Local
          </button>
          <button className={space === 'world' ? 'active' : ''} onClick={() => store().setSpace('world')}>
            <Globe size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
            World
          </button>
        </div>
        <div className="ah-separator" />
        <button
          className={`ah-icon-btn ${snapEnabled ? 'active' : ''}`}
          title="Snapping"
          onClick={() => store().setSnap(!snapEnabled)}
        >
          <Magnet {...icon} />
        </button>
      </div>

      <div style={{ flex: 1 }} />

      <div className="ah-toolbar-group">
        <button
          className={`ah-icon-btn accent ${playMode !== 'edit' ? 'active' : ''}`}
          title="Play"
          disabled={playMode === 'play'}
          onClick={playMode === 'paused' ? resumePlayMode : enterPlayMode}
        >
          <Play {...icon} />
        </button>
        <button
          className="ah-icon-btn"
          title="Pause"
          disabled={playMode === 'edit'}
          onClick={pausePlayMode}
          style={{ display: playMode === 'paused' ? 'none' : 'flex' }}
        >
          <Pause {...icon} />
        </button>
        <button
          className="ah-icon-btn"
          title="Resume"
          disabled={playMode === 'edit'}
          onClick={resumePlayMode}
          style={{ display: playMode === 'paused' ? 'flex' : 'none' }}
        >
          <Play {...icon} />
        </button>
        <button
          className="ah-icon-btn"
          title="Stop"
          disabled={playMode === 'edit'}
          onClick={stopPlayMode}
        >
          <Square {...icon} fill="currentColor" />
        </button>

        <div className="ah-separator" />

        <button
          className={`ah-icon-btn ${diagnosticsOpen ? 'active' : ''}`}
          title="Diagnostics"
          onClick={() => store().setDiagnosticsOpen(!diagnosticsOpen)}
        >
          <Activity {...icon} />
        </button>
        <button className="ah-icon-btn" title="Export Project JSON" onClick={exportProjectJson}>
          <Download {...icon} />
        </button>
        <button className="ah-icon-btn" title="Export Scene JSON" onClick={exportSceneJson}>
          <ArrowLeftRight {...icon} />
        </button>
      </div>
    </div>
  )
}
