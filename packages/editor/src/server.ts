import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream } from 'node:fs'
import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { extname, isAbsolute, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The AHEngine editor dev server.
 *
 * Serves the packaged editor UI on its own port and exposes a tiny HTTP API
 * that reads/writes the host product's project file and game assets on disk.
 * Host app keeps running on its own port; the editor lives beside it.
 */

export interface EditorServerOptions {
  /** Port for the editor UI + API. */
  port: number
  /** Host product root (absolute). */
  root: string
  /** Project JSON path inside the product (absolute or root-relative). */
  projectFile: string
  /** Assets directory inside the product (absolute or root-relative). */
  assetsDir: string
  /** URL base under which assets are served on BOTH servers. Default `/game-assets`. */
  assetsUrlBase?: string
}

export interface EditorServerHandle {
  server: Server
  port: number
  url: string
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream',
  '.map': 'application/json',
  '.woff2': 'font/woff2',
}

function editorDistDir(): string {
  // dist/plugin/index.mjs → dist/editor
  return resolve(fileURLToPath(new URL('../editor', import.meta.url)))
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  response.end(payload)
}

async function readBody(request: IncomingMessage, limitBytes = 512 * 1024 * 1024): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of request) {
    total += (chunk as Buffer).byteLength
    if (total > limitBytes) throw new Error('payload too large')
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

function safeJoin(root: string, relative: string): string | null {
  const target = resolve(root, '.' + sep + relative)
  const normalizedRoot = resolve(root)
  if (target !== normalizedRoot && !target.startsWith(normalizedRoot + sep)) return null
  return target
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'asset'
  const cleaned = base.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'asset'
}

function uniquePath(dir: string, fileName: string): string {
  let candidate = join(dir, fileName)
  if (!existsSync(candidate)) return candidate
  const extension = extname(fileName)
  const stem = fileName.slice(0, fileName.length - extension.length)
  for (let index = 1; index < 500; index++) {
    candidate = join(dir, `${stem}-${index}${extension}`)
    if (!existsSync(candidate)) return candidate
  }
  return join(dir, `${Date.now()}-${fileName}`)
}

function serveFile(response: ServerResponse, filePath: string, fallbackType = 'application/octet-stream'): void {
  const type = MIME_TYPES[extname(filePath).toLowerCase()] ?? fallbackType
  const stat = statSync(filePath)
  response.writeHead(200, {
    'content-type': type,
    'content-length': stat.size,
    'cache-control': 'no-cache',
  })
  createReadStream(filePath).pipe(response)
}

/** Minimal valid starter project written into a fresh host product. */
export function starterProjectJson(): string {
  return JSON.stringify(
    {
      format: 'koota-3d-project',
      schemaVersion: 1,
      project: { id: 'project-product', name: 'Product Scene', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      scene: {
        format: 'koota-3d-scene',
        schemaVersion: 1,
        id: 'main',
        name: 'Main Scene',
        settings: {
          background: '#dfe3ea',
          environmentAssetId: null,
          environmentIntensity: 1,
          fog: { enabled: true, type: 'linear', color: '#dfe3ea', near: 22, far: 85, density: 0.02 },
          toneMapping: 'aces',
          toneMappingExposure: 1,
          shadowEnabled: true,
          defaultCameraId: 'product-camera',
        },
        entities: [
          {
            id: 'product-camera',
            name: 'Camera',
            enabled: true,
            parentId: null,
            components: {
              'core.transform': { position: [7, 4.5, 9], rotation: [-12, 38, 0], scale: [1, 1, 1] },
              'render.camera': { fov: 55, near: 0.1, far: 300 },
            },
          },
          {
            id: 'product-sun',
            name: 'Sun',
            enabled: true,
            parentId: null,
            components: {
              'core.transform': { position: [6, 9, 4], rotation: [-35, 25, 0], scale: [1, 1, 1] },
              'render.light': { type: 'directional', color: '#fff1d6', intensity: 2.4 },
            },
          },
          {
            id: 'product-ground',
            name: 'Ground',
            enabled: true,
            parentId: null,
            components: {
              'core.transform': { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              'render.mesh': { shape: 'plane', size: 30, segments: 1 },
            },
          },
          {
            id: 'product-cube',
            name: 'Cube',
            enabled: true,
            parentId: null,
            components: {
              'core.transform': { position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
              'render.mesh': { shape: 'box', size: 1, segments: 1 },
            },
          },
        ],
      },
      assets: [],
      materials: [],
      prefabs: [],
      animatorControllers: [],
    },
    null,
    2
  )
}

export function startEditorServer(options: EditorServerOptions): Promise<EditorServerHandle> {
  const assetsUrlBase = (options.assetsUrlBase ?? '/game-assets').replace(/\/+$/, '') || '/game-assets'
  const projectFile = isAbsolute(options.projectFile) ? options.projectFile : resolve(options.root, options.projectFile)
  const assetsDir = isAbsolute(options.assetsDir) ? options.assetsDir : resolve(options.root, options.assetsDir)
  mkdirSync(assetsDir, { recursive: true })

  const dist = editorDistDir()
  let indexHtml: string | null = null
  const getIndexHtml = (): string | null => {
    if (indexHtml) return indexHtml
    const path = join(dist, 'index.html')
    if (!existsSync(path)) return null
    const hostConfig = `<script>window.__AHENGINE_HOST__=${JSON.stringify({
      apiBase: '/api',
      projectFile: projectFile.split(sep).slice(-2).join('/'),
      assetsUrlBase,
    })}</script>`
    indexHtml = readFileSync(path, 'utf8').replace('<head>', `<head>${hostConfig}`)
    return indexHtml
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      if (!response.headersSent) sendJson(response, 500, { error: String(error) })
    })
  })

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const path = decodeURIComponent(url.pathname)

    /* ---------------- API ---------------- */

    if (path === '/api/project' && request.method === 'GET') {
      if (!existsSync(projectFile)) return sendJson(response, 404, { error: 'project file not created yet — save once from the editor' })
      return serveFile(response, projectFile)
    }

    if (path === '/api/project' && request.method === 'PUT') {
      const body = await readBody(request, 64 * 1024 * 1024)
      let parsed: unknown
      try {
        parsed = JSON.parse(body.toString('utf8'))
      } catch {
        return sendJson(response, 400, { error: 'invalid JSON' })
      }
      const envelope = parsed as { format?: string; schemaVersion?: number }
      if (envelope?.format !== 'koota-3d-project' || typeof envelope?.schemaVersion !== 'number') {
        return sendJson(response, 400, { error: 'not a koota-3d-project payload' })
      }
      mkdirSync(join(projectFile, '..'), { recursive: true })
      writeFileSync(projectFile, JSON.stringify(parsed, null, 2) + '\n', 'utf8')
      return sendJson(response, 200, { ok: true, bytes: body.byteLength })
    }

    if (path === '/api/asset' && request.method === 'POST') {
      const name = sanitizeFileName(url.searchParams.get('name') ?? 'asset.bin')
      const body = await readBody(request)
      const target = uniquePath(assetsDir, name)
      writeFileSync(target, body)
      const relative = target.slice(resolve(options.root).length + 1).split(sep).join('/')
      return sendJson(response, 200, { path: relative })
    }

    if (path === '/api/asset' && request.method === 'DELETE') {
      const requested = url.searchParams.get('path') ?? ''
      const target = safeJoin(options.root, requested)
      if (!target) return sendJson(response, 400, { error: 'invalid path' })
      if (!target.startsWith(assetsDir + sep)) return sendJson(response, 400, { error: 'path outside assets dir' })
      if (existsSync(target)) unlinkSync(target)
      return sendJson(response, 200, { ok: true })
    }

    /* ---------------- game assets (shared with the host middleware) ----- */

    if (path.startsWith(assetsUrlBase + '/')) {
      const relative = path.slice(assetsUrlBase.length + 1)
      const target = safeJoin(assetsDir, relative)
      if (!target || !existsSync(target) || !statSync(target).isFile()) {
        return sendJson(response, 404, { error: 'asset not found' })
      }
      return serveFile(response, target)
    }

    /* ---------------- editor UI ---------------- */

    if (path === '/' || path === '/index.html' || !path.includes('.')) {
      const html = getIndexHtml()
      if (!html) return sendJson(response, 500, { error: 'editor bundle missing — build @ahengine/editor first' })
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      return void response.end(html)
    }

    // Static editor bundle (built with base '/__ah/').
    const editorPath = path.startsWith('/__ah/') ? path.slice('/__ah/'.length) : null
    if (editorPath) {
      const target = safeJoin(dist, editorPath)
      if (target && existsSync(target) && statSync(target).isFile()) return serveFile(response, target)
      return sendJson(response, 404, { error: 'not found' })
    }

    sendJson(response, 404, { error: 'not found' })
  }

  return new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(options.port, () => {
      resolvePromise({ server, port: options.port, url: `http://localhost:${options.port}` })
    })
  })
}
