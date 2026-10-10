/**
 * @file packages/client/src/transport.ts
 * Failover transport: gateway-first, fall back to Supabase RPC on transient
 * failures. Implements the algorithm in §10.2. Kept dependency-light and
 * injectable (fetch/now) so it is unit-testable.
 */
import { DownstashError } from './error.ts';
import type {
  Command,
  DownstashConfig,
  DownstashFallbackConfig,
  FailoverEvent,
  RawEnvelopeOrArray
} from './types.ts';

export type Mode = 'single' | 'pipeline' | 'multi';

interface Resolved {
  url: string;
  token: string;
  fallback?: DownstashFallbackConfig | undefined;
  timeoutMs: number;
  failoverOnTimeout: boolean;
  stickyFailoverMs: number;
  onFailover?: ((e: FailoverEvent) => void) | undefined;
  fetchImpl: typeof fetch;
}

interface HttpResponse {
  status: number;
  body: unknown;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_STICKY_MS = 60000;

/** Status codes that must NOT trigger failover (real client errors). */
const NO_FAILOVER = new Set([400, 401, 403, 404, 413]);

export class Transport {
  private readonly r: Resolved;
  private readonly now: () => number;
  private stickyUntil = 0;
  /** Whether the current failover episode has already fired onFailover. */
  private failoverArmed = false;

  constructor(opts: { config: DownstashConfig; now?: () => number }) {
    const c = opts.config;
    this.r = {
      url: c.url,
      token: c.token,
      fallback: c.fallback,
      timeoutMs: c.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      failoverOnTimeout: c.failoverOnTimeout ?? true,
      stickyFailoverMs: c.stickyFailoverMs ?? DEFAULT_STICKY_MS,
      onFailover: c.onFailover,
      fetchImpl: c.fetch ?? globalThis.fetch
    };
    this.now = opts.now ?? (() => Date.now());
  }

  /** Run a request; returns the parsed body (envelope or envelope array). */
  async run(
    mode: Mode,
    command?: Command,
    commands?: Command[]
  ): Promise<RawEnvelopeOrArray> {
    if (this.r.fallback && this.now() < this.stickyUntil) {
      return this.runRpc(mode, command, commands);
    }
    try {
      const res = await this.callGateway(mode, command, commands);
      if (res.status >= 200 && res.status < 300) {
        this.failoverArmed = false;
        return res.body as RawEnvelopeOrArray;
      }
      if (NO_FAILOVER.has(res.status)) throw this.toError(res, mode, command, commands);
      if (res.status === 429)
        return this.failover('rate_limited', 429, mode, command, commands);
      if (res.status >= 500)
        return this.failover('server_error', res.status, mode, command, commands);
      throw this.toError(res, mode, command, commands);
    } catch (err) {
      if (err instanceof DownstashError) throw err;
      if (isAbortError(err)) {
        if (!this.r.failoverOnTimeout) {
          throw new DownstashError('Request timed out', {
            command: firstCmd(mode, command, commands),
            source: 'gateway',
            cause: err
          });
        }
        return this.failover('timeout', undefined, mode, command, commands);
      }
      return this.failover('network_error', undefined, mode, command, commands);
    }
  }

  /** Gateway-only execution (no failover) for non-standard Upstash paths. */
  async runGatewayOnly(command: Command): Promise<RawEnvelopeOrArray> {
    try {
      const res = await this.callGateway('single', command);
      if (res.status >= 200 && res.status < 300) return res.body as RawEnvelopeOrArray;
      throw this.toError(res, 'single', command);
    } catch (err) {
      if (err instanceof DownstashError) throw err;
      throw new DownstashError(
        isAbortError(err) ? 'Request timed out' : 'Gateway request failed',
        {
          command: firstCmd('single', command),
          source: 'gateway',
          cause: err
        }
      );
    }
  }

  private failover(
    reason: FailoverEvent['reason'],
    status: number | undefined,
    mode: Mode,
    command?: Command,
    commands?: Command[]
  ): Promise<RawEnvelopeOrArray> {
    if (!this.r.fallback) {
      throw new DownstashError(
        reason === 'timeout'
          ? 'Request timed out'
          : `Gateway error${status ? ` (${status})` : ''}`,
        { command: firstCmd(mode, command, commands), source: 'gateway', status }
      );
    }
    this.stickyUntil = this.now() + this.r.stickyFailoverMs;
    if (!this.failoverArmed) {
      this.failoverArmed = true;
      this.r.onFailover?.({ reason, status, at: this.now() });
    }
    return this.runRpc(mode, command, commands);
  }

  private toError(
    res: HttpResponse,
    mode: Mode,
    command?: Command,
    commands?: Command[]
  ): DownstashError {
    const body = res.body as Record<string, unknown> | null;
    const msg =
      body &&
      typeof body === 'object' &&
      !Array.isArray(body) &&
      typeof body.error === 'string'
        ? body.error
        : `Gateway error (${res.status})`;
    return new DownstashError(msg, {
      command: firstCmd(mode, command, commands),
      source: 'gateway',
      status: res.status
    });
  }

  private async callGateway(
    mode: Mode,
    command?: Command,
    commands?: Command[]
  ): Promise<HttpResponse> {
    const path =
      mode === 'single' ? '/' : mode === 'pipeline' ? '/pipeline' : '/multi-exec';
    const body = mode === 'single' ? command : commands;
    const res = await this.r.fetchImpl(`${trimSlash(this.r.url)}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.r.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.r.timeoutMs)
    });
    const text = await res.text();
    return { status: res.status, body: safeJson(text) };
  }

  private async runRpc(
    mode: Mode,
    command?: Command,
    commands?: Command[]
  ): Promise<RawEnvelopeOrArray> {
    const fb = this.r.fallback;
    if (!fb) {
      throw new DownstashError('No fallback configured', {
        command: firstCmd(mode, command, commands),
        source: 'rpc'
      });
    }
    const rpcName =
      mode === 'single'
        ? 'downstash_exec'
        : mode === 'pipeline'
          ? 'downstash_pipeline'
          : 'downstash_multi';
    const params =
      mode === 'single'
        ? {
            p_token: this.r.token,
            p_cmd: command?.[0],
            p_args: (command ?? []).slice(1)
          }
        : { p_token: this.r.token, p_commands: commands };

    const headers: Record<string, string> = {
      apikey: fb.supabaseKey,
      'Content-Type': 'application/json'
    };
    if (fb.supabaseKey.startsWith('eyJ'))
      headers.Authorization = `Bearer ${fb.supabaseKey}`;

    let res: Response;
    try {
      res = await this.r.fetchImpl(
        `${trimSlash(fb.supabaseUrl)}/rest/v1/rpc/${rpcName}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify(params),
          signal: AbortSignal.timeout(this.r.timeoutMs)
        }
      );
    } catch (err) {
      throw new DownstashError('Fallback RPC unreachable', {
        command: firstCmd(mode, command, commands),
        source: 'rpc',
        cause: err
      });
    }
    const body = safeJson(await res.text()) as Record<string, unknown> | null;
    const unauth = !!body && typeof body === 'object' && body.error === 'Unauthorized';
    if (unauth || res.status === 401) {
      throw new DownstashError('Unauthorized', {
        command: firstCmd(mode, command, commands),
        source: 'rpc',
        status: 401
      });
    }
    return body as RawEnvelopeOrArray;
  }
}

// --- helpers ---

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}
function safeJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
  );
}
function firstCmd(
  mode: Mode,
  command?: Command,
  commands?: Command[]
): string | undefined {
  if (mode === 'single') {
    return command?.[0] !== undefined ? String(command[0]).toUpperCase() : undefined;
  }
  const c = commands?.[0]?.[0];
  return c !== undefined ? String(c).toUpperCase() : undefined;
}
