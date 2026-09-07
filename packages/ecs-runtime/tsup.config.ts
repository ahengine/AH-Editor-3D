import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', react: 'src/react/index.ts' },
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  dts: true,
  sourcemap: true,
  clean: true,
  tsconfig: 'tsconfig.build.json',
  // peers stay external; @ahengine/project-schema is bundled so the tarball
  // is self-contained before it is published to a registry.
  external: [
    'zod',
    'koota',
    'react',
    '@react-three/fiber',
    'three',
    /^three\/.*$/,
  ],
})
