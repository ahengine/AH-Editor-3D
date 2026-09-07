import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Builds the packaged editor UI (the app served by the vite plugin's dev
 * server) into dist/editor with base '/__ah/'.
 */
export default defineConfig({
  root: 'editor',
  plugins: [react(), tailwindcss()],
  base: '/__ah/',
  build: {
    outDir: '../dist/editor',
    emptyOutDir: true,
    target: 'es2022',
  },
})
