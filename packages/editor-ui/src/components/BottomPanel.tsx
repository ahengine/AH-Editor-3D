import { Box, Circle, Clapperboard, Layers, Palette, X } from 'lucide-react'
import { useEditorStore } from '@ahengine/editor-core'
import { AssetBrowser } from './AssetBrowser.js'
import { MaterialEditor } from './MaterialEditor.js'
import { AnimatorPanel } from './AnimatorPanel.js'

/** Bottom dock: Assets / Materials / Animator — spans viewport + inspector width. */
export function BottomPanel() {
  const bottomTab = useEditorStore((s) => s.bottomTab)
  const bottomPanelOpen = useEditorStore((s) => s.bottomPanelOpen)
  const store = useEditorStore.getState

  return (
    <div className="ah-panel" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="ah-panel-header" style={{ height: 32 }}>
        <div className="ah-tabs">
          <button className={`ah-tab ${bottomTab === 'assets' ? 'active' : ''}`} onClick={() => store().setBottomTab('assets')}>
            <Layers size={12} /> Assets
          </button>
          <button className={`ah-tab ${bottomTab === 'materials' ? 'active' : ''}`} onClick={() => store().setBottomTab('materials')}>
            <Palette size={12} /> Materials
          </button>
          <button className={`ah-tab ${bottomTab === 'animator' ? 'active' : ''}`} onClick={() => store().setBottomTab('animator')}>
            <Clapperboard size={12} /> Animator
          </button>
        </div>
        <div style={{ flex: 1 }} />
        <button
          className="ah-icon-btn"
          title={bottomPanelOpen ? 'Collapse' : 'Expand'}
          onClick={() => store().setBottomPanelOpen(!bottomPanelOpen)}
        >
          {bottomPanelOpen ? <X size={14} /> : <Box size={14} />}
        </button>
      </div>
      {bottomPanelOpen && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          {bottomTab === 'assets' && <AssetBrowser />}
          {bottomTab === 'materials' && <MaterialEditor />}
          {bottomTab === 'animator' && <AnimatorPanel />}
        </div>
      )}
      {!bottomPanelOpen && (
        <div style={{ padding: '2px 10px 6px', color: 'var(--text-muted)', fontSize: 10.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Circle size={8} fill="currentColor" /> Panel collapsed
        </div>
      )}
    </div>
  )
}
