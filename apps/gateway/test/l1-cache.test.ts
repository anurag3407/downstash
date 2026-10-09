import { describe, expect, it } from 'vitest';
import { L1Cache } from '../src/core/l1-cache.ts';

function make(now: () => number, maxEntries = 100, maxBytes = 65536) {
  return new L1Cache({ maxEntries, maxValueBytes: maxBytes, now });
}

describe('L1Cache set/get', () => {
  it('stores and retrieves a value', () => {
    const t = 0;
    const c = make(() => t);
    c.set('db', ['GET', 'k'], 'v', 1000);
    expect(c.get('db', ['GET', 'k'])).toBe('v');
  });
  it('is case-insensitive on the command name', () => {
    const c = make(() => 0);
    c.set('db', ['GET', 'k'], 'v', 1000);
    expect(c.get('db', ['get', 'k'])).toBe('v');
  });
  it('ignores non-positive ttl', () => {
    const c = make(() => 0);
    c.set('db', ['GET', 'k'], 'v', 0);
    expect(c.get('db', ['GET', 'k'])).toBeUndefined();
  });
  it('expires after ttl', () => {
    let t = 0;
    const c = make(() => t);
    c.set('db', ['GET', 'k'], 'v', 100);
    t = 150;
    expect(c.get('db', ['GET', 'k'])).toBeUndefined();
  });
  it('separates different databases', () => {
    const c = make(() => 0);
    c.set('db1', ['GET', 'k'], 'a', 1000);
    c.set('db2', ['GET', 'k'], 'b', 1000);
    expect(c.get('db1', ['GET', 'k'])).toBe('a');
    expect(c.get('db2', ['GET', 'k'])).toBe('b');
  });
});

describe('L1Cache value size guard', () => {
  it('skips oversized values', () => {
    const c = make(() => 0, 100, 10);
    c.set('db', ['GET', 'k'], 'x'.repeat(100), 1000);
    expect(c.get('db', ['GET', 'k'])).toBeUndefined();
  });
});

describe('L1Cache invalidateDb', () => {
  it('drops only the target database entries', () => {
    const c = make(() => 0);
    c.set('db1', ['GET', 'a'], '1', 1000);
    c.set('db1', ['GET', 'b'], '2', 1000);
    c.set('db2', ['GET', 'a'], '3', 1000);
    c.invalidateDb('db1');
    expect(c.get('db1', ['GET', 'a'])).toBeUndefined();
    expect(c.get('db1', ['GET', 'b'])).toBeUndefined();
    expect(c.get('db2', ['GET', 'a'])).toBe('3');
  });
});

describe('L1Cache LRU eviction', () => {
  it('evicts oldest beyond maxEntries', () => {
    const c = make(() => 0, 2);
    c.set('db', ['GET', 'a'], '1', 1000);
    c.set('db', ['GET', 'b'], '2', 1000);
    c.set('db', ['GET', 'c'], '3', 1000);
    expect(c.size).toBe(2);
    expect(c.get('db', ['GET', 'a'])).toBeUndefined();
    expect(c.get('db', ['GET', 'c'])).toBe('3');
  });
});
