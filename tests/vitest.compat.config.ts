/**
 * @file tests/vitest.compat.config.ts
 * Compatibility suite: @upstash/* clients against the local gateway.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['compat/**/*.test.ts'],
    globalSetup: ['helpers/setup-stack.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000
  }
});
