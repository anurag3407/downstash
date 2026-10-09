/**
 * @file apps/gateway/src/app.ts
 * Pure Hono app factory. Injects `storage`, `config` and `now` so tests never
 * touch a real database or the clock. Builds caches once per app instance.
 */
import { Hono } from 'hono';
import type { GatewayConfig } from './env.ts';
import { StorageUnavailableError, type Storage } from './storage/storage.ts';
import { AuthCache, type Principal } from './core/auth-cache.ts';
import { L1Cache } from './core/l1-cache.ts';
import { UsageBuffer } from './core/usage-buffer.ts';
import { authenticate, extractToken } from './core/auth.ts';
import { respondError } from './core/respond.ts';
import { preflightResponse, resolveCorsOrigin } from './middleware/cors.ts';
import { registerHealthRoutes } from './routes/health.ts';
import { registerCommandRoutes } from './routes/commands.ts';
import type { ResultEnvelope } from '@downstash/protocol';

export interface AppDeps {
  storage: Storage;
  config: GatewayConfig;
  now: () => number;
  /** Injected for tests; defaults to crypto.subtle via protocol. */
  logger?: { info: (obj: unknown, msg?: string) => void; error: (obj: unknown, msg?: string) => void };
}

export interface App {
  hono: Hono;
  authCache: AuthCache;
  l1: L1Cache;
  usage: UsageBuffer;
  deps: AppDeps;
}

export function createApp(deps: AppDeps): App {
  const authCache = new AuthCache({
    positiveTtlMs: deps.config.authCacheTtlMs,
    negativeTtlMs: deps.config.negativeAuthCacheTtlMs,
    maxEntries: 10000,
    now: deps.now
  });
  const l1 = new L1Cache({ maxEntries: 1000, maxValueBytes: 65536, now: deps.now });
  const usage = new UsageBuffer();

  const logger = deps.logger ?? {
    info: () => {},
    error: () => {}
  };

  const app = new Hono();

  // Error boundary: unexpected → 500 (§9.6).
  app.onError((err, c) => {
    if (err instanceof StorageUnavailableError) {
      return respondError(503, 'ERR Downstash: storage unavailable', corsFor(c));
    }
    logger.error({ msg: 'unhandled', error: err instanceof Error ? err.message : String(err) });
    return respondError(500, 'ERR Downstash: internal error', corsFor(c));
  });

  function corsFor(c: { req: { header(name: string): string | undefined } }): string | null {
    return resolveCorsOrigin(deps.config.allowedOrigins, c.req.header('Origin') ?? null);
  }

  // CORS preflight.
  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      return preflightResponse(deps.config.allowedOrigins, c.req.raw);
    }
    await next();
  });

  registerHealthRoutes(app, { storage: deps.storage, version: deps.config.version });

  registerCommandRoutes(app, {
    config: deps.config,
    storage: deps.storage,
    authCache,
    l1,
    usage,
    now: deps.now,
    corsFor,
    authenticate: async (token) => authenticate(token, { authCache, now: deps.now }),
    extractToken
  });

  // 404 fallback.
  app.notFound((c) => respondError(404, 'ERR Downstash: not found', corsFor(c)));

  return { hono: app, authCache, l1, usage, deps };
}

export type { Principal, ResultEnvelope };
