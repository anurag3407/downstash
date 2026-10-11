/**
 * @file tests/sql/hashes.test.ts
 * Command tests for the hashes family (§7.8, P1-T6).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../helpers/fixtures.ts';
import { exec, requireResult } from '../helpers/sql.ts';
import type { TestDatabase } from '../helpers/sql.ts';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});

describe('HSET / HGET', () => {
  it('sets fields and returns count added', async () => {
    expect(await exec(db.id, 'HSET', 'h', 'f1', 'v1', 'f2', 'v2')).toEqual({
      result: 2
    });
  });
  it('HGET returns field value', async () => {
    expect(await exec(db.id, 'HGET', 'h', 'f1')).toEqual({ result: 'v1' });
  });
  it('HGET missing field returns null', async () => {
    expect(await exec(db.id, 'HGET', 'h', 'nope')).toEqual({ result: null });
  });
  it('HSET updating existing returns 0', async () => {
    expect(await exec(db.id, 'HSET', 'h', 'f1', 'v1b')).toEqual({ result: 0 });
    expect(await exec(db.id, 'HGET', 'h', 'f1')).toEqual({ result: 'v1b' });
  });
});

describe('HSETNX / HMSET', () => {
  it('HSETNX returns 1/0', async () => {
    expect(await exec(db.id, 'HSETNX', 'h2', 'a', '1')).toEqual({ result: 1 });
    expect(await exec(db.id, 'HSETNX', 'h2', 'a', '2')).toEqual({ result: 0 });
    expect(await exec(db.id, 'HGET', 'h2', 'a')).toEqual({ result: '1' });
  });
  it('HMSET returns OK', async () => {
    expect(await exec(db.id, 'HMSET', 'h3', 'a', '1', 'b', '2')).toEqual({
      result: 'OK'
    });
  });
});

describe('HMGET / HGETALL', () => {
  it('HMGET returns array with nulls', async () => {
    await exec(db.id, 'HSET', 'h4', 'a', '1', 'b', '2');
    expect(await exec(db.id, 'HMGET', 'h4', 'a', 'missing', 'b')).toEqual({
      result: ['1', null, '2']
    });
  });
  it('HGETALL returns flat array', async () => {
    const r = requireResult(await exec(db.id, 'HGETALL', 'h4'));
    expect(r).toEqual(['a', '1', 'b', '2']);
  });
  it('HGETALL on missing key returns []', async () => {
    expect(await exec(db.id, 'HGETALL', 'nope')).toEqual({ result: [] });
  });
});

describe('HDEL / HLEN / HEXISTS', () => {
  it('HDEL returns count and deletes key when empty', async () => {
    await exec(db.id, 'HSET', 'h5', 'a', '1');
    expect(await exec(db.id, 'HDEL', 'h5', 'a')).toEqual({ result: 1 });
    expect(await exec(db.id, 'HLEN', 'h5')).toEqual({ result: 0 });
    expect(await exec(db.id, 'TYPE', 'h5')).toEqual({ result: 'none' });
  });
  it('HLEN / HEXISTS', async () => {
    await exec(db.id, 'HSET', 'h6', 'a', '1', 'b', '2');
    expect(await exec(db.id, 'HLEN', 'h6')).toEqual({ result: 2 });
    expect(await exec(db.id, 'HEXISTS', 'h6', 'a')).toEqual({ result: 1 });
    expect(await exec(db.id, 'HEXISTS', 'h6', 'z')).toEqual({ result: 0 });
  });
});

describe('HKEYS / HVALS', () => {
  it('returns fields and values', async () => {
    await exec(db.id, 'HSET', 'h7', 'a', '1', 'b', '2');
    expect(await exec(db.id, 'HKEYS', 'h7')).toEqual({ result: ['a', 'b'] });
    expect(await exec(db.id, 'HVALS', 'h7')).toEqual({ result: ['1', '2'] });
  });
});

describe('HINCRBY / HINCRBYFLOAT', () => {
  it('HINCRBY integer', async () => {
    expect(await exec(db.id, 'HINCRBY', 'h8', 'n', '5')).toEqual({ result: 5 });
    expect(await exec(db.id, 'HINCRBY', 'h8', 'n', '-2')).toEqual({ result: 3 });
  });
  it('HINCRBY on non-integer errors', async () => {
    await exec(db.id, 'HSET', 'h9', 'n', 'abc');
    expect((await exec(db.id, 'HINCRBY', 'h9', 'n', '1')).error).toBe(
      'ERR hash value is not an integer'
    );
  });
  it('HINCRBYFLOAT float', async () => {
    expect(await exec(db.id, 'HINCRBYFLOAT', 'h10', 'f', '1.5')).toEqual({
      result: '1.5'
    });
  });
});

describe('HSTRLEN / HRANDFIELD', () => {
  it('HSTRLEN returns byte length', async () => {
    await exec(db.id, 'HSET', 'h11', 'a', 'hello');
    expect(requireResult(await exec(db.id, 'HSTRLEN', 'h11', 'a'))).toBe(5);
  });
  it('HRANDFIELD without count returns a single field', async () => {
    await exec(db.id, 'HSET', 'h12', 'a', '1', 'b', '2');
    const r = requireResult(await exec(db.id, 'HRANDFIELD', 'h12'));
    expect(['a', 'b']).toContain(r);
  });
  it('HRANDFIELD WITHVALUES returns pairs', async () => {
    const r = requireResult(await exec(db.id, 'HRANDFIELD', 'h12', '2', 'WITHVALUES'));
    expect(Array.isArray(r)).toBe(true);
    expect((r as unknown[]).length).toBe(4);
  });
});

describe('wrong type', () => {
  it('HGET on a string returns WRONGTYPE', async () => {
    await exec(db.id, 'SET', 'sw', 'v');
    expect((await exec(db.id, 'HGET', 'sw', 'f')).error).toMatch(/WRONGTYPE/);
  });
});
