import React from 'react'
import ReactDOM from 'react-dom/client'
import '@ahengine/editor-ui/styles.css'
import { EditorApp } from '@ahengine/editor-ui'
import { EntityMeta } from '@ahengine/ecs-runtime'
import { useEditorStore } from '@ahengine/editor-core'

// Browser-side debug bridge (verification + support tooling).
declare global {
  interface Window {
    __ahDebug: () => unknown
  }
}
window.__ahDebug = () => {
  const state = useEditorStore.getState()
  const metas = state.world.query(EntityMeta).map((entity) => entity.get(EntityMeta)?.name)
  return {
    backend: state.backend,
    worldVersion: state.worldVersion,
    host: (window).__AHENGINE_HOST__ ?? null,
    entities: metas,
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EditorApp />
  </React.StrictMode>
)
