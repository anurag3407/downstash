/**
 * @file packages/protocol/test/encoding.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  base64ToUtf8,
  encodeEnvelope,
  encodeResult,
  utf8ToBase64
} from '../src/encoding.ts';

describe('utf8ToBase64 / base64ToUtf8', () => {
  it('round-trips ascii', () => {
    expect(base64ToUtf8(utf8ToBase64('hello world'))).toBe('hello world');
  });
  it('round-trips utf-8', () => {
    const s = 'héllo → 世界 🚀';
    expect(base64ToUtf8(utf8ToBase64(s))).toBe(s);
  });
  it('encodes to known base64', () => {
    expect(utf8ToBase64('hello')).toBe(btoa('hello'));
  });
  it('handles empty string', () => {
    expect(utf8ToBase64('')).toBe('');
    expect(base64ToUtf8('')).toBe('');
  });
  it('handles large strings (chunked)', () => {
    const big = 'x'.repeat(200000);
    expect(base64ToUtf8(utf8ToBase64(big))).toBe(big);
  });
});

describe('encodeResult', () => {
  it('encodes strings at every depth', () => {
    expect(encodeResult('hello')).toBe(utf8ToBase64('hello'));
  });
  it('leaves numbers unchanged', () => {
    expect(encodeResult(42)).toBe(42);
  });
  it('leaves null unchanged', () => {
    expect(encodeResult(null)).toBe(null);
  });
  it('recurses into arrays', () => {
    expect(encodeResult(['a', 1, null])).toEqual([utf8ToBase64('a'), 1, null]);
  });
  it('recurses into nested arrays', () => {
    expect(encodeResult([['a'], ['b', 'c']])).toEqual([[utf8ToBase64('a')], [utf8ToBase64('b'), utf8ToBase64('c')]]);
  });
});

describe('encodeEnvelope', () => {
  it('encodes result only', () => {
    expect(encodeEnvelope({ result: 'OK' })).toEqual({ result: utf8ToBase64('OK') });
  });
  it('never encodes error', () => {
    expect(encodeEnvelope({ error: 'ERR x' })).toEqual({ error: 'ERR x' });
  });
});
