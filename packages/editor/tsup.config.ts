import { defineConfig } from 'tsup'

/** Builds the vite plugin + editor server (node side) into dist/plugin. */
export default defineConfig({
  entry: ['src/plugin.ts'],
  format: ['esm'],
  target: 'node18',
  platform: 'node',
  outDir: 'dist/plugin',
  dts: true,
  sourcemap: true,
  clean: true,
  tsconfig: 'tsconfig.build.json',
  external: ['vite'],
})
