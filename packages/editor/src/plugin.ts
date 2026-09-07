import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { createReadStream, statSync, type Stats } from 'node:fs'
import type { Connect, Plugin } from 'vite'
import { starterProjectJson, startEditorServer } from './server.js'

/**
 * `ahengineEditor()` — install the AHEngine 3D editor into any Vite product.
 *
 * ```ts
 * // vite.config.ts of YOUR product
 * import { defineConfig } from 'vite'
 * import react from '@vitejs/plugin-react'
 * import { ahengineEditor } from '@ahengine/editor'
 *
 * export default defineConfig({
 *   plugins: [react(), ahengineEditor({ editorPort: 5000 })],
 * })
 * ```
 *
 * `npm run dev` then serves:
 *   - your product            → http://localhost:3000 (its own port)
 *   - the AHEngine editor     → http://localhost:5000
 *
 * Saving from the editor (Ctrl+S) writes the project JSON and game assets
 * into your product's source tree — Vite HMR picks the changes up live.
 */

export interface AhengineEditorOptions {
  /** Port for the editor UI + API. Default 5000. */
  editorPort?: number
  /** Project JSON inside the product. Default `src/game/game.koota-project.json`. */
  projectFile?: string
  /** Binary assets directory inside the product. Default `game-assets`. */
  assetsDir?: string
  /** URL base under which assets are served on both servers. Default `/game-assets`. */
  assetsUrlBase?: string
}

interface RunningEditor {
  url: string
}

const RUNNING_KEY = '__AHENGINE_EDITOR_SERVER__'

const MIME: Record<string, string> = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.hdr': 'application/octet-stream',
  '.exr': 'application/octet-stream',
}

function assetsMiddleware(assetsDir: string, assetsUrlBase: string): Connect.NextHandleFunction {
  // Mounted via `middlewares.use(base, fn)` — req.url has the prefix stripped.
  return (request, response, next) => {
    const url = request.url ?? '/'
    const clean = decodeURIComponent(url.split('?')[0]!).replace(/^\/+/, '')
    const target = resolve(assetsDir, '.' + '/' + clean)
    if (!target.startsWith(resolve(assetsDir))) {
      response.statusCode = 400
      response.end()
      return
    }
    let stat: Stats
    try {
      stat = statSync(target)
    } catch {
      // Missing asset: 404 instead of falling through to the SPA index.
      if (extname(clean)) {
        response.statusCode = 404
        response.end('asset not found')
        return
      }
      next()
      return
    }
    if (!stat.isFile()) {
      next()
      return
    }
    response.setHeader('content-type', MIME[extname(target).toLowerCase()] ?? 'application/octet-stream')
    response.setHeader('content-length', stat.size)
    createReadStream(target).pipe(response)
  }
}

export function ahengineEditor(options: AhengineEditorOptions = {}): Plugin {
  const editorPort = options.editorPort ?? 5000
  const projectFile = options.projectFile ?? 'src/game/game.koota-project.json'
  const assetsDir = options.assetsDir ?? 'game-assets'
  const assetsUrlBase = (options.assetsUrlBase ?? '/game-assets').replace(/\/+$/, '') || '/game-assets'

  let pluginName = 'ahengine-editor'

  return {
    name: pluginName,
    configureServer(server) {
      const root = server.config.root

      // 1. Ensure a starter project file exists so the product can import it.
      const absoluteProject = resolve(root, projectFile)
      if (!existsSync(absoluteProject)) {
        mkdirSync(join(absoluteProject, '..'), { recursive: true })
        writeFileSync(absoluteProject, starterProjectJson() + '\n', 'utf8')
        server.config.logger.info(`  [ahengine] created starter project ${projectFile}`)
      }
      mkdirSync(resolve(root, assetsDir), { recursive: true })

      // 2. Serve game assets on the product's own dev server too.
      server.middlewares.use(assetsUrlBase, assetsMiddleware(resolve(root, assetsDir), assetsUrlBase))

      // 3. Start the editor server (once per process — vite re-invokes plugins).
      const globalScope = globalThis as Record<string, unknown>
      const existing = globalScope[RUNNING_KEY] as RunningEditor | undefined
      if (existing) {
        server.config.logger.info(`  [ahengine] editor already running → ${existing.url}`)
        return
      }
      startEditorServer({
        port: editorPort,
        root,
        projectFile,
        assetsDir,
        assetsUrlBase,
      })
        .then((handle) => {
          globalScope[RUNNING_KEY] = { url: handle.url }
          server.config.logger.info(
            `\n  [ahengine] editor  →  ${handle.url}  (project: ${projectFile})\n`
          )
        })
        .catch((error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            const url = `http://localhost:${editorPort}`
            globalScope[RUNNING_KEY] = { url }
            server.config.logger.info(`\n  [ahengine] editor already in use → ${url}\n`)
          } else {
            server.config.logger.error(`  [ahengine] editor server failed: ${error.message}`)
          }
        })
    },
  }
}

export { starterProjectJson }
export default ahengineEditor
