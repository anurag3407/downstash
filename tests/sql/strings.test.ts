/**
 * @file tests/sql/strings.test.ts
 * Command tests for the strings family (§7.8, P1-T2). Uses a per-file isolated
 * database fixture; each `it` is independent because it seeds its own keys.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../helpers/fixtures.ts';
import { exec, requireResult } from '../helpers/sql.ts';
import type { TestDatabase } from '../helpers/sql.ts';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});

describe('GET / SET', () => {
  it('sets and gets a value', async () => {
    expect(await exec(db.id, 'SET', 's1', 'hello')).toEqual({ result: 'OK' });
    expect(await exec(db.id, 'GET', 's1')).toEqual({ result: 'hello' });
  });
  it('GET on missing key returns null', async () => {
    expect(await exec(db.id, 'GET', 'nope')).toEqual({ result: null });
  });
  it('SET with NX only sets when absent', async () => {
    expect(await exec(db.id, 'SET', 'nx', 'a', 'NX')).toEqual({ result: 'OK' });
    expect(await exec(db.id, 'SET', 'nx', 'b', 'NX')).toEqual({ result: null });
    expect(await exec(db.id, 'GET', 'nx')).toEqual({ result: 'a' });
  });
  it('SET with XX only sets when present', async () => {
    expect(await exec(db.id, 'SET', 'xx', 'a', 'XX')).toEqual({ result: null });
    await exec(db.id, 'SET', 'xx', 'a');
    expect(await exec(db.id, 'SET', 'xx', 'b', 'XX')).toEqual({ result: 'OK' });
    expect(await exec(db.id, 'GET', 'xx')).toEqual({ result: 'b' });
  });
  it('SET with EX sets a TTL', async () => {
    await exec(db.id, 'SET', 'ex', 'v', 'EX', '100');
    const ttl = await exec(db.id, 'TTL', 'ex');
    expect(typeof requireResult(ttl)).toBe('number');
    expect(Number(requireResult(ttl))).toBeGreaterThan(0);
    expect(Number(requireResult(ttl))).toBeLessThanOrEqual(100);
  });
  it('SET with KEEPTTL preserves TTL', async () => {
    await exec(db.id, 'SET', 'kt', 'v', 'EX', '100');
    await exec(db.id, 'SET', 'kt', 'v2', 'KEEPTTL');
    expect(Number(requireResult(await exec(db.id, 'TTL', 'kt')))).toBeGreaterThan(0);
    expect(await exec(db.id, 'GET', 'kt')).toEqual({ result: 'v2' });
  });
});

describe('SETNX / SETEX / PSETEX / GETSET / GETDEL', () => {
  it('SETNX returns 1 when set, 0 when not', async () => {
    expect(await exec(db.id, 'SETNX', 'sn', 'v')).toEqual({ result: 1 });
    expect(await exec(db.id, 'SETNX', 'sn', 'v2')).toEqual({ result: 0 });
    expect(await exec(db.id, 'GET', 'sn')).toEqual({ result: 'v' });
  });
  it('SETEX sets value + expiry', async () => {
    expect(await exec(db.id, 'SETEX', 'se', '100', 'v')).toEqual({ result: 'OK' });
    expect(await exec(db.id, 'GET', 'se')).toEqual({ result: 'v' });
  });
  it('PSETEX sets value + ms expiry', async () => {
    expect(await exec(db.id, 'PSETEX', 'pse', '100000', 'v')).toEqual({ result: 'OK' });
    expect(Number(requireResult(await exec(db.id, 'PTTL', 'pse')))).toBeGreaterThan(0);
  });
  it('GETSET returns old value', async () => {
    await exec(db.id, 'SET', 'gs', 'old');
    expect(await exec(db.id, 'GETSET', 'gs', 'new')).toEqual({ result: 'old' });
    expect(await exec(db.id, 'GET', 'gs')).toEqual({ result: 'new' });
  });
  it('GETDEL returns value and deletes', async () => {
    await exec(db.id, 'SET', 'gd', 'v');
    expect(await exec(db.id, 'GETDEL', 'gd')).toEqual({ result: 'v' });
    expect(await exec(db.id, 'GET', 'gd')).toEqual({ result: null });
  });
});

describe('MGET / MSET / MSETNX', () => {
  it('MSET then MGET', async () => {
    expect(await exec(db.id, 'MSET', 'm1', 'a', 'm2', 'b')).toEqual({ result: 'OK' });
    expect(await exec(db.id, 'MGET', 'm1', 'm2', 'missing')).toEqual({
      result: ['a', 'b', null]
    });
  });
  it('MSETNX sets only when none exist', async () => {
    expect(await exec(db.id, 'MSETNX', 'mn1', 'a', 'mn2', 'b')).toEqual({ result: 1 });
    expect(await exec(db.id, 'MSETNX', 'mn1', 'x', 'mn3', 'c')).toEqual({ result: 0 });
    expect(await exec(db.id, 'GET', 'mn1')).toEqual({ result: 'a' });
  });
});

describe('INCR / DECR / INCRBY / DECRBY / INCRBYFLOAT', () => {
  it('INCR on missing key starts at 1', async () => {
    expect(await exec(db.id, 'INCR', 'i1')).toEqual({ result: 1 });
    expect(await exec(db.id, 'INCR', 'i1')).toEqual({ result: 2 });
  });
  it('DECR decrements', async () => {
    await exec(db.id, 'SET', 'i2', '5');
    expect(await exec(db.id, 'DECR', 'i2')).toEqual({ result: 4 });
    expect(await exec(db.id, 'DECRBY', 'i2', '3')).toEqual({ result: 1 });
  });
  it('INCRBY adds', async () => {
    expect(await exec(db.id, 'INCRBY', 'i3', '10')).toEqual({ result: 10 });
  });
  it('INCR on non-integer errors', async () => {
    await exec(db.id, 'SET', 'bad', 'abc');
    const e = await exec(db.id, 'INCR', 'bad');
    expect(e.error).toBe('ERR value is not an integer or out of range');
  });
  it('INCRBYFLOAT increments float', async () => {
    expect(await exec(db.id, 'INCRBYFLOAT', 'f1', '1.5')).toEqual({ result: '1.5' });
    expect(await exec(db.id, 'INCRBYFLOAT', 'f1', '2.5')).toEqual({ result: '4' });
  });
});

describe('APPEND / STRLEN', () => {
  it('APPEND returns new byte length', async () => {
    expect(await exec(db.id, 'APPEND', 'ap', 'hello')).toEqual({ result: 5 });
    expect(await exec(db.id, 'APPEND', 'ap', ' world')).toEqual({ result: 11 });
  });
  it('STRLEN returns byte length', async () => {
    await exec(db.id, 'SET', 'sl', 'héllo'); // 6 UTF-8 bytes
    expect(requireResult(await exec(db.id, 'STRLEN', 'sl'))).toBe(6);
  });
});

describe('wrong type', () => {
  it('GET on a list returns WRONGTYPE', async () => {
    await exec(db.id, 'DEL', 'wt');
    await exec(db.id, 'RPUSH', 'wt', 'a');
    const e = await exec(db.id, 'GET', 'wt');
    expect(e.error).toMatch(/WRONGTYPE/);
  });
});
