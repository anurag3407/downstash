import { defineConfig } from 'vitest/config';

// Root vitest config. Package-level projects inherit these defaults.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,mts,cts,js,mjs}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.wrangler/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['packages/*/src/**/*.ts', 'apps/*/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/index.ts'],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    }
  }
});
