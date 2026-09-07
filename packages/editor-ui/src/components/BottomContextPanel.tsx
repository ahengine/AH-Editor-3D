import type { WorkspaceId } from '@ahengine/editor-core'
import { instantiatePrefabAction, saveProject, useEditorStore } from '@ahengine/editor-core'
import { HierarchyPanel } from './HierarchyPanel.js'
import { AnimationWorkspace } from './AnimationWorkspace.js'
import { AnimatorWorkspace } from './AnimatorWorkspace.js'
import { ParticleWorkspace } from './ParticleWorkspace.js'
import { AssetBrowser } from './AssetBrowser.js'
import { MaterialListPanel, ParticleListPanel } from './WorkspacePanels.js'
import { PrefabWorkspace } from './PrefabWorkspace.js'
import { MaterialGraphEditor } from './MaterialGraphEditor.js'

/**
 * Workspace configuration — one row per authoring workspace.
 * `left` and `bottom` are compositions; bottom supports tabbed context
 * content that grows per phase. Lighting lives in Scene; the animator
 * state machine lives in Animation.
 */

export interface BottomTabSpec {
  id: string
  label: string
  content: React.ReactNode
}

export interface WorkspaceConfig {
  id: WorkspaceId
  label: string
  left: React.ReactNode
  bottom: BottomTabSpec[]
  inspectorTab: 'inspector' | 'library'
}

export const workspaceConfigs: WorkspaceConfig[] = [
  {
    id: 'scene',
    label: 'Scene',
    left: <HierarchyPanel />,
    inspectorTab: 'inspector',
    bottom: [
      {
        id: 'assets',
        label: 'Assets',
        content: (
          <div className="ah-panel-body">
            <AssetBrowser compact />
          </div>
        ),
      },
    ],
  },
  {
    id: 'prefab',
    label: 'Prefab',
    left: <PrefabWorkspace />,
    inspectorTab: 'inspector',
    bottom: [
      {
        id: 'structure',
        label: 'Structure',
        content: (
          <PrefabCrumbbar />
        ),
      },
    ],
  },
  {
    id: 'material',
    label: 'Material',
    left: <MaterialListPanel />,
    inspectorTab: 'library',
    bottom: [
      {
        id: 'graph',
        label: 'Graph',
        content: <MaterialCenterPanel />,
      },
    ],
  },
  {
    id: 'animation',
    label: 'Animation',
    left: <HierarchyPanel />,
    inspectorTab: 'inspector',
    bottom: [
      { id: 'timeline', label: 'Timeline', content: <AnimationWorkspace /> },
      { id: 'animator', label: 'Animator', content: <AnimatorWorkspace /> },
    ],
  },
  {
    id: 'particle',
    label: 'Particle',
    left: <ParticleListPanel />,
    inspectorTab: 'inspector',
    bottom: [
      {
        id: 'curves',
        label: 'Effect',
        content: <ParticleWorkspace />,
      },
    ],
  },
]

/** Bottom bar for the prefab workspace — reference crumbbar composition. */
function PrefabCrumbbar() {
  const prefabs = useEditorStore((s) => s.prefabs)
  const activePrefabId = useEditorStore((s) => s.activePrefabId)
  const setActivePrefabId = useEditorStore((s) => s.setActivePrefabId)
  const prefab = prefabs.find((p) => p.id === activePrefabId)
  const nested = prefab?.nestedInstances ?? []
  return (
    <div className="ah-crumbbar" style={{ height: '100%' }}>
      <span className="ah-crumb">Assets</span>
      <span style={{ color: 'var(--faint)' }}>›</span>
      <span className="ah-crumb">Prefabs</span>
      <span style={{ color: 'var(--faint)' }}>›</span>
      <span className="ah-crumb active">{prefab?.name ?? '—'}</span>
      {nested.map((n) => (
        <span key={n.instanceId} className="ah-crumb" onClick={() => setActivePrefabId(n.prefabId)}>
          {n.name ?? n.prefabId}
        </span>
      ))}
      <div style={{ flex: 1 }} />
      <button className="ah-btn" onClick={() => prefab && instantiatePrefabAction(prefab.id)}>
        Instantiate
      </button>
      <button className="ah-btn" onClick={() => void saveProject()}>
        Save Prefab
      </button>
    </div>
  )
}

/** Material workspace center — reference composition: node graph hero + preview bar. */
function MaterialCenterPanel() {
  const editingMaterialId = useEditorStore((s) => s.editingMaterialId)
  const materials = useEditorStore((s) => s.materials)
  const activeId = editingMaterialId ?? materials[0]?.id ?? null
  const material = materials.find((m) => m.id === activeId) ?? null
  return (
    <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) 142px', height: '100%', minHeight: 0 }}>
      <div className="ah-panel" style={{ minHeight: 0 }}>
        {activeId ? <MaterialGraphEditor graphId={activeId} /> : <div className="ah-empty">Create a material to edit its graph</div>}
      </div>
      <div className="ah-panel ah-mat-preview-bar">
        <div
          className="ah-spherepreview"
          style={{
            width: 84, height: 84, borderRadius: '50%', flex: 'none',
            background: `radial-gradient(circle at 30% 25%, #eef6ff 0 3%, ${material?.properties?.baseColor ?? '#4f87a6'} 25%, #17212c 77%)`,
            boxShadow: 'inset -18px -22px 36px rgba(0,0,0,.45), 0 12px 28px rgba(0,0,0,.22)',
          }}
        />
        <div>
          <div style={{ fontSize: 11, fontWeight: 650 }}>{material?.name ?? 'No material'}</div>
          <div style={{ fontSize: 8, color: 'var(--faint)', marginTop: 2 }}>Live Material Preview · graph drives the selected scene material</div>
        </div>
        <div style={{ flex: 1 }} />
        <button className="ah-btn" onClick={() => void saveProject()}>
          Save Material
        </button>
      </div>
    </div>
  )
}

/** Bottom context panel — tabbed, content per workspace, architecture open. */
export function BottomContextPanel({ workspace }: { workspace: WorkspaceId }) {
  const config = workspaceConfigs.find((entry) => entry.id === workspace) ?? workspaceConfigs[0]
  const activeTab = useEditorStore((s) => s.bottomTab[workspace])
  const store = useEditorStore.getState
  const tab = config.bottom.find((entry) => entry.id === activeTab) ?? config.bottom[0]

  return (
    <div className="ah-panel">
      {config.bottom.length > 1 ? (
        <div className="ah-panel-head" style={{ paddingBottom: 0 }}>
          <div className="ah-segment">
            {config.bottom.map((entry) => (
              <button
                key={entry.id}
                className={entry.id === tab.id ? 'active' : ''}
                onClick={() => store().setBottomTab(workspace, entry.id)}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {tab.content}
    </div>
  )
}
