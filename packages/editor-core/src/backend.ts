import type { ProjectData } from '@ahengine/project-schema'
import { idbDeleteBlob, idbGetBlob, idbGetProject, idbPutBlob, idbPutProject } from './idb.js'

/**
 * Project storage backend.
 *
 * - Standalone mode (`npm run dev` inside the editor workspace): the browser's
 *   IndexedDB keeps the project JSON and binary asset blobs.
 * - Host mode (editor served by the `@ahengine/editor` vite plugin): the
 *   project lives in the host product's source tree; save/load/import go
 *   through the plugin's HTTP API and write real files to disk.
 */

export interface HostConfig {
  apiBase: string
  /** Project file path inside the host product (display only). */
  projectFile: string
  /** URL base where game assets are served, e.g. `/game-assets`. */
  assetsUrlBase: string
}

declare global {
  interface Window {
    __AHENGINE_HOST__?: HostConfig
  }
}

/** Injected by the @ahengine/editor dev server; null in standalone mode. */
export function getHostConfig(): HostConfig | null {
  if (typeof window === 'undefined') return null
  return window.__AHENGINE_HOST__ ?? null
}

export interface ProjectBackend {
  readonly mode: 'standalone' | 'host'
  load(): Promise<ProjectData | null>
  save(data: ProjectData): Promise<void>
  /** Stores a binary asset and returns its infrastructure-agnostic uri. */
  importAsset(file: File): Promise<string>
  deleteAsset(uri: string): Promise<void>
}

/* ------------------------------------------------------------------ */
/* Standalone: IndexedDB                                               */
/* ------------------------------------------------------------------ */

export class IndexedDbBackend implements ProjectBackend {
  readonly mode = 'standalone' as const

  async load(): Promise<ProjectData | null> {
    const saved = await idbGetProject<ProjectData>('active')
    return saved ?? null
  }

  async save(data: ProjectData): Promise<void> {
    await idbPutProject('active', data)
  }

  async importAsset(file: File): Promise<string> {
    const id = `asset-${crypto.randomUUID()}`
    await idbPutBlob(id, file)
    return `idb://${id}`
  }

  async deleteAsset(uri: string): Promise<void> {
    if (uri.startsWith('idb://')) await idbDeleteBlob(uri.slice('idb://'.length))
  }
}

/* ------------------------------------------------------------------ */
/* Host: HTTP API of the vite plugin server                            */
/* ------------------------------------------------------------------ */

export class HttpHostBackend implements ProjectBackend {
  readonly mode = 'host' as const

  constructor(private readonly config: HostConfig) {}

  async load(): Promise<ProjectData | null> {
    const response = await fetch(`${this.config.apiBase}/project`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`host project load failed: HTTP ${response.status}`)
    return (await response.json()) as ProjectData
  }

  async save(data: ProjectData): Promise<void> {
    const response = await fetch(`${this.config.apiBase}/project`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data, null, 2),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`host project save failed: HTTP ${response.status} ${detail.slice(0, 200)}`)
    }
  }

  async importAsset(file: File): Promise<string> {
    const response = await fetch(
      `${this.config.apiBase}/asset?name=${encodeURIComponent(file.name)}`,
      { method: 'POST', body: file }
    )
    if (!response.ok) throw new Error(`asset upload failed: HTTP ${response.status}`)
    const payload = (await response.json()) as { path: string }
    return payload.path
  }

  async deleteAsset(uri: string): Promise<void> {
    await fetch(`${this.config.apiBase}/asset?path=${encodeURIComponent(uri)}`, {
      method: 'DELETE',
    }).catch(() => undefined)
  }
}

/** The active backend, chosen by the presence of the injected host config. */
export const projectBackend: ProjectBackend = getHostConfig()
  ? new HttpHostBackend(getHostConfig()!)
  : new IndexedDbBackend()
