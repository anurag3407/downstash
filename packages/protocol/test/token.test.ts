/**
 * @file packages/protocol/test/token.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  TOKEN_REGEX,
  generateToken,
  sha256Hex,
  tokenHint,
  tokenKind
} from '../src/token.ts';

describe('TOKEN_REGEX', () => {
  it('matches generated standard and readonly tokens', () => {
    expect(TOKEN_REGEX.test(generateToken('standard'))).toBe(true);
    expect(TOKEN_REGEX.test(generateToken('readonly'))).toBe(true);
  });
  it('rejects malformed tokens', () => {
    expect(TOKEN_REGEX.test('dsk_short')).toBe(false);
    expect(TOKEN_REGEX.test('xxx_' + 'a'.repeat(43))).toBe(false);
  });
});

describe('generateToken', () => {
  it('produces dsk_ prefix for standard', () => {
    expect(generateToken('standard').startsWith('dsk_')).toBe(true);
  });
  it('produces dsr_ prefix for readonly', () => {
    expect(generateToken('readonly').startsWith('dsr_')).toBe(true);
  });
  it('produces unique tokens', () => {
    const set = new Set(Array.from({ length: 100 }, () => generateToken('standard')));
    expect(set.size).toBe(100);
  });
});

describe('sha256Hex', () => {
  it('produces 64-char hex', async () => {
    expect(await sha256Hex('dsk_x')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic and differs by input', async () => {
    expect(await sha256Hex('a')).toBe(await sha256Hex('a'));
    expect(await sha256Hex('a')).not.toBe(await sha256Hex('b'));
  });
});

describe('tokenKind', () => {
  it('detects standard', () => {
    expect(tokenKind(generateToken('standard'))).toBe('standard');
  });
  it('detects readonly', () => {
    expect(tokenKind(generateToken('readonly'))).toBe('readonly');
  });
  it('returns null for invalid', () => {
    expect(tokenKind('nope')).toBe(null);
  });
});

describe('tokenHint', () => {
  it('shows first 8, ellipsis, last 4', () => {
    const t = 'dsk_0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcde'; // length 47
    // first 8 = 'dsk_0123', last 4 = 'cde'... compute dynamically
    expect(tokenHint(t)).toBe(`${t.slice(0, 8)}…${t.slice(-4)}`);
  });
});
