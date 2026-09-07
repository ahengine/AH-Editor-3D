import { useEditorStore } from '@ahengine/editor-core'
import type { SceneSettings } from '@ahengine/project-schema'
import { InspectorSection } from '../ui/primitives.js'

/**
 * Scene Lighting & Environment — compact grouped collapsible sections.
 * Light entity settings remain in the Entity Inspector.
 */

export function SceneSettingsPanel({ embedded: _embedded = false }: { embedded?: boolean }) {
  const settings = useEditorStore((s) => s.sceneSettings)
  const assets = useEditorStore((s) => s.assets)
  const set = useEditorStore((s) => s.setSceneSettings)
  const patch = (partial: Partial<SceneSettings>) => set({ ...settings, ...partial })
  const envAssets = assets.filter((a) => a.type === 'environment')

  const colorRow = (label: string, value: string, onChange: (v: string) => void) => (
    <div className="ah-field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" className="ah-color-chip" value={value.slice(0, 7)} onChange={(e) => onChange(e.target.value)} />
        <input className="ah-input" style={{ flex: 1 }} defaultValue={value} key={value} onBlur={(e) => onChange(e.target.value)} />
      </div>
    </div>
  )

  return (
    <>
      <InspectorSection title="Environment">
        <div className="ah-field">
          <label>Skybox</label>
          <select
            className="ah-input"
            style={{ height: 24 }}
            value={settings.environmentAssetId ?? ''}
            onChange={(e) => patch({ environmentAssetId: e.target.value || null })}
          >
            <option value="">— none —</option>
            {envAssets.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        {settings.environmentAssetId && (
          <>
            <div className="ah-field">
              <label>Intensity</label>
              <input className="ah-input" type="number" step="0.1" defaultValue={settings.environmentIntensity}
                key={settings.environmentAssetId + 'int'}
                onBlur={(e) => patch({ environmentIntensity: parseFloat(e.target.value) || 1 })} />
            </div>
            <div className="ah-field">
              <label>Rotation</label>
              <input className="ah-input" type="number" step="0.1" defaultValue={settings.environmentRotation}
                key={settings.environmentAssetId + 'rot'}
                onBlur={(e) => patch({ environmentRotation: parseFloat(e.target.value) || 0 })} />
            </div>
            <label className="ah-check">
              <input type="checkbox" checked={settings.environmentBackground}
                onChange={(e) => patch({ environmentBackground: e.target.checked })} />
              Show as sky background
            </label>
          </>
        )}
        {colorRow('Background', settings.background, (v) => patch({ background: v }))}
      </InspectorSection>

      <InspectorSection title="Ambient">
        <div className="ah-field">
          <label>Intensity</label>
          <input className="ah-input" type="number" step="0.1" min="0" defaultValue={settings.ambientIntensity ?? 0}
            key={settings.ambientIntensity}
            onBlur={(e) => patch({ ambientIntensity: Math.max(0, parseFloat(e.target.value) || 0) })} />
        </div>
        {colorRow('Color', settings.ambientColor ?? '#c8d4e0', (v) => patch({ ambientColor: v }))}
        <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', marginTop: 4 }}>
          Hemisphere ambient — uniform contribution to all objects
        </div>
      </InspectorSection>

      <InspectorSection title="Fog">
        <label className="ah-check">
          <input type="checkbox" checked={settings.fog.enabled}
            onChange={(e) => patch({ fog: { ...settings.fog, enabled: e.target.checked } })} />
          Enabled
        </label>
        {settings.fog.enabled && (
          <>
            <div className="ah-field">
              <label>Mode</label>
              <select className="ah-input" style={{ height: 24 }} value={settings.fog.type}
                onChange={(e) => patch({ fog: { ...settings.fog, type: e.target.value as 'linear' | 'exponential' } })}>
                <option value="linear">Linear</option>
                <option value="exponential">Exponential</option>
              </select>
            </div>
            {colorRow('Color', settings.fog.color, (v) => patch({ fog: { ...settings.fog, color: v } }))}
            {settings.fog.type === 'linear' ? (
              <div className="ah-field">
                <label>Near / Far</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  <input className="ah-input" type="number" defaultValue={settings.fog.near}
                    key="fogNear" onBlur={(e) => patch({ fog: { ...settings.fog, near: parseFloat(e.target.value) || 0 } })} />
                  <input className="ah-input" type="number" defaultValue={settings.fog.far}
                    key="fogFar" onBlur={(e) => patch({ fog: { ...settings.fog, far: parseFloat(e.target.value) || 100 } })} />
                </div>
              </div>
            ) : (
              <div className="ah-field">
                <label>Density</label>
                <input className="ah-input" type="number" step="0.001" defaultValue={settings.fog.density}
                  key="fogDensity" onBlur={(e) => patch({ fog: { ...settings.fog, density: parseFloat(e.target.value) || 0.01 } })} />
              </div>
            )}
          </>
        )}
      </InspectorSection>

      <InspectorSection title="Exposure & Shadows">
        <div className="ah-field">
          <label>Tone Mapping</label>
          <select className="ah-input" style={{ height: 24 }} value={settings.toneMapping}
            onChange={(e) => patch({ toneMapping: e.target.value as SceneSettings['toneMapping'] })}>
            <option value="none">None</option>
            <option value="aces">ACES Filmic</option>
            <option value="linear">Linear</option>
            <option value="reinhard">Reinhard</option>
            <option value="cineon">Cineon</option>
          </select>
        </div>
        <div className="ah-field">
          <label>Exposure</label>
          <input className="ah-input" type="number" step="0.1" defaultValue={settings.toneMappingExposure}
            key={settings.toneMappingExposure}
            onBlur={(e) => patch({ toneMappingExposure: parseFloat(e.target.value) || 1 })} />
        </div>
        <label className="ah-check">
          <input type="checkbox" checked={settings.shadowEnabled}
            onChange={(e) => patch({ shadowEnabled: e.target.checked })} />
          Shadows enabled
        </label>
      </InspectorSection>
    </>
  )
}
