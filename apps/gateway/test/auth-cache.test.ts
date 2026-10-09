/**
 * @file apps/gateway/test/auth-cache.test.ts
 */
import { describe, expect, it } from 'vitest';
import { AuthCache } from '../src/core/auth-cache.ts';

function make(now: () => number, posTtl = 1000, negTtl = 1000, max = 10) {
  return new AuthCache({ positiveTtlMs: posTtl, negativeTtlMs: negTtl, maxEntries: max, now });
}

describe('AuthCache positive', () => {
  it('stores and retrieves a principal', () => {
    const t = 0;
    const c = make(() => t);
    c.setPositive('h1', { dbId: 'db', readonly: false, l1TtlMs: 0 });
    expect(c.getPositive('h1')?.dbId).toBe('db');
    expect(c.getPositive('h1')?.hash).toBe('h1');
  });
  it('expires after ttl', () => {
    let t = 0;
    const c = make(() => t, 100);
    c.setPositive('h1', { dbId: 'db', readonly: false, l1TtlMs: 0 });
    t = 150;
    expect(c.getPositive('h1')).toBeUndefined();
  });
});

describe('AuthCache negative', () => {
  it('records and detects a negative hit', () => {
    let t = 0;
    const c = make(() => t, 1000, 100);
    c.setNegative('h1');
    expect(c.isNegative('h1')).toBe(true);
    t = 150;
    expect(c.isNegative('h1')).toBe(false);
  });
  it('setNegative clears any positive entry', () => {
    const c = make(() => 0);
    c.setPositive('h1', { dbId: 'db', readonly: false, l1TtlMs: 0 });
    c.setNegative('h1');
    expect(c.getPositive('h1')).toBeUndefined();
    expect(c.isNegative('h1')).toBe(true);
  });
});

describe('AuthCache eviction', () => {
  it('evicts oldest beyond maxEntries (LRU)', () => {
    const c = make(() => 0, 1000, 1000, 2);
    c.setPositive('a', { dbId: 'a', readonly: false, l1TtlMs: 0 });
    c.setPositive('b', { dbId: 'b', readonly: false, l1TtlMs: 0 });
    c.setPositive('c', { dbId: 'c', readonly: false, l1TtlMs: 0 });
    expect(c.positiveSize).toBe(2);
    expect(c.getPositive('a')).toBeUndefined();
    expect(c.getPositive('c')?.dbId).toBe('c');
  });
  it('get promotes to most-recently-used', () => {
    const c = make(() => 0, 1000, 1000, 2);
    c.setPositive('a', { dbId: 'a', readonly: false, l1TtlMs: 0 });
    c.setPositive('b', { dbId: 'b', readonly: false, l1TtlMs: 0 });
    c.getPositive('a'); // a is now MRU
    c.setPositive('c', { dbId: 'c', readonly: false, l1TtlMs: 0 });
    expect(c.getPositive('a')?.dbId).toBe('a');
    expect(c.getPositive('b')).toBeUndefined();
  });
});
