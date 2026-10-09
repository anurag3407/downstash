/**
 * @file apps/gateway/src/core/respond.ts
 * Build Response objects with the shared command headers, L1 header, optional
 * base64 encoding and CORS exposure (§9.5, §9.6).
 */
import { maybeEncode } from './encoding.ts';
import type { ResultEnvelope } from '@downstash/protocol';

export type L1State = 'HIT' | 'MISS' | 'BYPASS';

function baseHeaders(cors: string | null, l1: L1State): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Downstash-L1': l1,
    'Access-Control-Expose-Headers': 'X-Downstash-L1, Upstash-Sync-Token'
  };
  if (cors) h['Access-Control-Allow-Origin'] = cors;
  return h;
}

/** Respond to a single command with an envelope (200 or 400). */
export function respondSingle(
  envelope: ResultEnvelope,
  opts: { cors: string | null; l1: L1State; base64: boolean }
): Response {
  const enc = maybeEncode(envelope, opts.base64);
  const isError = 'error' in enc;
  const status = isError ? 400 : 200;
  return new Response(JSON.stringify(enc), {
    status,
    headers: baseHeaders(opts.cors, opts.l1)
  });
}

/** Respond to a pipeline/multi with an array of envelopes (always 200). */
export function respondMany(
  envelopes: ResultEnvelope[],
  opts: { cors: string | null; l1: L1State; base64: boolean }
): Response {
  const enc = envelopes.map((e) => maybeEncode(e, opts.base64));
  return new Response(JSON.stringify(enc), {
    status: 200,
    headers: baseHeaders(opts.cors, opts.l1)
  });
}

/** Respond with a plain error body and status. */
export function respondError(
  status: number,
  error: string,
  cors: string | null
): Response {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Expose-Headers': 'X-Downstash-L1, Upstash-Sync-Token'
  };
  if (cors) h['Access-Control-Allow-Origin'] = cors;
  return new Response(JSON.stringify({ error }), { status, headers: h });
}
