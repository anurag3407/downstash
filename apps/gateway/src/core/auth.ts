/**
 * @file apps/gateway/src/core/auth.ts
 * Token extraction and authentication with positive/negative caching (§9.3).
 */
import { TOKEN_REGEX, sha256Hex } from '@downstash/protocol';
import type { AuthCache, Principal } from './auth-cache.ts';

/** Extract the bearer token from Authorization or the `_token` query param. */
export function extractToken(req: Request, url: URL): string | null {
  const auth = req.headers.get('Authorization');
  if (auth) {
    const m = /^bearer\s+(.+)$/i.exec(auth.trim());
    if (m && m[1]) return m[1].trim();
  }
  const q = url.searchParams.get('_token');
  if (q) return q;
  return null;
}

export type AuthResult =
  | { kind: 'unknown' }
  | { kind: 'invalid' }
  | { kind: 'cached'; principal: Principal };

/**
 * Authenticate a token. Returns `cached` when the positive cache has a fresh,
 * timing-safe-confirmed entry; `invalid` for a malformed token or a negative
 * cache hit; `unknown` when the DB call must decide.
 */
export async function authenticate(
  token: string | null,
  deps: { authCache: AuthCache; now: () => number }
): Promise<AuthResult> {
  if (!token || !TOKEN_REGEX.test(token)) return { kind: 'invalid' };
  const hash = await sha256Hex(token);
  if (deps.authCache.isNegative(hash)) return { kind: 'invalid' };
  const principal = deps.authCache.getPositive(hash);
  if (principal) {
    // Defense in depth: constant-time confirm the cached hash matches (§9.3.7).
    if (timingSafeEqualHex(principal.hash, hash)) return { kind: 'cached', principal };
    return { kind: 'unknown' };
  }
  return { kind: 'unknown' };
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length >> 1);
  for (let i = 0; i < out.length; i++)
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Constant-time compare; uses crypto.subtle when available, else an XOR loop. */
function timingSafeEqualHex(a: string, b: string): boolean {
  const ab = hexToBytes(a);
  const bb = hexToBytes(b);
  const subtle = (globalThis.crypto as Crypto | undefined)?.subtle as
    | (SubtleCrypto & { timingSafeEqual?: (x: ArrayBuffer, y: ArrayBuffer) => boolean })
    | undefined;
  if (subtle && typeof subtle.timingSafeEqual === 'function') {
    if (ab.length !== bb.length) return false;
    return subtle.timingSafeEqual(
      ab.buffer.slice(ab.byteOffset, ab.byteOffset + ab.byteLength) as ArrayBuffer,
      bb.buffer.slice(bb.byteOffset, bb.byteOffset + bb.byteLength) as ArrayBuffer
    );
  }
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= (ab[i] as number) ^ (bb[i] as number);
  return diff === 0;
}
