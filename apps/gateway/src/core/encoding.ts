/**
 * @file apps/gateway/src/core/encoding.ts
 * Detects the Upstash base64 encoding request header and re-exports the
 * protocol encoder.
 */
import { encodeEnvelope } from '@downstash/protocol';
import type { ResultEnvelope } from '@downstash/protocol';

export { encodeEnvelope };

/** True if the request asked for Upstash base64 encoding (case-insensitive). */
export function wantsBase64(headers: Headers): boolean {
  const v = headers.get('Upstash-Encoding');
  return v !== null && v.toLowerCase() === 'base64';
}

/** Encode a single envelope only if base64 is requested. */
export function maybeEncode(e: ResultEnvelope, base64: boolean): ResultEnvelope {
  return base64 ? encodeEnvelope(e) : e;
}
