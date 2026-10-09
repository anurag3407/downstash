/**
 * @file packages/client/tsup.config.ts
 */

import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  // Bundle @downstash/protocol into the client (no runtime deps).
  noExternal: ['@downstash/protocol']
});
