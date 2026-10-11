/**
 * @file tests/compat/redis.test.ts
 * `@upstash/redis` compatibility suite (P4-T2, §14.3(1)).
 *
 * Runs the official client against the local gateway with both response
 * encodings (base64 default and raw), covering the command surface the PRD
 * promises plus JSON auto-(de)serialization, MULTI/EXEC and pipelines.
 *
 * Reply expectations follow the *client's* semantics: `@upstash/redis`
 * JSON-parses bulk strings (`"1"` → `1`) and `hmget` returns a
 * field-keyed object. Both are client behaviour, not engine behaviour.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Redis } from '@upstash/redis';
import { createTestDatabase, type TestDatabase } from '../helpers/fixtures.ts';
import { gatewayRun, GATEWAY_URL, waitForHealth } from '../helpers/gateway.ts';

let db: TestDatabase;

function client(encoding: 'base64' | 'raw'): Redis {
  // The config union in the installed types declares `responseEncoding` as
  // `false | "base64"`, so the raw client is built by omitting the option.
  return encoding === 'base64'
    ? new Redis({ url: GATEWAY_URL, token: db.standard, responseEncoding: 'base64' })
    : new Redis({ url: GATEWAY_URL, token: db.standard });
}
beforeAll(async () => {
  await waitForHealth();
  db = await createTestDatabase();
});

afterAll(async () => {
  await gatewayRun(db.standard, ['FLUSHDB']);
});

describe('@upstash/redis — encoding', () => {
  it('decodes base64 (the default) replies', async () => {
    const redis = client('base64');
    await redis.set('enc:str', 'hello ✓ 🚀');
    expect(await redis.get('enc:str')).toBe('hello ✓ 🚀');
  });

  it('works with responseEncoding disabled', async () => {
    const redis = client('raw');
    await redis.set('enc:raw', 'no base64');
    expect(await redis.get('enc:raw')).toBe('no base64');
  });

  it('round-trips values through the Upstash-Encoding header', async () => {
    const res = await fetch(`${GATEWAY_URL}/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${db.standard}`,
        'Content-Type': 'application/json',
        'Upstash-Encoding': 'base64'
      },
      body: JSON.stringify(['get', 'enc:str'])
    });
    const body = (await res.json()) as { result: string };
    expect(Buffer.from(body.result, 'base64').toString('utf8')).toBe('hello ✓ 🚀');
  });
});

describe('@upstash/redis — strings', () => {
  it('set/get/incr/decr', async () => {
    const redis = client('base64');
    await redis.set('s:k', '1');
    // The client JSON-parses bulk strings, so "1" arrives as 1.
    expect(await redis.get<number>('s:k')).toBe(1);
    expect(await redis.incr('s:k')).toBe(2);
    expect(await redis.incrby('s:k', 3)).toBe(5);
    expect(await redis.decr('s:k')).toBe(4);
    expect(await redis.decrby('s:k', 2)).toBe(2);
    expect(await redis.get<number>('s:k')).toBe(2);
  });

  it('set with NX/XX/EX and GET options', async () => {
    const redis = client('base64');
    await redis.del('s:nx');
    expect(await redis.set('s:nx', 'a', { nx: true })).toBe('OK');
    // NX against an existing key is a null reply.
    expect(await redis.set('s:nx', 'b', { nx: true })).toBeNull();
    expect(await redis.set('s:nx', 'c', { xx: true })).toBe('OK');
    // `xx` is a presence-only flag in the client's types: a plain SET always
    // writes, which is the same wire behaviour as `{ xx: false }`.
    expect(await redis.set('s:nx2', 'd')).toBe('OK');
    await redis.set('s:ttl', 'v', { ex: 60 });
    expect(await redis.ttl('s:ttl')).toBeGreaterThan(0);
    // GET on a missing key returns null; on an existing key the old value.
    expect(await redis.set('s:get', 'old', { get: true })).toBeNull();
    await redis.set('s:get2', 'v');
    expect(await redis.set('s:get2', 'new', { get: true })).toBe('v');
  });

  it('mget/mset', async () => {
    const redis = client('base64');
    await redis.mset({ 'm:a': '1', 'm:b': '2' });
    expect(await redis.mget<Array<number | null>>('m:a', 'm:b', 'm:missing')).toEqual([
      1,
      2,
      null
    ]);
  });
});

describe('@upstash/redis — keyspace', () => {
  it('exists/del/type/expire/ttl/persist', async () => {
    const redis = client('base64');
    await redis.set('k:a', '1');
    await redis.set('k:b', '2');
    expect(await redis.exists('k:a', 'k:b', 'k:nope')).toBe(2);
    expect(await redis.type('k:a')).toBe('string');
    await redis.expire('k:a', 100);
    expect(await redis.ttl('k:a')).toBeGreaterThan(0);
    expect(await redis.persist('k:a')).toBe(1);
    expect(await redis.ttl('k:a')).toBe(-1);
    expect(await redis.del('k:a', 'k:b')).toBe(2);
  });

  it('scan iterates the keyspace', async () => {
    const redis = client('base64');
    await redis.del('scan:1', 'scan:2', 'scan:3');
    await redis.mset({ 'scan:1': '1', 'scan:2': '2', 'scan:3': '3' });
    const found: string[] = [];
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, { match: 'scan:*', count: 2 });
      cursor = String(next);
      found.push(...(keys as string[]));
    } while (cursor !== '0');
    expect(found.sort()).toEqual(['scan:1', 'scan:2', 'scan:3']);
  });

  it('keys with a glob pattern', async () => {
    const redis = client('base64');
    await redis.mset({ 'gl:a': '1', 'gl:b': '2', 'other:c': '3' });
    expect((await redis.keys('gl:*')).sort()).toEqual(['gl:a', 'gl:b']);
  });
});

describe('@upstash/redis — hashes', () => {
  it('hset/hget/hgetall/hmget/hdel/hlen', async () => {
    const redis = client('base64');
    await redis.del('h:1');
    expect(await redis.hset('h:1', { name: 'alex', age: '3' })).toBe(2);
    expect(await redis.hget('h:1', 'name')).toBe('alex');
    // hmget deserialises into a field-keyed object by client design.
    expect(await redis.hmget('h:1', 'name', 'missing')).toEqual({
      name: 'alex',
      missing: null
    });
    expect(await redis.hlen('h:1')).toBe(2);
    expect(await redis.hgetall('h:1')).toEqual({ name: 'alex', age: 3 });
    expect(await redis.hdel('h:1', 'age')).toBe(1);
  });
});

describe('@upstash/redis — lists', () => {
  it('lpush/rpush/lrange/llen/lindex', async () => {
    const redis = client('base64');
    await redis.del('l:1');
    expect(await redis.rpush('l:1', 'a', 'b', 'c')).toBe(3);
    expect(await redis.lpush('l:1', 'z')).toBe(4);
    expect(await redis.lrange('l:1', 0, -1)).toEqual(['z', 'a', 'b', 'c']);
    expect(await redis.lindex('l:1', 1)).toBe('a');
    expect(await redis.llen('l:1')).toBe(4);
  });
});

describe('@upstash/redis — sets', () => {
  it('sadd/smembers/sismember/scard/srem', async () => {
    const redis = client('base64');
    await redis.del('set:1');
    expect(await redis.sadd('set:1', 'a', 'b')).toBe(2);
    expect((await redis.smembers('set:1')).sort()).toEqual(['a', 'b']);
    expect(await redis.sismember('set:1', 'a')).toBe(1);
    expect(await redis.scard('set:1')).toBe(2);
    expect(await redis.srem('set:1', 'b')).toBe(1);
  });
});

describe('@upstash/redis — sorted sets', () => {
  it('zadd/zrange/zscore/zrank', async () => {
    const redis = client('base64');
    await redis.del('z:1');
    expect(await redis.zadd('z:1', { score: 1, member: 'a' })).toBe(1);
    await redis.zadd('z:1', { score: 2, member: 'b' });
    expect(await redis.zrange('z:1', 0, -1)).toEqual(['a', 'b']);
    expect(await redis.zscore('z:1', 'b')).toBe(2);
    expect(await redis.zrank('z:1', 'b')).toBe(1);
  });

  it('zrange WITHSCORES returns score/member pairs', async () => {
    const redis = client('base64');
    await redis.zadd('z:2', { score: 1, member: 'a' }, { score: 2, member: 'b' });
    // The client sends the lowercase literal `withscores`; the engine must
    // parse options case-insensitively.
    const raw = await gatewayRun(db.standard, [
      'ZRANGE',
      'z:2',
      '0',
      '-1',
      'withscores'
    ]);
    expect(raw.result).toEqual(['a', '1', 'b', '2']);
    const parsed = await redis.zrange<Array<string | number>>('z:2', 0, -1, {
      withScores: true
    });
    expect(parsed).toEqual(['a', 1, 'b', 2]);
  });

  it('zrange BYSCORE with REV', async () => {
    const redis = client('base64');
    await redis.del('z:3');
    await redis.zadd(
      'z:3',
      { score: 1, member: 'a' },
      { score: 2, member: 'b' },
      { score: 3, member: 'c' }
    );
    expect(await redis.zrange('z:3', 2, 3, { byScore: true })).toEqual(['b', 'c']);
    expect(await redis.zrange('z:3', 1, 3, { byScore: true, rev: true })).toEqual([
      'c',
      'b',
      'a'
    ]);
  });
});

describe('@upstash/redis — JSON', () => {
  it('auto-serializes objects and auto-deserializes on read', async () => {
    const redis = client('base64');
    const payload = { user: { id: 42, tags: ['a', 'b'], active: true } };
    await redis.set('json:1', payload);
    expect(await redis.get('json:1')).toEqual(payload);
  });
});

describe('@upstash/redis — pipelines and multi', () => {
  it('pipeline returns envelopes in order', async () => {
    const redis = client('base64');
    await redis.del('p:a', 'p:b');
    const results = await redis
      .pipeline()
      .set('p:a', '1')
      .incr('p:b')
      .get('p:a')
      .exec<[string, number, number]>();
    expect(results).toEqual(['OK', 1, 1]);
  });

  it('multi executes atomically', async () => {
    const redis = client('base64');
    await redis.del('multi:1');
    const results = await redis
      .multi()
      .set('multi:1', 'v')
      .get('multi:1')
      .exec<[string, string]>();
    expect(results).toEqual(['OK', 'v']);
  });

  it('a mid-pipeline error does not abort the rest', async () => {
    const redis = client('base64');
    await redis.set('p:str', 'not-a-hash');
    // The client surfaces a per-command error as a thrown UpstashError naming
    // the command; the pipeline must still have applied the other commands.
    await expect(
      redis.pipeline().set('p:ok', '1').hget('p:str', 'field').get('p:ok').exec()
    ).rejects.toThrow(/hget/);
    expect(await redis.get<number>('p:ok')).toBe(1);
  });
});

describe('@upstash/redis — raw commands', () => {
  it('executes an arbitrary argv', async () => {
    const redis = client('base64');
    expect(await redis.exec(['ping'])).toBe('PONG');
    expect(await redis.exec(['echo', 'hi'])).toBe('hi');
  });
});
