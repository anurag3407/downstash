import { defineConfig } from 'vitest/config';

// Compatibility suite: @upstash/* clients against the local gateway.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['compat/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000
  }
});
