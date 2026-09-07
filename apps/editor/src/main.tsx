import React from 'react'
import ReactDOM from 'react-dom/client'
import '@ahengine/editor-ui/styles.css'
import { EditorApp } from '@ahengine/editor-ui'
import { EntityMeta } from '@ahengine/ecs-runtime'
import { useEditorStore } from '@ahengine/editor-core'

// Temporary debug bridge for browser-side verification.
declare global {
  interface Window {
    __ahDebug: () => unknown
  }
}
window.__ahDebug = () => {
  const state = useEditorStore.getState()
  const metas = state.world.query(EntityMeta).map((entity: unknown) => {
    const e = entity as { get: (t: unknown) => { uuid: string; name: string } | undefined }
    return e.get(EntityMeta)?.name
  })
  return { backend: state.backend, worldVersion: state.worldVersion, entities: metas }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <EditorApp />
  </React.StrictMode>
)
