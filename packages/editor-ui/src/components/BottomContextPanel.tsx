import type { WorkspaceId } from '@ahengine/editor-core'
import { useEditorStore } from '@ahengine/editor-core'
import { HierarchyPanel } from './HierarchyPanel.js'
import { AnimationWorkspace } from './AnimationWorkspace.js'
import { AnimatorWorkspace } from './AnimatorWorkspace.js'
import { AssetBrowser } from './AssetBrowser.js'
import { MaterialListPanel, ParticleListPanel, IncompletePanelShell } from './WorkspacePanels.js'
import { PrefabWorkspace } from './PrefabWorkspace.js'
import { MaterialGraphWorkspace } from './MaterialGraphEditor.js'

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
          <IncompletePanelShell
            domain="Prefab structure"
            hint="Instance-override inspection and visual diff arrive next. The data model (localIds, nestedInstances, overrides, cycle protection) is fully functional and tested."
          />
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
        content: <MaterialGraphWorkspace />,
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
        label: 'Curves',
        content: (
          <IncompletePanelShell
            domain="Particle curves"
            hint="Curve/timeline editing arrives with the Particle phase. Effect parameters (emission, color/size over life) are already part of the saved data contract."
          />
        ),
      },
    ],
  },
]

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
