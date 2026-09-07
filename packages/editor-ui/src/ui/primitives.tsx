import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'

/**
 * Reusable editor primitives — the only place UI atoms are styled.
 * Panels compose these; they never re-style from scratch.
 */

export interface TreeItemProps {
  depth: number
  selected?: boolean
  enabled?: boolean
  dropInside?: boolean
  icon?: ReactNode
  caret?: ReactNode
  name: string
  renaming?: boolean
  onRename?: (name: string) => void
  onRenameCancel?: () => void
  onClick?: (event: React.MouseEvent) => void
  onDoubleClick?: () => void
  onContextMenu?: (event: React.MouseEvent) => void
  onToggleExpand?: () => void
  trailing?: ReactNode
  draggable?: boolean
  onDragStart?: (event: React.DragEvent) => void
  onDragOver?: (event: React.DragEvent) => void
  onDragLeave?: () => void
  onDrop?: (event: React.DragEvent) => void
}

/** Compact 28px hierarchy row with 17px-per-level indentation. */
export function TreeItem(props: TreeItemProps) {
  return (
    <div
      className={[
        'ah-tree-row',
        props.selected ? 'selected' : '',
        props.enabled === false ? 'disabled-entity' : '',
        props.dropInside ? 'drop-inside' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ paddingLeft: 6 + props.depth * 17 }}
      onClick={props.onClick}
      onDoubleClick={props.onDoubleClick}
      onContextMenu={props.onContextMenu}
      draggable={props.draggable}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
    >
      {props.caret !== undefined ? (
        <span className="ah-tree-caret" onClick={(event) => { event.stopPropagation(); props.onToggleExpand?.() }}>
          {props.caret}
        </span>
      ) : (
        <span style={{ width: 16, flex: 'none' }} />
      )}
      <span className="ah-tree-icon">{props.icon}</span>
      {props.renaming ? (
        <input
          autoFocus
          defaultValue={props.name}
          onBlur={(event) => props.onRename?.(event.target.value.trim() || props.name)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
            if (event.key === 'Escape') props.onRenameCancel?.()
          }}
        />
      ) : (
        <span className="ah-tree-name">{props.name}</span>
      )}
      {props.trailing}
    </div>
  )
}

export function EditorPanel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={`ah-panel ${className ?? ''}`}>{children}</div>
}

export function ToolbarGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ah-toolbar-group ${className ?? ''}`}>{children}</div>
}

export function IconButton({
  icon,
  label,
  active,
  disabled,
  small,
  onClick,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  disabled?: boolean
  small?: boolean
  onClick?: (event: React.MouseEvent) => void
}) {
  return (
    <button
      className={`ah-icon-btn ${active ? 'active' : ''} ${small ? 'small' : ''}`}
      data-tip={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
    </button>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'default',
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (value: T) => void
  size?: 'default' | 'top'
}) {
  return (
    <div className={`ah-segment ${size === 'top' ? 'top' : ''}`}>
      {options.map((option) => (
        <button
          key={option.value}
          className={value === option.value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function SearchInput({
  placeholder,
  value,
  onChange,
  shortcut,
  id,
}: {
  placeholder: string
  value: string
  onChange: (value: string) => void
  shortcut?: string
  id?: string
}) {
  return (
    <div className="ah-search">
      <Search size={13} />
      <input id={id} placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      {shortcut && <kbd>{shortcut}</kbd>}
    </div>
  )
}

/** Compact number input with a colored axis prefix. */
export function NumberInput({
  axis,
  axisClass,
  value,
  step = 0.1,
  onCommit,
  onLiveNudge,
}: {
  axis: string
  axisClass?: string
  value: number
  step?: number
  onCommit: (value: number) => void
  onLiveNudge?: (value: number) => void
}) {
  const [text, setText] = useState(value.toFixed(2))
  useEffect(() => setText(value.toFixed(2)), [value])
  const commit = (next: string) => {
    const parsed = parseFloat(next)
    if (!Number.isNaN(parsed)) onCommit(parsed)
  }
  return (
    <div className={`ah-num ${axisClass ?? ''}`}>
      <span className="ah-num-axis">{axis}</span>
      <input
        type="number"
        step={step}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => commit(text)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault()
            const delta = step * (event.key === 'ArrowUp' ? 1 : -1)
            const next = (parseFloat(text) || 0) + delta
            setText(next.toFixed(2))
            onLiveNudge?.(next)
          }
        }}
      />
    </div>
  )
}

/** Custom slider — 4px track, 11px thumb, no browser default chrome. */
export function EditorSlider({
  value,
  min,
  max,
  step = 0.01,
  onLiveChange,
  onCommit,
}: {
  value: number
  min: number
  max: number
  step?: number
  onLiveChange?: (value: number) => void
  onCommit: (value: number) => void
}) {
  const [local, setLocal] = useState<number | null>(null)
  const shown = local ?? value
  const fill = ((shown - min) / (max - min)) * 100
  const pointerLock = useRef(false)

  const valueAt = (clientX: number, element: HTMLElement) => {
    const rect = element.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const raw = min + ratio * (max - min)
    return Math.round(raw / step) * step
  }

  return (
    <div
      className="ah-slider"
      style={{ ['--fill' as string]: `${fill}%` }}
      onPointerDown={(event) => {
        pointerLock.current = true
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        const next = valueAt(event.clientX, event.currentTarget as HTMLElement)
        setLocal(next)
        onLiveChange?.(next)
      }}
      onPointerMove={(event) => {
        if (!pointerLock.current) return
        const next = valueAt(event.clientX, event.currentTarget as HTMLElement)
        setLocal(next)
        onLiveChange?.(next)
      }}
      onPointerUp={(event) => {
        pointerLock.current = false
        const next = valueAt(event.clientX, event.currentTarget as HTMLElement)
        setLocal(null)
        onCommit(next)
      }}
    >
      <div className="track">
        <div className="fill" />
        <div className="thumb" />
      </div>
    </div>
  )
}

/** Inspector card with collapse. `defaultOpen` seeds the first render only. */
export function InspectorSection({
  title,
  children,
  open,
  onToggle,
  actions,
  fixed,
}: {
  title: string
  children?: ReactNode
  open?: boolean
  onToggle?: () => void
  actions?: ReactNode
  fixed?: boolean
}) {
  const [internalOpen, setInternalOpen] = useState(true)
  const isOpen = open ?? internalOpen
  const toggle = () => (onToggle ? onToggle() : setInternalOpen(!internalOpen))
  return (
    <div className={`ah-section ${isOpen ? '' : 'collapsed'}`}>
      <div className="ah-section-head" onClick={toggle}>
        <span className="title">{title}</span>
        {actions}
        <span className="chev">{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </div>
      {isOpen && !fixed && <div className="ah-section-body">{children}</div>}
    </div>
  )
}

export function AssetField({
  name,
  placeholder,
  icon,
  onClick,
}: {
  name: string | null
  placeholder?: string
  icon?: ReactNode
  onClick?: () => void
}) {
  return (
    <button className="ah-asset-field" onClick={onClick}>
      {icon}
      {name ? (
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', color: 'var(--text-primary)' }}>{name}</span>
      ) : (
        <span style={{ color: 'var(--text-tertiary)' }}>{placeholder ?? '— none —'}</span>
      )}
      <ChevronDown size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
    </button>
  )
}

/** Timeline track row (30px) hosting clips/keyframes. */
export function TimelineTrack({ children }: { children?: ReactNode }) {
  return <div className="ah-tl-track">{children}</div>
}

/** Timeline clip block (24px tall, reference color palette). */
export function TimelineClip({
  color,
  label,
  left = 0,
  width,
  title,
  onClick,
}: {
  color: 'blue' | 'violet' | 'green'
  label: string
  left?: number
  width: number
  title?: string
  onClick?: () => void
}) {
  return (
    <div
      className={`ah-tl-clip ${color}`}
      style={{ left, width }}
      onClick={onClick}
      title={title}
    >
      {label}
      <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{title?.split('·')[1]?.trim() ?? ''}</span>
    </div>
  )
}

export { ChevronDown, ChevronRight }
