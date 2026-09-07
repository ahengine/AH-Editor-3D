import { Mountain, Settings } from 'lucide-react'
import { useEditorStore } from '@ahengine/editor-core'
import type { SceneSettings } from '@ahengine/project-schema'

/** Scene settings — shown in the Inspector when nothing is selected. */
export function SceneSettingsPanel() {
  const settings = useEditorStore((s) => s.sceneSettings)
  const assets = useEditorStore((s) => s.assets)
  const set = useEditorStore((s) => s.setSceneSettings)
  const patch = (partial: Partial<SceneSettings>) => set({ ...settings, ...partial })

  return (
    <div>
      <div className="ah-component-header" style={{ cursor: 'default' }}>
        <Settings size={13} style={{ color: 'var(--text-muted)' }} />
        <span className="name">Scene Settings</span>
      </div>
      <div className="ah-component-body">
        <div className="ah-field">
          <label>Background</label>
          <div className="ah-color">
            <input
              type="color"
              value={settings.background.slice(0, 7)}
              onChange={(e) => patch({ background: e.target.value })}
            />
            <span />
            <input className="ah-input" value={settings.background} onChange={(e) => patch({ background: e.target.value })} />
          </div>
        </div>

        <div className="ah-field">
          <label>Environment</label>
          <select
            className="ah-input"
            style={{ height: 24 }}
            value={settings.environmentAssetId ?? ''}
            onChange={(e) => patch({ environmentAssetId: e.target.value || null })}
          >
            <option value="">— none —</option>
            {assets
              .filter((a) => a.type === 'environment')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
          </select>
        </div>

        <div className="ah-field">
          <label>Env Intensity</label>
          <input
            className="ah-input"
            type="number"
            step={0.1}
            defaultValue={settings.environmentIntensity}
            onBlur={(e) => patch({ environmentIntensity: parseFloat(e.target.value) || 1 })}
          />
        </div>

        <label className="ah-check" style={{ marginTop: 2 }}>
          <input
            type="checkbox"
            checked={settings.fog.enabled}
            onChange={(e) => patch({ fog: { ...settings.fog, enabled: e.target.checked } })}
          />
          Fog enabled
        </label>
        {settings.fog.enabled && (
          <>
            <div className="ah-field">
              <label>Fog Color</label>
              <div className="ah-color">
                <input
                  type="color"
                  value={settings.fog.color.slice(0, 7)}
                  onChange={(e) => patch({ fog: { ...settings.fog, color: e.target.value } })}
                />
                <span />
                <span />
              </div>
            </div>
            <div className="ah-field">
              <label>Fog Near / Far</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <input
                  className="ah-input"
                  type="number"
                  defaultValue={settings.fog.near}
                  onBlur={(e) => patch({ fog: { ...settings.fog, near: parseFloat(e.target.value) || 0 } })}
                />
                <input
                  className="ah-input"
                  type="number"
                  defaultValue={settings.fog.far}
                  onBlur={(e) => patch({ fog: { ...settings.fog, far: parseFloat(e.target.value) || 100 } })}
                />
              </div>
            </div>
          </>
        )}

        <div className="ah-field">
          <label>Tone Mapping</label>
          <select
            className="ah-input"
            style={{ height: 24 }}
            value={settings.toneMapping}
            onChange={(e) => patch({ toneMapping: e.target.value as SceneSettings['toneMapping'] })}
          >
            <option value="none">None</option>
            <option value="aces">ACES Filmic</option>
            <option value="linear">Linear</option>
            <option value="reinhard">Reinhard</option>
            <option value="cineon">Cineon</option>
          </select>
        </div>
        <div className="ah-field">
          <label>Exposure</label>
          <input
            className="ah-input"
            type="number"
            step={0.1}
            defaultValue={settings.toneMappingExposure}
            onBlur={(e) => patch({ toneMappingExposure: parseFloat(e.target.value) || 1 })}
          />
        </div>
        <label className="ah-check">
          <input
            type="checkbox"
            checked={settings.shadowEnabled}
            onChange={(e) => patch({ shadowEnabled: e.target.checked })}
          />
          Shadows enabled
        </label>

        <div className="ah-empty" style={{ padding: '10px 4px', textAlign: 'left', display: 'flex', gap: 6 }}>
          <Mountain size={13} style={{ flex: 'none', marginTop: 1 }} />
          Import an .hdr file in Assets, then assign it as Environment.
        </div>
      </div>
    </div>
  )
}
