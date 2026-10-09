/**
 * @file packages/protocol/src/encoding.ts
 * Base64-encode every string in a reply so binary-safe values survive JSON
 * transport and are decoded uniformly by `@upstash/redis`-style clients.
 */
import type { RedisValue, ResultEnvelope } from './types.ts';

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked btoa to avoid blowing the call stack / arg limits on big strings.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** UTF-8 string → base64. */
export function utf8ToBase64(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s));
}

/** base64 → UTF-8 string. */
export function base64ToUtf8(b64: string): string {
  return new TextDecoder().decode(base64ToBytes(b64));
}

/**
 * Recursively base64-encode every string at every depth. Numbers and nulls
 * pass through unchanged. Arrays are mapped depth-first.
 */
export function encodeResult(v: RedisValue): RedisValue {
  if (typeof v === 'string') return utf8ToBase64(v);
  if (Array.isArray(v)) return v.map((x) => encodeResult(x));
  return v; // number | null
}

/** Encode the `result` of an envelope; never touch `error`. */
export function encodeEnvelope(e: ResultEnvelope): ResultEnvelope {
  if ('error' in e) return e;
  return { result: encodeResult(e.result) };
}
