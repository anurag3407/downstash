/**
 * @file apps/gateway/src/routes/commands.ts
 * Command routes: `POST /`, `POST /pipeline`, `POST /multi-exec`,
 * `GET|POST /:command/*`, plus the full request pipeline
 * (auth → precheck → L1 → storage → usage) per §9.
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { isCacheable, isWrite, sha256Hex, type RunMode } from '@downstash/protocol';
import type { ResultEnvelope, RedisValue } from '@downstash/protocol';
import type { GatewayConfig } from '../env.ts';
import {
  StorageUnavailableError,
  type RunResponse,
  type Storage
} from '../storage/storage.ts';
import type { AuthCache } from '../core/auth-cache.ts';
import type { L1Cache } from '../core/l1-cache.ts';
import type { UsageBuffer } from '../core/usage-buffer.ts';
import type { AuthResult } from '../core/auth.ts';
import { parseJsonBody, parsePathCommand } from '../core/request-parse.ts';
import { wantsBase64 } from '../core/encoding.ts';
import {
  respondError,
  respondMany,
  respondSingle,
  type L1State
} from '../core/respond.ts';

type CorsFor = (c: Context) => string | null;

export interface CommandRouteDeps {
  config: GatewayConfig;
  storage: Storage;
  authCache: AuthCache;
  l1: L1Cache;
  usage: UsageBuffer;
  now: () => number;
  corsFor: CorsFor;
  authenticate: (token: string | null) => Promise<AuthResult>;
  extractToken: (req: Request, url: URL) => string | null;
}

export function registerCommandRoutes(app: Hono, deps: CommandRouteDeps): void {
  const { config, storage, authCache, l1, usage } = deps;

  function tooLarge(c: Context): Response {
    return respondError(
      413,
      `ERR Downstash: request body exceeds ${config.maxRequestBytes} bytes`,
      deps.corsFor(c)
    );
  }

  async function readBody(
    c: Context
  ): Promise<{ ok: true; text: string } | { ok: false; resp: Response }> {
    const cl = c.req.header('Content-Length');
    if (cl && Number.parseInt(cl, 10) > config.maxRequestBytes)
      return { ok: false, resp: tooLarge(c) };
    const text = await c.req.text();
    if (new TextEncoder().encode(text).length > config.maxRequestBytes)
      return { ok: false, resp: tooLarge(c) };
    return { ok: true, text };
  }

  async function authGate(c: Context): Promise<Response | null> {
    const token = deps.extractToken(c.req.raw, new URL(c.req.url));
    const auth = await deps.authenticate(token);
    if (auth.kind === 'invalid')
      return respondError(401, 'Unauthorized', deps.corsFor(c));
    return null;
  }

  function readonlyPrecheck(auth: AuthResult, commands: string[][]): string | null {
    if (auth.kind !== 'cached' || !auth.principal.readonly) return null;
    for (const argv of commands) {
      if (isWrite(argv[0] ?? '')) {
        return `NOPERM this token has no permissions to run the '${(argv[0] ?? '').toLowerCase()}' command`;
      }
    }
    return null;
  }

  /** Build a response, record its byte length into usage, and return it. */
  async function finish(
    c: Context,
    dbId: string,
    build: () => Promise<Response>
  ): Promise<Response> {
    const resp = await build();
    if (dbId) usage.addBytesOut(dbId, (await resp.clone().arrayBuffer()).byteLength);
    return resp;
  }

  async function handle(
    c: Context,
    mode: RunMode,
    commands: string[][]
  ): Promise<Response> {
    const cors = deps.corsFor(c);
    const base64 = wantsBase64(c.req.raw.headers);
    const url = new URL(c.req.url);
    const token = deps.extractToken(c.req.raw, url);
    const auth = await deps.authenticate(token);
    if (auth.kind === 'invalid') return respondError(401, 'Unauthorized', cors);

    const noperm = readonlyPrecheck(auth, commands);
    if (noperm) return respondSingle({ error: noperm }, { cors, l1: 'BYPASS', base64 });

    const single = mode === 'single';
    const isWriteRequest = commands.some((argv) => isWrite(argv[0] ?? ''));
    const dbId = auth.kind === 'cached' ? auth.principal.dbId : '';
    const l1Ttl = auth.kind === 'cached' ? auth.principal.l1TtlMs : 0;
    const argv0 = commands[0]?.[0] ?? '';

    let l1State: L1State = 'BYPASS';
    if (single && auth.kind === 'cached' && l1Ttl > 0 && isCacheable(argv0)) {
      const cached = l1.get(dbId, commands[0]!);
      if (cached !== undefined) {
        l1State = 'HIT';
        usage.addL1Hit(dbId);
        return finish(c, dbId, async () =>
          respondSingle({ result: cached as RedisValue }, { cors, l1: 'HIT', base64 })
        );
      }
      l1State = 'MISS';
    }

    const tokenHash = token ? await sha256Hex(token) : '';
    const buffered = dbId ? usage.take(dbId) : { l1Hits: 0, bytesOut: 0 };

    let res: RunResponse;
    try {
      const r = await storage.run({
        tokenHash,
        mode,
        commands,
        l1Hits: buffered.l1Hits,
        bytesIn: 0,
        bytesOut: buffered.bytesOut
      });
      if (!r.ok) {
        if (r.status === 401) {
          authCache.setNegative(tokenHash);
          return respondError(401, 'Unauthorized', cors);
        }
        if (r.status === 503) throw new StorageUnavailableError();
        return respondError(r.status, r.error ?? 'ERR Downstash: bad request', cors);
      }
      res = r;
    } catch (err) {
      if (err instanceof StorageUnavailableError) throw err;
      throw err;
    }

    const principal =
      res.principal ??
      (auth.kind === 'cached'
        ? {
            dbId: auth.principal.dbId,
            readonly: auth.principal.readonly,
            l1TtlMs: l1Ttl
          }
        : undefined);
    if (principal) authCache.setPositive(tokenHash, principal);
    if (isWriteRequest && principal) l1.invalidateDb(principal.dbId);
    const finalDb = principal?.dbId ?? '';

    if (single) {
      const envelope = (res.envelopes as ResultEnvelope) ?? { result: null };
      if (
        l1State === 'MISS' &&
        principal &&
        principal.l1TtlMs > 0 &&
        isCacheable(argv0) &&
        'result' in envelope
      ) {
        l1.set(principal.dbId, commands[0]!, envelope.result, principal.l1TtlMs);
      }
      return finish(c, finalDb, async () =>
        respondSingle(envelope, { cors, l1: l1State, base64 })
      );
    }

    const envelopes = (res.envelopes as ResultEnvelope[]) ?? [];
    return finish(c, finalDb, async () =>
      respondMany(envelopes, { cors, l1: l1State, base64 })
    );
  }

  async function pathHandler(c: Context): Promise<Response> {
    const unauth = await authGate(c);
    if (unauth) return unauth;
    const body = await readBody(c);
    if (!body.ok) return body.resp;
    const command = (c.req.param('command') ?? '').toUpperCase();
    const segments = c.req.path.split('/').slice(2);
    const argv = parsePathCommand(
      command,
      segments,
      new URL(c.req.url).searchParams,
      body.text
    );
    return handle(c, 'single', [argv]);
  }

  const jsonRoute = (mode: RunMode) => async (c: Context) => {
    const unauth = await authGate(c);
    if (unauth) return unauth;
    const body = await readBody(c);
    if (!body.ok) return body.resp;
    const parsed = await parseJsonBody(body.text, mode, config.maxPipelineCommands);
    if (!parsed.ok) return respondError(400, parsed.error, deps.corsFor(c));
    return handle(c, mode, parsed.commands);
  };

  app.post('/', jsonRoute('single'));
  app.post('/pipeline', jsonRoute('pipeline'));
  app.post('/multi-exec', jsonRoute('multi'));
  app.get('/:command{[a-zA-Z_.-]+}/*', pathHandler);
  app.post('/:command{[a-zA-Z_.-]+}/*', pathHandler);
  app.get('/:command{[a-zA-Z_.-]+}', pathHandler);
  app.post('/:command{[a-zA-Z_.-]+}', pathHandler);
}
