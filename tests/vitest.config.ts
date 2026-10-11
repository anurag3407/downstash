import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.test.ts'],
    // SQL/compat/differential suites need live services; run them explicitly.
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
