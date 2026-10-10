/**
 * @file packages/client/src/requester.ts
 * Adapts the Downstash transport to `@upstash/redis`'s Requester interface, so
 * `new Redis(createDownstashRequester({...}))` works unchanged. The Upstash
 * types are re-declared locally (no hard dependency on the optional peer).
 */
import { DownstashError } from './error.ts';
import { Transport, type Mode } from './transport.ts';
import type { DownstashConfig, RawEnvelopeOrArray } from './types.ts';

// Minimal structural copy of @upstash/redis's Requester surface (§10.4).
export interface UpstashRequest {
  path?: string[];
  body?: unknown;
  upstashSyncToken?: string;
}
export interface UpstashResponse<TResult> {
  result?: TResult;
  error?: string;
}
export interface Requester {
  readYourWrites?: boolean;
  upstashSyncToken?: string;
  request: <TResult = unknown>(
    req: UpstashRequest
  ) => Promise<UpstashResponse<TResult>>;
}

/** Map an Upstash request path to a Downstash run mode, or null for gateway-only. */
function modeFromPath(path: string[] | undefined): Mode | 'unknown' {
  if (!path || path.length === 0 || path[0] === undefined) return 'single';
  if (path[0] === 'pipeline') return 'pipeline';
  if (path[0] === 'multi-exec') return 'multi';
  return 'unknown';
}

/**
 * Build a Requester that routes through the Downstash transport (with failover).
 * `req.body` is a single command array, or (for pipeline/multi) an array of them.
 */
export function createDownstashRequester(config: DownstashConfig): Requester {
  const transport = new Transport({ config });

  return {
    async request<TResult = unknown>(
      req: UpstashRequest
    ): Promise<UpstashResponse<TResult>> {
      const mode = modeFromPath(req.path);
      let raw: RawEnvelopeOrArray;

      if (mode === 'single') {
        raw = await transport.run('single', req.body as never);
      } else if (mode === 'pipeline' || mode === 'multi') {
        raw = await transport.run(mode, undefined, req.body as never);
      } else {
        // Unknown path: gateway only, no failover.
        raw = await transport.runGatewayOnly(req.body as never);
      }

      if (Array.isArray(raw)) {
        return raw as unknown as UpstashResponse<TResult>;
      }
      if (raw && 'error' in raw) {
        return { error: raw.error };
      }
      return { result: (raw.result ?? null) as TResult };
    }
  };
}

export { DownstashError };
