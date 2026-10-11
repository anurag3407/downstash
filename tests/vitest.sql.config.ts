import { defineConfig } from 'vitest/config';

// SQL engine suite: runs against a live local Supabase DB. SQL tests share a
// database, so run files serially (fileParallelism: false) to avoid flakes.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['sql/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000
  }
});
