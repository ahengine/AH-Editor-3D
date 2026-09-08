import { createPortal } from 'react-dom'
import { useEffect, useRef, useState, useCallback } from 'react'

export function useOutsideClick<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onOutside])
  return ref
}

export interface MenuItemSpec {
  label: string
  shortcut?: string
  icon?: React.ReactNode
  danger?: boolean
  disabled?: boolean
  onClick?: () => void
  separatorBefore?: boolean
  sectionLabel?: string
}

export function MenuList({ items, onDone }: { items: MenuItemSpec[]; onDone: () => void }) {
  return (
    <>
      {items.map((item, index) => (
        <div key={index}>
          {item.sectionLabel && <div className="ah-menu-label">{item.sectionLabel}</div>}
          {item.separatorBefore && <div className="ah-menu-sep" />}
          <button
            className={`ah-menu-item ${item.danger ? 'danger' : ''}`}
            disabled={item.disabled}
            onClick={() => {
              item.onClick?.()
              onDone()
            }}
          >
            {item.icon}
            <span>{item.label}</span>
            {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
          </button>
        </div>
      ))}
    </>
  )
}

/** Right-click context menu anchored at the pointer. */
export function useContextMenu() {
  const [state, setState] = useState<{ x: number; y: number; items: MenuItemSpec[] } | null>(null)
  const open = useCallback((event: React.MouseEvent, items: MenuItemSpec[]) => {
    event.preventDefault()
    event.stopPropagation()
    setState({ x: event.clientX, y: event.clientY, items })
  }, [])
  const close = useCallback(() => setState(null), [])
  // Portal to document.body: panels use backdrop-filter, which creates a
  // stacking context that would trap the menu below floating panels even
  // with a huge z-index. Rendering at body level escapes it entirely.
  const node = state
    ? createPortal(
        <div
          className="ah-context"
          style={{ position: 'fixed', left: state.x, top: state.y, zIndex: 9999 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <MenuList items={state.items} onDone={close} />
        </div>,
        document.body
      )
    : null
  return { open, close, node }
}

export const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
