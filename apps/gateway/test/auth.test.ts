/**
 * @file apps/gateway/test/auth.test.ts
 */
import { describe, expect, it } from 'vitest';
import { extractToken, authenticate } from '../src/core/auth.ts';
import { AuthCache } from '../src/core/auth-cache.ts';
import { sha256Hex } from '@downstash/protocol';

const VALID = 'dsk_' + 'a'.repeat(43);

function reqWith(headers: Record<string, string>) {
  return new Request('https://gw/', { headers });
}

describe('extractToken', () => {
  it('reads Bearer Authorization header', () => {
    expect(
      extractToken(reqWith({ Authorization: 'Bearer dsk_x' }), new URL('https://gw/'))
    ).toBe('dsk_x');
  });
  it('is case-insensitive on Bearer', () => {
    expect(
      extractToken(reqWith({ Authorization: 'bearer dsk_x' }), new URL('https://gw/'))
    ).toBe('dsk_x');
  });
  it('falls back to _token query param', () => {
    expect(extractToken(reqWith({}), new URL('https://gw/get/foo?_token=dsk_q'))).toBe(
      'dsk_q'
    );
  });
  it('prefers header over query', () => {
    expect(
      extractToken(
        reqWith({ Authorization: 'Bearer dsk_h' }),
        new URL('https://gw/?_token=dsk_q')
      )
    ).toBe('dsk_h');
  });
  it('returns null when neither present', () => {
    expect(extractToken(reqWith({}), new URL('https://gw/'))).toBe(null);
  });
  it('returns null for non-bearer authorization', () => {
    expect(
      extractToken(reqWith({ Authorization: 'Basic abc' }), new URL('https://gw/'))
    ).toBe(null);
  });
});

describe('authenticate', () => {
  const now = () => 0;
  const deps = () => {
    const authCache = new AuthCache({
      positiveTtlMs: 1000,
      negativeTtlMs: 1000,
      maxEntries: 10,
      now
    });
    return { authCache, now };
  };

  it('invalid for null token', async () => {
    const d = deps();
    expect(await authenticate(null, d)).toEqual({ kind: 'invalid' });
  });
  it('invalid for malformed token', async () => {
    const d = deps();
    expect(await authenticate('not-a-token', d)).toEqual({ kind: 'invalid' });
  });
  it('unknown for a valid token with no cache entry', async () => {
    const d = deps();
    expect(await authenticate(VALID, d)).toEqual({ kind: 'unknown' });
  });
  it('invalid when negative-cached', async () => {
    const d = deps();
    d.authCache.setNegative(await sha256Hex(VALID));
    expect(await authenticate(VALID, d)).toEqual({ kind: 'invalid' });
  });
  it('cached when positive-cached and hash matches', async () => {
    const d = deps();
    d.authCache.setPositive(await sha256Hex(VALID), {
      dbId: 'db1',
      readonly: true,
      l1TtlMs: 5
    });
    const r = await authenticate(VALID, d);
    expect(r.kind).toBe('cached');
    if (r.kind === 'cached') {
      expect(r.principal.dbId).toBe('db1');
      expect(r.principal.readonly).toBe(true);
    }
  });
});
