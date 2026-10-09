/**
 * @file tooling/gen-enc-key/src/crypto.ts
 * Generates a random 32-byte encryption key for AES-GCM token encryption and
 * prints it as hex. Pure function so it is unit-testable without CLI noise.
 */

/** Length, in bytes, of the AES-GCM key used to encrypt gateway tokens. */
export const KEY_BYTES = 32;

/**
 * Produce `KEY_BYTES` random bytes and encode them as lowercase hex.
 * @returns 64-character hex string (32 bytes).
 */
export function generateKeyHex(): string {
  const bytes = new Uint8Array(KEY_BYTES);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

/** Encode bytes to a lowercase hex string. */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    out += b.toString(16).padStart(2, '0');
  }
  return out;
}
