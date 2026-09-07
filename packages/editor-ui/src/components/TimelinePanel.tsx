import { useEffect, useMemo, useRef, useState } from 'react'
import type { Entity } from 'koota'
import {
  ChevronLast,
  ChevronFirst,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Maximize2,
  Repeat,
} from 'lucide-react'
import type { AnimatorController } from '@ahengine/project-schema'
import {
  Animator as AnimatorTrait,
  EntityMeta,
  ModelRenderer,
  modelAnimationRegistry,
} from '@ahengine/ecs-runtime'
import { animator, useEditorStore } from '@ahengine/editor-core'
import { IconButton, SegmentedControl, TimelineClip, TimelineTrack } from '../ui/primitives.js'
import { AnimatorPanel } from './AnimatorPanel.js'

/**
 * Timeline (246px default) — exists ONLY beneath the viewport.
 * Header: tabs + real time display + transport + view controls.
 * Body: 150px track tree + ruler + real clip blocks from the entity's
 * animator controller and model clips; scrubbing drives the animator.
 */

interface ClipRow {
  id: string
  label: string
  track: 'animator' | 'clips'
  color: 'blue' | 'violet' | 'green'
  clipName: string | null
  duration: number
}

export function TimelinePanel() {
  const timelineTab = useEditorStore((s) => s.timelineTab)
  const store = useEditorStore.getState

  return (
    <div className="ah-panel">
      {timelineTab === 'timeline' ? (
        <TimelineBody
          tabs={
            <SegmentedControl
              value={timelineTab}
              onChange={(tab) => store().setTimelineTab(tab)}
              options={[
                { value: 'timeline', label: 'Timeline' },
                { value: 'controller', label: 'Controller' },
              ]}
            />
          }
        />
      ) : (
        <>
          <div className="ah-tl-toprow">
            <SegmentedControl
              value={timelineTab}
              onChange={(tab) => store().setTimelineTab(tab)}
              options={[
                { value: 'timeline', label: 'Timeline' },
                { value: 'controller', label: 'Controller' },
              ]}
            />
            <div className="ah-tl-center" />
          </div>
          <ControllerBody />
        </>
      )}
    </div>
  )
}

function ControllerBody() {
  return (
    <div className="ah-controller-body">
      <AnimatorPanel hideTimeline />
    </div>
  )
}

function TimelineBody({ tabs }: { tabs: React.ReactNode }) {
  const world = useEditorStore((s) => s.world)
  const selection = useEditorStore((s) => s.selection)
  const controllers = useEditorStore((s) => s.controllers)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [loop, setLoop] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [pxPerSecond, setPxPerSecond] = useState(60)
  const rafRef = useRef(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  const previewEntity: Entity | undefined = useMemo(() => {
    if (selection[0]) {
      const entity = [...world.query(EntityMeta)].find((e) => e.get(EntityMeta)?.uuid === selection[0])
      if (entity && (entity.has(AnimatorTrait) || entity.has(ModelRenderer))) return entity
    }
    return world.query(AnimatorTrait)[0] ?? world.query(ModelRenderer)[0]
  }, [world, selection])

  const controller: AnimatorController | null = useMemo(() => {
    if (!previewEntity) return null
    const animatorTrait = previewEntity.get(AnimatorTrait)
    return controllers.find((c) => c.id === animatorTrait?.controllerId) ?? null
  }, [previewEntity, controllers])

  const modelAssetId = previewEntity?.get(ModelRenderer)?.assetId ?? ''
  const clips = useMemo(() => (modelAssetId ? modelAnimationRegistry.get(modelAssetId) ?? [] : []), [modelAssetId])

  const rows = useMemo<ClipRow[]>(() => {
    const out: ClipRow[] = []
    if (controller) {
      for (const state of controller.states) {
        const clip = clips.find((c) => c.name === state.clip)
        out.push({
          id: state.id,
          label: state.name,
          track: 'animator',
          color: 'blue',
          clipName: state.clip,
          duration: clip?.duration ?? 0,
        })
      }
    }
    let toggle = 0
    for (const clip of clips) {
      out.push({
        id: `clip-${clip.name}`,
        label: clip.name,
        track: 'clips',
        color: toggle % 2 === 0 ? 'violet' : 'green',
        clipName: clip.name,
        duration: clip.duration,
      })
      toggle++
    }
    return out
  }, [controller, clips])

  const activeClip = useMemo(() => {
    if (!previewEntity) return null
    const state = animator.getStateFor(previewEntity)
    const clipName = controller?.states.find((s) => s.id === state?.currentStateId)?.clip
    return clips.find((c) => c.name === clipName) ?? clips[0] ?? null
  }, [previewEntity, controller, clips, playing, time])

  const duration = activeClip?.duration ?? 0
  const totalDuration = Math.max(duration, ...rows.map((row) => row.duration), 1)

  // Playback ticker.
  useEffect(() => {
    if (!playing || !previewEntity || !activeClip) return
    let last = performance.now()
    const tick = (now: number) => {
      const delta = ((now - last) / 1000) * speed
      last = now
      setTime((prev) => (prev + delta >= activeClip.duration ? (loop ? 0 : activeClip.duration) : prev + delta))
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, previewEntity, activeClip, speed, loop])

  useEffect(() => () => previewEntity && animator.stop(previewEntity), [previewEntity])

  const playClip = (clipName: string | null) => {
    if (!previewEntity || !controller) return
    animator.play(previewEntity, controller, clipName ?? '', loop, speed)
    setTime(0)
    setPlaying(true)
  }

  const stepClip = (direction: 1 | -1) => {
    if (clips.length === 0 || !activeClip) return
    const index = clips.findIndex((c) => c.name === activeClip.name)
    const next = clips[(index + direction + clips.length) % clips.length]
    playClip(next.name)
  }

  const scrub = (ratio: number) => {
    const next = Math.min(1, Math.max(0, ratio)) * duration
    setTime(next)
    if (previewEntity && activeClip) animator.scrub(previewEntity, activeClip.name, next)
  }

  const entityName = previewEntity?.get(EntityMeta)?.name ?? 'no animated entity'
  const timelineWidth = Math.max(totalDuration * pxPerSecond + 8, 100)

  const fmt = (seconds: number) => {
    const s = Math.max(0, seconds)
    const mm = String(Math.floor(s / 60)).padStart(2, '0')
    const ss = String(Math.floor(s % 60)).padStart(2, '0')
    const ff = String(Math.floor((s % 1) * 60)).padStart(2, '0')
    return `${mm}:${ss}:${ff}`
  }

  return (
    <>
      <div className="ah-tl-toprow">
        {tabs}
        <div className="ah-tl-center">
          <span className="ah-tl-time">
            {fmt(time)} <span className="dim">/ {fmt(duration)}</span>
          </span>
          <div className="ah-tl-transport">
            <IconButton small icon={<ChevronFirst size={13} />} label="First clip" onClick={() => clips[0] && playClip(clips[0].name)} />
            <IconButton small icon={<SkipBack size={13} />} label="-1s" onClick={() => scrub((time - 1) / duration)} />
            <IconButton
              small
              icon={playing ? <Pause size={13} /> : <Play size={13} />}
              label={playing ? 'Pause' : 'Play'}
              onClick={() => {
                if (playing) {
                  animator.pause(previewEntity)
                  setPlaying(false)
                } else if (previewEntity && controller) {
                  animator.play(previewEntity, controller, activeClip?.name ?? '', loop, speed)
                  setPlaying(true)
                }
              }}
            />
            <IconButton small icon={<SkipForward size={13} />} label="+1s" onClick={() => scrub((time + 1) / duration)} />
            <IconButton small icon={<ChevronLast size={13} />} label="Last clip" onClick={() => clips.length > 0 && playClip(clips[clips.length - 1].name)} />
          </div>
        </div>
        <div className="ah-tl-right">
          <select
            className="ah-input"
            style={{ width: 48, height: 24 }}
            value={String(speed)}
            onChange={(event) => {
              const next = parseFloat(event.target.value) || 1
              setSpeed(next)
              if (previewEntity && playing) animator.resume(previewEntity, next)
            }}
          >
            {[0.25, 0.5, 1, 2].map((value) => (
              <option key={value} value={value}>
                {value}×
              </option>
            ))}
          </select>
          <IconButton small icon={<Repeat size={13} />} label="Loop" active={loop} onClick={() => setLoop(!loop)} />
          <IconButton
            small
            icon={<Maximize2 size={13} />}
            label="Fit"
            onClick={() => {
              const width = scrollRef.current?.clientWidth ?? 600
              setPxPerSecond(Math.max(8, (width - 160 - 24) / totalDuration))
            }}
          />
        </div>
      </div>

      <div className="ah-tl-body">
        {/* track tree */}
        <div className="ah-tl-tree">
          <div className="ah-tl-tree-head">{entityName}</div>
          {rows.map((row) => (
            <div key={row.id} className={`ah-tl-tree-row ${row.track}`}>
              <span className="swatch" data-color={row.color} />
              {row.label}
            </div>
          ))}
          {rows.length === 0 && <div className="ah-empty" style={{ padding: 12 }}>Import a GLB with animations</div>}
        </div>
        {/* ruler + tracks */}
        <div className="ah-tl-scroll" ref={scrollRef}>
          <div style={{ width: timelineWidth, position: 'relative' }}>
            <div
              className="ah-tl-ruler"
              onPointerDown={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                const ratioAt = (clientX: number) => (clientX - rect.left) / pxPerSecond / Math.max(duration, 0.001)
                scrub(ratioAt(event.clientX))
                const move = (e: MouseEvent) => scrub(ratioAt(e.clientX))
                const up = () => {
                  window.removeEventListener('mousemove', move)
                  window.removeEventListener('mouseup', up)
                }
                window.addEventListener('mousemove', move)
                window.addEventListener('mouseup', up)
              }}
            >
              {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, second) => (
                <div key={second} className="ah-tl-tick" style={{ left: second * pxPerSecond }}>
                  <span className="mark" />
                  <span className="num">{second}s</span>
                </div>
              ))}
            </div>
            <div className="ah-tl-tracks">
              {rows.map((row) => (
                <TimelineTrack key={row.id}>
                  {row.duration > 0 ? (
                    <TimelineClip
                      color={row.color}
                      label={row.label}
                      width={Math.max(row.duration * pxPerSecond, 24)}
                      title={`${row.label} · ${row.duration.toFixed(1)}s`}
                      onClick={() => playClip(row.clipName)}
                    />
                  ) : (
                    <span className="ah-tl-noclip">no clip</span>
                  )}
                </TimelineTrack>
              ))}
              <div className="ah-tl-playhead" style={{ left: time * pxPerSecond }} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
