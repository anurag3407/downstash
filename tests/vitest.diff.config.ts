import { defineConfig } from 'vitest/config';

// Differential suite: Downstash gateway vs Serverless-Redis-HTTP → Redis 7.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['differential/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000
  }
});
