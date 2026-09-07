import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.d.ts', '**/public/**'],
  },
  ...tseslint.configs.recommended.map((entry) => ({
    ...entry,
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}', 'apps/*/scripts/**/*.ts', 'tests/**/*.ts'],
  })),
  {
    files: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}', 'apps/*/scripts/**/*.ts', 'tests/**/*.ts'],
    rules: {
      // The codebase intentionally narrows a few external (three/koota) edges
      // with targeted casts; keep them audible but not blocking.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  }
)
