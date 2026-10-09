/**
 * @file apps/gateway/src/routes/health.ts
 * GET/HEAD /health. Reports ok when storage responds.
 */
import { Hono } from 'hono';
import type { Storage } from '../storage/storage.ts';

export function registerHealthRoutes(
  app: Hono,
  opts: { storage: Storage; version: string }
): void {
  app.get('/health', async (c) => {
    const ping = await opts.storage.ping();
    return c.json(
      { ok: ping.ok, version: opts.version, storage: ping.ok ? 'ok' : 'unavailable' },
      ping.ok ? 200 : 503
    );
  });
  app.on('HEAD', '/health', async (c) => {
    const ping = await opts.storage.ping();
    return c.body(null, ping.ok ? 200 : 503);
  });
}
