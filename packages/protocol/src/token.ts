/**
 * @file packages/protocol/src/token.ts
 * Token format, generation, hashing and hints. Tokens are never stored raw.
 */
import type { TokenKind } from './types.ts';

/** `dsk_`/`dsr_` prefix + 43 base64url chars (32 bytes, no padding). */
export const TOKEN_REGEX = /^ds[kr]_[A-Za-z0-9_-]{43}$/;

/** Encode bytes as unpadded base64url. */
function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Generate a fresh token of the given kind. */
export function generateToken(kind: TokenKind): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const prefix = kind === 'readonly' ? 'dsr_' : 'dsk_';
  return prefix + base64Url(bytes);
}

/** Lowercase SHA-256 hex digest of a token. */
export async function sha256Hex(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Return the token kind, or null if the token doesn't match the format. */
export function tokenKind(token: string): TokenKind | null {
  if (!TOKEN_REGEX.test(token)) return null;
  return token.startsWith('dsk_') ? 'standard' : 'readonly';
}

/** A short display hint, e.g. `dsk_Ab3x…9QzT`. */
export function tokenHint(token: string): string {
  return `${token.slice(0, 8)}…${token.slice(-4)}`;
}
