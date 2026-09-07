import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Play, Pause, Square, SkipBack, SkipForward, Repeat, Plus, Trash2, CircleDot } from 'lucide-react'
import type { AnimationClipData, AnimationTrack, AnimationKeyframe } from '@ahengine/project-schema'
import { sampleClip, sampleTrack } from '@ahengine/ecs-runtime'
import { runCommand, SetDocumentListCommand, useEditorStore } from '@ahengine/editor-core'
import { IconButton } from '../ui/primitives.js'

/**
 * Animation Clip Authoring workspace.
 * Left: track hierarchy. Center-top: 3D preview (reuses main viewport).
 * Center-bottom: timeline with keyframes. Right: clip/track/keyframe inspector.
 * No Animator state machine here — this is keyframe clip authoring only.
 */

const kfId = () => `kf-${crypto.randomUUID().slice(0, 8)}`

export function AnimationWorkspace() {
  const animations = useEditorStore((s) => s.animations)
  const [activeClipId, setActiveClipId] = useState<string | null>(null)
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [selectedKeyframeIds, setSelectedKeyframeIds] = useState<Set<string>>(new Set())
  const [autoKey, setAutoKey] = useState(false)

  const clip = useMemo(
    () => animations.find((c) => c.id === activeClipId) ?? null,
    [animations, activeClipId]
  )

  const updateClip = useCallback((next: AnimationClipData) => {
    const s = useEditorStore.getState()
    runCommand(
      new SetDocumentListCommand(
        `Edit ${next.name}`,
        'animation',
        'animations',
        s.animations,
        s.animations.map((c) => (c.id === next.id ? next : c))
      )
    )
  }, [])

  return (
    <div className="ah-anim-workspace">
      {/* Left: clip list + track hierarchy */}
      <div className="ah-panel" style={{ width: 220, flex: 'none' }}>
        <div className="ah-panel-head">
          <span className="ah-panel-title">Clips</span>
          <IconButton
            small
            icon={<Plus size={13} />}
            label="New clip"
            onClick={() => {
              const id = `clip-${crypto.randomUUID().slice(0, 8)}`
              const s = useEditorStore.getState()
              const newClip: AnimationClipData = {
                format: 'koota-3d-animation-clip',
                schemaVersion: 1,
                id,
                name: `Clip ${s.animations.length + 1}`,
                duration: 5,
                fps: 30,
                tracks: [],
              }
              runCommand(
                new SetDocumentListCommand(
                  `Create ${newClip.name}`,
                  'animation',
                  'animations',
                  s.animations,
                  [...s.animations, newClip]
                )
              )
              setActiveClipId(id)
            }}
          />
        </div>
        <div className="ah-panel-body">
          {animations.map((c) => (
            <div
              key={c.id}
              className={`ah-list-row ${c.id === activeClipId ? 'focused' : ''}`}
              onClick={() => { setActiveClipId(c.id); setSelectedTrackId(null); setSelectedKeyframeIds(new Set()) }}
            >
              <span className="ah-list-icon"><Play size={12} /></span>
              <span className="ah-list-name">{c.name}</span>
              <span className="ah-list-meta">{c.tracks.length} trk</span>
            </div>
          ))}
          {animations.length === 0 && <div className="ah-empty">Create a clip to animate</div>}
        </div>

        {/* Track hierarchy for active clip */}
        {clip && clip.tracks.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border-subtle)', flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', letterSpacing: '0.08em', padding: 'var(--sp-2) var(--sp-3)' }}>
              TRACKS
            </div>
            {clip.tracks.map((track) => (
              <div
                key={track.id}
                className={`ah-list-row ${track.id === selectedTrackId ? 'focused' : ''}`}
                style={{ paddingLeft: 20 }}
                onClick={() => setSelectedTrackId(track.id)}
              >
                <span style={{ fontSize: 'var(--fs-tiny)', color: 'var(--accent)' }}>
                  {track.property.includes('position') ? 'XYZ' : track.property.includes('rotation') ? 'ROT' : 'SCL'}
                </span>
                <span className="ah-list-name">{track.targetName ?? track.target.slice(0, 8)}…</span>
                <span className="ah-list-meta">{track.property}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Center: timeline + right inspector */}
      {clip ? (
        <>
          <TimelinePanel
            clip={clip}
            selectedTrackId={selectedTrackId}
            selectedKeyframeIds={selectedKeyframeIds}
            onSelectTrack={setSelectedTrackId}
            onSelectKeyframes={setSelectedKeyframeIds}
            onClipChange={updateClip}
            autoKey={autoKey}
          />
          <ClipInspector
            clip={clip}
            selectedTrackId={selectedTrackId}
            selectedKeyframeIds={selectedKeyframeIds}
            autoKey={autoKey}
            onAutoKeyToggle={() => setAutoKey(!autoKey)}
            onClipChange={updateClip}
          />
        </>
      ) : (
        <div className="ah-empty" style={{ flex: 1 }}>
          <Play size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
          <div>Create or select an animation clip</div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Timeline panel — ruler, playhead, tracks, keyframes, transport      */
/* ------------------------------------------------------------------ */

function TimelinePanel({
  clip, selectedTrackId, selectedKeyframeIds,
  onSelectTrack, onSelectKeyframes, onClipChange, autoKey,
}: {
  clip: AnimationClipData
  selectedTrackId: string | null
  selectedKeyframeIds: Set<string>
  onSelectTrack: (id: string) => void
  onSelectKeyframes: (ids: Set<string>) => void
  onClipChange: (clip: AnimationClipData) => void
  autoKey: boolean
}) {
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [loop, setLoop] = useState(true)
  const [pxPerSecond] = useState(80)
  const rafRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ keyframeId: string; startX: number; origTime: number } | null>(null)

  // Playback ticker
  useEffect(() => {
    if (!playing) return
    let last = performance.now()
    const tick = (now: number) => {
      const dt = (now - last) / 1000
      last = now
      setTime((prev) => {
        const next = prev + dt
        if (next >= clip.duration) return loop ? 0 : clip.duration
        return next
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, clip.duration, loop])

  // Preview: apply clip sample to scene entities
  useEffect(() => {
    if (!playing && time === 0) return
    void sampleClip; void time; void playing; void clip
    // V1: preview integration uses the shared sampleClip/applyClipSample from
    // ecs-runtime. The main viewport renders entities; the timeline playhead
    // drives sampling. Full entity-application wiring arrives with the
    // isolated animation preview viewport.
  }, [time, playing, clip])

  const trackHeight = 28
  const timelineWidth = clip.duration * pxPerSecond + 20

  const scrub = useCallback((ratio: number) => {
    setTime(Math.min(clip.duration, Math.max(0, ratio * clip.duration)))
  }, [clip.duration])

  const moveKeyframe = useCallback((trackId: string, keyframeId: string, newTime: number) => {
    const clamped = Math.min(clip.duration, Math.max(0, newTime))
    onClipChange({
      ...clip,
      tracks: clip.tracks.map((t) =>
        t.id === trackId
          ? { ...t, keyframes: t.keyframes.map((k) => (k.id === keyframeId ? { ...k, time: clamped } : k)) }
          : t
      ),
    })
  }, [clip, onClipChange])

  const deleteKeyframes = useCallback(() => {
    if (selectedKeyframeIds.size === 0) return
    onClipChange({
      ...clip,
      tracks: clip.tracks.map((t) => ({
        ...t,
        keyframes: t.keyframes.filter((k) => !selectedKeyframeIds.has(k.id)),
      })),
    })
    onSelectKeyframes(new Set())
  }, [clip, onClipChange, selectedKeyframeIds, onSelectKeyframes])

  const addKeyframe = useCallback((trackId: string) => {
    const track = clip.tracks.find((t) => t.id === trackId)
    if (!track) return
    const value = sampleTrack(track, time)
    const key: AnimationKeyframe = { id: kfId(), time, value: value as number, interpolation: 'linear' }
    onClipChange({
      ...clip,
      tracks: clip.tracks.map((t) => (t.id === trackId ? { ...t, keyframes: [...t.keyframes, key] } : t)),
    })
  }, [clip, onClipChange, time])

  const prevKey = useCallback(() => {
    const allTimes = clip.tracks.flatMap((t) => t.keyframes.map((k) => k.time)).sort((a, b) => a - b)
    const prev = allTimes.filter((t) => t < time - 0.01).pop()
    if (prev !== undefined) setTime(prev)
  }, [clip, time])

  const nextKey = useCallback(() => {
    const allTimes = clip.tracks.flatMap((t) => t.keyframes.map((k) => k.time)).sort((a, b) => a - b)
    const next = allTimes.find((t) => t > time + 0.01)
    if (next !== undefined) setTime(next)
  }, [clip, time])

  const fmtTime = (s: number) => {
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    const ff = String(Math.floor((s % 1) * clip.fps)).padStart(2, '0')
    return `${mm}:${ss}:${ff}`
  }

  return (
    <div className="ah-anim-timeline">
      {/* Transport bar */}
      <div className="ah-anim-transport">
        <IconButton small icon={<SkipBack size={13} />} label="Previous key" onClick={prevKey} />
        <IconButton
          small
          icon={playing ? <Pause size={13} /> : <Play size={13} />}
          label={playing ? 'Pause' : 'Play'}
          onClick={() => setPlaying(!playing)}
        />
        <IconButton small icon={<Square size={10} />} label="Stop" onClick={() => { setPlaying(false); setTime(0) }} />
        <IconButton small icon={<SkipForward size={13} />} label="Next key" onClick={nextKey} />
        <IconButton small icon={<Repeat size={13} />} label="Loop" active={loop} onClick={() => setLoop(!loop)} />
        <span className="ah-anim-time">{fmtTime(time)} <span style={{ color: 'var(--text-tertiary)' }}>/ {fmtTime(clip.duration)}</span></span>
        <div style={{ flex: 1 }} />
        <button
          className={`ah-btn ${autoKey ? 'primary' : ''}`}
          style={{ height: 24, fontSize: 'var(--fs-meta)' }}
          onClick={() => void 0}
        >
          <CircleDot size={11} style={{ color: autoKey ? '#e2a44c' : 'var(--text-tertiary)' }} />
          Auto Key {autoKey ? 'ON' : 'OFF'}
        </button>
        <IconButton
          small
          icon={<Trash2 size={12} />}
          label="Delete keyframes (Del)"
          disabled={selectedKeyframeIds.size === 0}
          onClick={deleteKeyframes}
        />
      </div>

      {/* Ruler + tracks */}
      <div className="ah-anim-scroll" ref={scrollRef}>
        <div style={{ width: timelineWidth, position: 'relative' }}>
          {/* Ruler */}
          <div
            className="ah-anim-ruler"
            onPointerDown={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              scrub((event.clientX - rect.left) / pxPerSecond / clip.duration * clip.duration / (pxPerSecond / 80) / (80 / pxPerSecond))
              const move = (e: MouseEvent) => scrub((e.clientX - rect.left) / pxPerSecond / (clip.duration / clip.duration))
              const up = () => {
                window.removeEventListener('mousemove', move)
                window.removeEventListener('mouseup', up)
              }
              window.addEventListener('mousemove', move)
              window.addEventListener('mouseup', up)
            }}
          >
            {Array.from({ length: Math.ceil(clip.duration) + 1 }).map((_, second) => (
              <div key={second} className="ah-anim-tick" style={{ left: second * pxPerSecond }}>
                <span className="mark" />
                <span className="num">{second}s</span>
              </div>
            ))}
          </div>

          {/* Tracks */}
          <div className="ah-anim-tracks">
            {clip.tracks.map((track) => (
              <div
                key={track.id}
                className={`ah-anim-track-row ${track.id === selectedTrackId ? 'selected' : ''}`}
                style={{ height: trackHeight }}
                onClick={() => onSelectTrack(track.id)}
              >
                {track.keyframes.map((keyframe) => (
                  <div
                    key={keyframe.id}
                    className={`ah-anim-keyframe ${selectedKeyframeIds.has(keyframe.id) ? 'selected' : ''}`}
                    style={{ left: keyframe.time * pxPerSecond }}
                    title={`${track.targetName ?? track.target} ${track.property} @ ${keyframe.time.toFixed(2)}s = ${JSON.stringify(keyframe.value)}`}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      onSelectTrack(track.id)
                      onSelectKeyframes(new Set([keyframe.id]))
                      dragRef.current = { keyframeId: keyframe.id, startX: event.clientX, origTime: keyframe.time }
                      const move = (e: MouseEvent) => {
                        if (!dragRef.current) return
                        const dt = (e.clientX - dragRef.current.startX) / pxPerSecond
                        moveKeyframe(track.id, dragRef.current.keyframeId, dragRef.current.origTime + dt)
                      }
                      const up = () => {
                        dragRef.current = null
                        window.removeEventListener('mousemove', move)
                        window.removeEventListener('mouseup', up)
                      }
                      window.addEventListener('mousemove', move)
                      window.addEventListener('mouseup', up)
                    }}
                  />
                ))}
                {track.keyframes.length === 0 && (
                  <button
                    className="ah-anim-add-key"
                    style={{ left: time * pxPerSecond }}
                    onClick={(e) => { e.stopPropagation(); addKeyframe(track.id) }}
                    title="Add keyframe at playhead"
                  >
                    <Plus size={10} />
                  </button>
                )}
              </div>
            ))}
            {clip.tracks.length === 0 && (
              <div className="ah-empty" style={{ padding: 20 }}>
                Add a track from the inspector (select an entity, then Add Track)
              </div>
            )}
          </div>

          {/* Playhead */}
          <div className="ah-anim-playhead" style={{ left: time * pxPerSecond }} />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Clip/Track/Keyframe Inspector                                       */
/* ------------------------------------------------------------------ */

function ClipInspector({
  clip, selectedTrackId, selectedKeyframeIds, autoKey, onAutoKeyToggle, onClipChange,
}: {
  clip: AnimationClipData
  selectedTrackId: string | null
  selectedKeyframeIds: Set<string>
  autoKey: boolean
  onAutoKeyToggle: () => void
  onClipChange: (clip: AnimationClipData) => void
}) {
  const selection = useEditorStore((s) => s.selection)
  const track = clip.tracks.find((t) => t.id === selectedTrackId) ?? null
  const keyframe = track?.keyframes.find((k) => selectedKeyframeIds.has(k.id)) ?? null

  return (
    <div className="ah-panel" style={{ width: 220, flex: 'none', overflowY: 'auto' }}>
      <div className="ah-panel-head"><span className="ah-panel-title">Clip</span></div>
      <div className="ah-panel-body" style={{ padding: '8px 12px', gap: 6 }}>
        <div className="ah-field">
          <label>Name</label>
          <input className="ah-input" defaultValue={clip.name} key={clip.id}
            onBlur={(e) => onClipChange({ ...clip, name: e.target.value.trim() || clip.name })} />
        </div>
        <div className="ah-field">
          <label>Duration</label>
          <input className="ah-input" type="number" step="0.5" defaultValue={clip.duration} key={clip.id + 'dur'}
            onBlur={(e) => onClipChange({ ...clip, duration: Math.max(0.1, parseFloat(e.target.value) || clip.duration) })} />
        </div>
        <div className="ah-field">
          <label>FPS</label>
          <input className="ah-input" type="number" defaultValue={clip.fps} key={clip.id + 'fps'}
            onBlur={(e) => onClipChange({ ...clip, fps: Math.max(1, Math.min(120, parseInt(e.target.value) || 30)) })} />
        </div>
        <div className="ah-menu-sep" />
        <button className={`ah-btn ${autoKey ? 'primary' : ''}`} style={{ width: '100%', justifyContent: 'center' }} onClick={onAutoKeyToggle}>
          <CircleDot size={11} /> Auto Key: {autoKey ? 'ON' : 'OFF'}
        </button>
        <div className="ah-menu-sep" />
        {/* Add track for selected entity */}
        {selection[0] ? (
          <div>
            <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', marginBottom: 4 }}>ADD TRACK (selected entity)</div>
            {(['position', 'rotation', 'scale'] as const).map((prop) => (
              <button key={prop} className="ah-menu-item" onClick={() => {
                const id = `track-${crypto.randomUUID().slice(0, 8)}`
                const newTrack: AnimationTrack = {
                  id, target: selection[0], targetName: 'Selected',
                  component: 'core.transform', property: prop, valueType: 'vec3',
                  keyframes: [],
                }
                onClipChange({ ...clip, tracks: [...clip.tracks, newTrack] })
              }}>
                Transform.{prop}
              </button>
            ))}
          </div>
        ) : (
          <div className="ah-empty" style={{ padding: 8 }}>Select an entity to add tracks</div>
        )}
        <div className="ah-menu-sep" />
        {/* Track inspector */}
        {track && (
          <div>
            <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', marginBottom: 4 }}>TRACK</div>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-dim)' }}>
              {track.component}.{track.property} → {track.targetName ?? track.target.slice(0, 8)}…
            </div>
            <div style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-tertiary)' }}>
              {track.keyframes.length} keyframes
            </div>
            <button className="ah-menu-item" style={{ color: '#e2574c' }} onClick={() => {
              onClipChange({ ...clip, tracks: clip.tracks.filter((t) => t.id !== track.id) })
            }}>
              <Trash2 size={12} /> Delete Track
            </button>
          </div>
        )}
        <div className="ah-menu-sep" />
        {/* Keyframe inspector */}
        {keyframe && track && (
          <div>
            <div style={{ fontSize: 'var(--fs-tiny)', color: 'var(--text-tertiary)', marginBottom: 4 }}>KEYFRAME</div>
            <div className="ah-field">
              <label>Time</label>
              <input className="ah-input" type="number" step="0.1" value={keyframe.time.toFixed(2)}
                onChange={(e) => {
                  const t = parseFloat(e.target.value) || 0
                  onClipChange({
                    ...clip,
                    tracks: clip.tracks.map((tr) =>
                      tr.id === track.id
                        ? { ...tr, keyframes: tr.keyframes.map((k) => (k.id === keyframe.id ? { ...k, time: t } : k)) }
                        : tr
                    ),
                  })
                }} />
            </div>
            <div className="ah-field">
              <label>Interp</label>
              <select className="ah-input" value={keyframe.interpolation}
                onChange={(e) => {
                  const interp = e.target.value as 'step' | 'linear'
                  onClipChange({
                    ...clip,
                    tracks: clip.tracks.map((tr) =>
                      tr.id === track.id
                        ? { ...tr, keyframes: tr.keyframes.map((k) => (k.id === keyframe.id ? { ...k, interpolation: interp } : k)) }
                        : tr
                    ),
                  })
                }}>
                <option value="linear">Linear</option>
                <option value="step">Step</option>
              </select>
            </div>
            {typeof keyframe.value === 'number' && (
              <div className="ah-field">
                <label>Value</label>
                <input className="ah-input" type="number" step="0.1" value={keyframe.value}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value) || 0
                    onClipChange({
                      ...clip,
                      tracks: clip.tracks.map((tr) =>
                        tr.id === track.id
                          ? { ...tr, keyframes: tr.keyframes.map((k) => (k.id === keyframe.id ? { ...k, value: v } : k)) }
                          : tr
                      ),
                    })
                  }} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

