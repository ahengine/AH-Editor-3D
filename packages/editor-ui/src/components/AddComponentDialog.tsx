import { useEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { addableDefs } from '@ahengine/ecs-runtime'
import { addComponentToSelection } from '@ahengine/editor-core'

/** Searchable Add Component popup — content generated from the registry. */
export function AddComponentDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [focusIndex, setFocusIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  const defs = useMemo(() => {
    const all = [...addableDefs()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name))
    if (!query) return all
    return all.filter(
      (def) =>
        def.name.toLowerCase().includes(query.toLowerCase()) ||
        def.id.toLowerCase().includes(query.toLowerCase()) ||
        def.category.toLowerCase().includes(query.toLowerCase())
    )
  }, [query])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setFocusIndex((index) => Math.min(index + 1, defs.length - 1))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setFocusIndex((index) => Math.max(index - 1, 0))
      }
      if (event.key === 'Enter' && defs[focusIndex]) {
        addComponentToSelection(defs[focusIndex].id)
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [defs, focusIndex, onClose])

  useEffect(() => {
    listRef.current?.querySelector(`[data-index='${focusIndex}']`)?.scrollIntoView({ block: 'nearest' })
  }, [focusIndex])

  return (
    <div className="ah-modal-backdrop" onMouseDown={onClose}>
      <div className="ah-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="ah-modal-header">
          <Search size={14} />
          Add Component
        </div>
        <div className="ah-modal-body" style={{ padding: 8 }} ref={listRef}>
          <div className="ah-search" style={{ marginBottom: 6 }}>
            <Search size={12} />
            <input
              autoFocus
              placeholder="Search components…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setFocusIndex(0)
              }}
            />
          </div>
          {defs.map((def, index) => (
            <div
              key={def.id}
              data-index={index}
              className={`ah-ac-item ${index === focusIndex ? 'focused' : ''}`}
              onMouseEnter={() => setFocusIndex(index)}
              onClick={() => {
                addComponentToSelection(def.id)
                onClose()
              }}
            >
              <span style={{ fontWeight: 600 }}>{def.name}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: 10.5 }}>{def.id}</span>
              <span className="cat">{def.category}</span>
            </div>
          ))}
          {defs.length === 0 && <div className="ah-empty">No matching components</div>}
        </div>
      </div>
    </div>
  )
}
