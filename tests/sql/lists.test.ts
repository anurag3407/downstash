/**
 * @file tests/sql/lists.test.ts
 * Command tests for the lists family (§7.8, P1-T7).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../helpers/fixtures.ts';
import { exec, requireResult } from '../helpers/sql.ts';
import type { TestDatabase } from '../helpers/sql.ts';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});

describe('LPUSH / RPUSH / LRANGE', () => {
  it('LPUSH prepends, LRANGE returns reversed', async () => {
    expect(await exec(db.id, 'LPUSH', 'l', 'a', 'b', 'c')).toEqual({ result: 3 });
    expect(await exec(db.id, 'LRANGE', 'l', '0', '-1')).toEqual({
      result: ['c', 'b', 'a']
    });
  });
  it('RPUSH appends', async () => {
    await exec(db.id, 'DEL', 'l2');
    expect(await exec(db.id, 'RPUSH', 'l2', 'a', 'b', 'c')).toEqual({ result: 3 });
    expect(await exec(db.id, 'LRANGE', 'l2', '0', '-1')).toEqual({
      result: ['a', 'b', 'c']
    });
  });
  it('LRANGE negative indices', async () => {
    expect(await exec(db.id, 'LRANGE', 'l2', '-2', '-1')).toEqual({
      result: ['b', 'c']
    });
  });
  it('LRANGE out of range returns empty', async () => {
    expect(await exec(db.id, 'LRANGE', 'l2', '10', '20')).toEqual({ result: [] });
  });
});

describe('LPUSHX / RPUSHX', () => {
  it('returns 0 when key missing', async () => {
    expect(await exec(db.id, 'LPUSHX', 'nope', 'v')).toEqual({ result: 0 });
    expect(await exec(db.id, 'RPUSHX', 'nope', 'v')).toEqual({ result: 0 });
  });
  it('pushes when key exists', async () => {
    await exec(db.id, 'RPUSH', 'lx', 'a');
    expect(await exec(db.id, 'RPUSHX', 'lx', 'b')).toEqual({ result: 2 });
  });
});

describe('LPOP / RPOP', () => {
  it('LPOP single and with count', async () => {
    await exec(db.id, 'DEL', 'p');
    await exec(db.id, 'RPUSH', 'p', '1', '2', '3');
    expect(await exec(db.id, 'LPOP', 'p')).toEqual({ result: '1' });
    expect(await exec(db.id, 'LPOP', 'p', '2')).toEqual({ result: ['2', '3'] });
  });
  it('RPOP single and with count', async () => {
    await exec(db.id, 'RPUSH', 'q', '1', '2', '3');
    expect(await exec(db.id, 'RPOP', 'q')).toEqual({ result: '3' });
    expect(await exec(db.id, 'RPOP', 'q', '2')).toEqual({ result: ['2', '1'] });
  });
  it('LPOP on empty returns null', async () => {
    expect(await exec(db.id, 'LPOP', 'nope')).toEqual({ result: null });
  });
});

describe('LLEN / LINDEX / LSET', () => {
  it('LLEN / LINDEX', async () => {
    await exec(db.id, 'RPUSH', 'n', 'a', 'b', 'c');
    expect(await exec(db.id, 'LLEN', 'n')).toEqual({ result: 3 });
    expect(await exec(db.id, 'LINDEX', 'n', '0')).toEqual({ result: 'a' });
    expect(await exec(db.id, 'LINDEX', 'n', '-1')).toEqual({ result: 'c' });
    expect(await exec(db.id, 'LINDEX', 'n', '99')).toEqual({ result: null });
  });
  it('LSET updates element', async () => {
    expect(await exec(db.id, 'LSET', 'n', '0', 'z')).toEqual({ result: 'OK' });
    expect(await exec(db.id, 'LINDEX', 'n', '0')).toEqual({ result: 'z' });
  });
  it('LSET out of range errors', async () => {
    expect((await exec(db.id, 'LSET', 'n', '99', 'x')).error).toBe(
      'ERR index out of range'
    );
  });
});

describe('LREM / LTRIM / LPOS', () => {
  it('LREM removes count occurrences', async () => {
    await exec(db.id, 'RPUSH', 'r', 'a', 'b', 'a', 'c', 'a');
    expect(await exec(db.id, 'LREM', 'r', '2', 'a')).toEqual({ result: 2 });
    expect(await exec(db.id, 'LRANGE', 'r', '0', '-1')).toEqual({
      result: ['b', 'c', 'a']
    });
  });
  it('LTRIM trims range', async () => {
    await exec(db.id, 'RPUSH', 't', '1', '2', '3', '4', '5');
    expect(await exec(db.id, 'LTRIM', 't', '1', '3')).toEqual({ result: 'OK' });
    expect(await exec(db.id, 'LRANGE', 't', '0', '-1')).toEqual({
      result: ['2', '3', '4']
    });
  });
  it('LPOS finds element index', async () => {
    await exec(db.id, 'RPUSH', 'pos', 'a', 'b', 'a');
    expect(requireResult(await exec(db.id, 'LPOS', 'pos', 'a'))).toBe(0);
    const multi = requireResult(await exec(db.id, 'LPOS', 'pos', 'a', 'COUNT', '0'));
    expect(multi).toEqual([0, 2]);
  });
});

describe('wrong type', () => {
  it('LPUSH on a string returns WRONGTYPE', async () => {
    await exec(db.id, 'SET', 'sw', 'v');
    expect((await exec(db.id, 'LPUSH', 'sw', 'x')).error).toMatch(/WRONGTYPE/);
  });
});
