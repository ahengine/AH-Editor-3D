import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { ahengineEditor } from '@ahengine/editor'

/**
 * A real product embedding the AHEngine editor via `npm i`:
 *   - this app     → http://localhost:3000
 *   - the editor   → http://localhost:5000  (Ctrl+S writes into src/game/)
 */
export default defineConfig({
  plugins: [
    react(),
    ahengineEditor({
      editorPort: 5000,
      projectFile: 'src/game/game.koota-project.json',
      assetsDir: 'game-assets',
    }),
  ],
})
