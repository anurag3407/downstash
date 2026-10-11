/**
 * @file tests/sql/sets.test.ts
 * Command tests for the sets family (§7.8, P1-T8).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase } from '../helpers/fixtures.ts';
import { exec } from '../helpers/sql.ts';
import type { TestDatabase } from '../helpers/sql.ts';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});

describe('SADD / SREM / SCARD', () => {
  it('SADD returns count added (dedupes)', async () => {
    expect(await exec(db.id, 'SADD', 's', 'a', 'b', 'a')).toEqual({ result: 2 });
    expect(await exec(db.id, 'SCARD', 's')).toEqual({ result: 2 });
  });
  it('SREM returns count removed', async () => {
    expect(await exec(db.id, 'SREM', 's', 'a', 'missing')).toEqual({ result: 1 });
  });
  it('SCARD on missing key returns 0', async () => {
    expect(await exec(db.id, 'SCARD', 'nope')).toEqual({ result: 0 });
  });
});

describe('SISMEMBER / SMISMEMBER / SMEMBERS', () => {
  it('SISMEMBER returns 1/0', async () => {
    await exec(db.id, 'SADD', 'sm', 'x');
    expect(await exec(db.id, 'SISMEMBER', 'sm', 'x')).toEqual({ result: 1 });
    expect(await exec(db.id, 'SISMEMBER', 'sm', 'y')).toEqual({ result: 0 });
  });
  it('SMISMEMBER returns array', async () => {
    await exec(db.id, 'SADD', 'smm', 'x', 'z');
    expect(await exec(db.id, 'SMISMEMBER', 'smm', 'x', 'y', 'z')).toEqual({
      result: [1, 0, 1]
    });
  });
  it('SMEMBERS returns members', async () => {
    await exec(db.id, 'SADD', 'mem', 'a', 'b');
    const r = await exec(db.id, 'SMEMBERS', 'mem');
    expect(r.result).toEqual(expect.arrayContaining(['a', 'b']));
    expect((r.result as string[]).length).toBe(2);
  });
});

describe('SINTER / SUNION / SDIFF', () => {
  it('set algebra', async () => {
    await exec(db.id, 'SADD', 'sa', '1', '2', '3');
    await exec(db.id, 'SADD', 'sb', '2', '3', '4');
    const inter = (await exec(db.id, 'SINTER', 'sa', 'sb')).result as string[];
    expect(inter.sort()).toEqual(['2', '3']);
    const union = (await exec(db.id, 'SUNION', 'sa', 'sb')).result as string[];
    expect(union.sort()).toEqual(['1', '2', '3', '4']);
    const diff = (await exec(db.id, 'SDIFF', 'sa', 'sb')).result as string[];
    expect(diff).toEqual(['1']);
  });
});

describe('SPOP / SRANDMEMBER', () => {
  it('SPOP removes a member', async () => {
    await exec(db.id, 'SADD', 'sp', 'a', 'b');
    const r = await exec(db.id, 'SPOP', 'sp');
    expect(['a', 'b']).toContain(r.result);
    expect(await exec(db.id, 'SCARD', 'sp')).toEqual({ result: 1 });
  });
  it('SPOP with count returns array', async () => {
    await exec(db.id, 'SADD', 'sp2', 'a', 'b', 'c');
    const r = (await exec(db.id, 'SPOP', 'sp2', '2')).result as string[];
    expect(r.length).toBe(2);
  });
  it('SRANDMEMBER does not remove', async () => {
    await exec(db.id, 'SADD', 'sr', 'a', 'b');
    const r = (await exec(db.id, 'SRANDMEMBER', 'sr', '2')).result as string[];
    expect(r.length).toBe(2);
    expect(await exec(db.id, 'SCARD', 'sr')).toEqual({ result: 2 });
  });
});

describe('wrong type', () => {
  it('SADD on a string returns WRONGTYPE', async () => {
    await exec(db.id, 'SET', 'sw', 'v');
    expect((await exec(db.id, 'SADD', 'sw', 'x')).error).toMatch(/WRONGTYPE/);
  });
});
