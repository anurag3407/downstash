/**
 * @file apps/gateway/src/index.ts
 * Cloudflare Worker entry point. Builds deps once per isolate (a module-level
 * lazy singleton keyed by env identity) and delegates to `createApp().fetch`.
 */
import { createApp, type App } from './app.ts';
import type { Env } from './env.ts';
import { readConfig } from './env.ts';
import { PostgrestStorage } from './storage/postgrest-storage.ts';
import { handleScheduled, type Logger } from './scheduled.ts';

let app: App | null = null;
let appEnvKey = '';
/** Console logger for cron events; the request path uses the injected logger. */
const deps: { loggerFor: (env: Env) => Logger } = {
  loggerFor: () => console as unknown as Logger
};

/** Build (or reuse) the app for the given env. Rebuilds if the env changes. */
function getApp(env: Env): App {
  const key = `${env.SUPABASE_URL}|${env.SUPABASE_SECRET_KEY}|${env.DOWNSTASH_VERSION ?? ''}|${env.ALLOWED_ORIGINS ?? ''}`;
  if (app && appEnvKey === key) return app;

  const config = readConfig(env);
  const storage = new PostgrestStorage({
    url: config.supabaseUrl,
    key: config.supabaseKey,
    timeoutMs: config.rpcTimeoutMs
  });

  app = createApp({ storage, config, now: () => Date.now() });
  appEnvKey = key;
  return app;
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    try {
      const a = getApp(env);
      return await a.hono.fetch(
        request,
        env as unknown as Record<string, unknown>,
        _ctx
      );
    } catch {
      // Config errors (e.g. missing SUPABASE_URL) → 500 without leaking secrets.
      return new Response(JSON.stringify({ error: 'ERR Downstash: internal error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  },

  /** Scheduled keep-alive (§9.1 src/scheduled.ts). */
  async scheduled(
    _event: ScheduledController,
    env: Env,
    _ctx: ExecutionContext
  ): Promise<void> {
    try {
      const a = getApp(env);
      await handleScheduled({ storage: a.deps.storage, log: deps.loggerFor(env) });
    } catch (err) {
      console.error(
        JSON.stringify({ level: 'error', msg: 'keepalive failed', error: String(err) })
      );
    }
  }
} satisfies ExportedHandler<Env>;
