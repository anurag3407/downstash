/**
 * @file tests/vitest.diff.config.ts
 * Differential suite: Downstash gateway vs Serverless-Redis-HTTP → Redis 7.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['differential/**/*.test.ts'],
    globalSetup: ['helpers/setup-stack.ts'],
    testTimeout: 60_000,
    hookTimeout: 120_000
  }
});
