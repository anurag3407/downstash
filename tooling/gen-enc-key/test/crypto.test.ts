/**
 * @file tooling/gen-enc-key/test/crypto.test.ts
 */

import { describe, expect, it } from 'vitest';
import { KEY_BYTES, generateKeyHex, toHex } from '../src/crypto.ts';

describe('generateKeyHex', () => {
  it('produces 64 lowercase hex chars (32 bytes)', () => {
    const key = generateKeyHex();
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toHaveLength(KEY_BYTES * 2);
  });

  it('produces different keys on each call', () => {
    expect(generateKeyHex()).not.toBe(generateKeyHex());
  });
});

describe('toHex', () => {
  it('pads single-digit bytes', () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff');
  });
});
