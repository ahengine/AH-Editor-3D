import { useEffect } from 'react'
import { AlertTriangle, CircleAlert, ScanSearch, X } from 'lucide-react'
import { focusProblem, refreshProblems, useEditorStore } from '@ahengine/editor-core'

/**
 * Problems panel — the single validation surface for the whole project.
 * Anchored popover from the top bar alert chip; every row navigates to the
 * object that caused it via typed selection.
 */
export function ProblemsPanel() {
  const open = useEditorStore((s) => s.problemsOpen)
  const problems = useEditorStore((s) => s.problems)
  const setProblemsOpen = useEditorStore((s) => s.setProblemsOpen)
  const worldVersion = useEditorStore((s) => s.worldVersion)
  const assets = useEditorStore((s) => s.assets)
  const materials = useEditorStore((s) => s.materials)
  const prefabs = useEditorStore((s) => s.prefabs)
  const controllers = useEditorStore((s) => s.controllers)
  const animations = useEditorStore((s) => s.animations)
  const particleEffects = useEditorStore((s) => s.particleEffects)

  // Re-validate whenever any document data changes (and while the panel is open).
  useEffect(() => {
    refreshProblems()
  }, [worldVersion, assets, materials, prefabs, controllers, animations, particleEffects, open])

  if (!open) return null

  const errors = problems.filter((p) => p.severity === 'error').length
  const warnings = problems.length - errors

  return (
    <div className="ah-popover-backdrop" onMouseDown={() => setProblemsOpen(false)}>
      <div className="ah-problems" onMouseDown={(event) => event.stopPropagation()}>
        <div className="ah-problems-head">
          <ScanSearch size={14} />
          <span className="ah-problems-title">Problems</span>
          <span className="ah-problems-count">
            {errors > 0 && <span className="error">{errors} error{errors === 1 ? '' : 's'}</span>}
            {errors > 0 && warnings > 0 && ' · '}
            {warnings > 0 && <span className="warning">{warnings} warning{warnings === 1 ? '' : 's'}</span>}
            {problems.length === 0 && <span className="clean">No problems</span>}
          </span>
          <button
            className="ah-problems-refresh"
            title="Re-validate project"
            onClick={() => refreshProblems()}
          >
            Re-scan
          </button>
          <button className="ah-problems-close" onClick={() => setProblemsOpen(false)}>
            <X size={13} />
          </button>
        </div>
        <div className="ah-problems-list">
          {problems.length === 0 && (
            <div className="ah-problems-empty">
              <CircleAlert size={18} />
              <div>Project validates clean — all references resolve.</div>
            </div>
          )}
          {problems.map((problem) => (
            <button
              key={problem.id}
              className={`ah-problem-row ${problem.severity}`}
              onClick={() => {
                focusProblem(problem)
                setProblemsOpen(false)
              }}
            >
              {problem.severity === 'error' ? (
                <CircleAlert size={13} className="icon-error" />
              ) : (
                <AlertTriangle size={13} className="icon-warning" />
              )}
              <span className="ah-problem-doc">{problem.doc}</span>
              <span className="ah-problem-message">{problem.message}</span>
              {problem.target && <span className="ah-problem-goto">Open →</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Top-bar chip: click to open the problems panel. */
export function ProblemsChip() {
  const problems = useEditorStore((s) => s.problems)
  const open = useEditorStore((s) => s.problemsOpen)
  const setProblemsOpen = useEditorStore((s) => s.setProblemsOpen)
  const errors = problems.filter((p) => p.severity === 'error').length

  return (
    <button
      className={`ah-topbar-chip problems ${open ? 'open' : ''} ${errors > 0 ? 'has-errors' : problems.length > 0 ? 'has-warnings' : ''}`}
      title={`Problems — ${problems.length === 0 ? 'none' : `${errors} error(s), ${problems.length - errors} warning(s)`}`}
      onClick={() => setProblemsOpen(!open)}
    >
      <CircleAlert size={13} />
      {problems.length > 0 ? `${errors > 0 ? errors : problems.length}` : ''}
    </button>
  )
}
