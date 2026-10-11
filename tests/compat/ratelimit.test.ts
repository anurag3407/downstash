/**
 * @file tests/compat/ratelimit.test.ts
 * `@upstash/ratelimit` compatibility suite (P4-T3, §14.3(2)).
 *
 * Each single-region algorithm must: allow `tokens` requests then reject the
 * next one; report `remaining` and `reset` that match the SDK's own maths; and
 * support `getRemaining` and `resetUsedTokens`. The registry ports are the
 * byte-exact Lua bodies the SDK ships, so the reply shapes must line up.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createTestDatabase, type TestDatabase } from '../helpers/fixtures.ts';
import { gatewayRun, GATEWAY_URL, waitForHealth } from '../helpers/gateway.ts';

let db: TestDatabase;
let redis: Redis;

beforeAll(async () => {
  await waitForHealth();
  db = await createTestDatabase();
  redis = new Redis({ url: GATEWAY_URL, token: db.standard });
});

afterAll(async () => {
  await gatewayRun(db.standard, ['FLUSHDB']);
});

describe('fixedWindow', () => {
  it('allows `tokens` requests then rejects the next one', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(5, '10 s'),
      prefix: 'rl:fw'
    });
    const id = 'user:fw';
    for (let i = 0; i < 5; i++) {
      const res = await rl.limit(id);
      expect(res.success, `request ${i + 1}`).toBe(true);
      expect(res.limit).toBe(5);
      expect(res.remaining).toBe(4 - i);
    }
    const blocked = await rl.limit(id);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.reset).toBeGreaterThan(0);
  });

  it('getRemaining reports the unused tokens', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(5, '10 s'),
      prefix: 'rl:fwrem'
    });
    await rl.limit('user:a');
    await rl.limit('user:a');
    const rem = await rl.getRemaining('user:a');
    expect(rem.remaining).toBe(3);
    expect(rem.limit).toBe(5);
  });

  it('resetUsedTokens clears the counter', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(2, '10 s'),
      prefix: 'rl:fwreset'
    });
    const id = 'user:b';
    expect((await rl.limit(id)).success).toBe(true);
    expect((await rl.limit(id)).success).toBe(true);
    expect((await rl.limit(id)).success).toBe(false);
    await rl.resetUsedTokens(id);
    expect((await rl.limit(id)).success).toBe(true);
  });
});

describe('slidingWindow', () => {
  it('allows `tokens` requests then rejects the next one', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '10 s'),
      prefix: 'rl:sw'
    });
    const id = 'user:sw';
    for (let i = 0; i < 5; i++) {
      const res = await rl.limit(id);
      expect(res.success, `request ${i + 1}`).toBe(true);
      expect(res.remaining).toBe(4 - i);
    }
    expect((await rl.limit(id)).success).toBe(false);
  });

  it('getRemaining reports the weighted usage', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '10 s'),
      prefix: 'rl:swrem'
    });
    await rl.limit('user:a');
    await rl.limit('user:a');
    const rem = await rl.getRemaining('user:a');
    expect(rem.remaining).toBeLessThanOrEqual(3);
    expect(rem.remaining).toBeGreaterThan(0);
    expect(rem.limit).toBe(5);
  });

  it('resetUsedTokens clears both windows', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(2, '10 s'),
      prefix: 'rl:swreset'
    });
    const id = 'user:b';
    expect((await rl.limit(id)).success).toBe(true);
    expect((await rl.limit(id)).success).toBe(true);
    expect((await rl.limit(id)).success).toBe(false);
    await rl.resetUsedTokens(id);
    expect((await rl.limit(id)).success).toBe(true);
  });
});

describe('tokenBucket', () => {
  it('allows `maxTokens` requests then rejects the next one', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.tokenBucket(5, '10 s', 5),
      prefix: 'rl:tb'
    });
    const id = 'user:tb';
    for (let i = 0; i < 5; i++) {
      const res = await rl.limit(id);
      expect(res.success, `request ${i + 1}`).toBe(true);
      expect(res.limit).toBe(5);
      expect(res.remaining).toBe(4 - i);
    }
    const blocked = await rl.limit(id);
    expect(blocked.success).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('getRemaining reports the tokens left and the refill time', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.tokenBucket(5, '10 s', 5),
      prefix: 'rl:tbrem'
    });
    await rl.limit('user:a');
    const rem = await rl.getRemaining('user:a');
    expect(rem.remaining).toBe(4);
    expect(rem.limit).toBe(5);
    // refilledAt + interval is in the future.
    expect(rem.reset).toBeGreaterThan(Date.now());
  });

  it('resetUsedTokens clears the bucket', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.tokenBucket(2, '10 s', 2),
      prefix: 'rl:tbreset'
    });
    const id = 'user:b';
    expect((await rl.limit(id)).success).toBe(true);
    expect((await rl.limit(id)).success).toBe(true);
    expect((await rl.limit(id)).success).toBe(false);
    await rl.resetUsedTokens(id);
    expect((await rl.limit(id)).success).toBe(true);
  });
});

describe('cachedFixedWindow', () => {
  it('allows `tokens` requests then rejects the next one', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.cachedFixedWindow(5, '10 s'),
      prefix: 'rl:cfw'
    });
    const id = 'user:cfw';
    for (let i = 0; i < 5; i++) {
      const res = await rl.limit(id);
      expect(res.success, `request ${i + 1}`).toBe(true);
      expect(res.limit).toBe(5);
    }
    const blocked = await rl.limit(id);
    expect(blocked.success).toBe(false);
    // cachedFixedWindow is a raw counter: once the request past the limit lands
    // the SDK reports `tokens - used`, which is -1 (it does not clamp at zero).
    expect(blocked.remaining).toBe(-1);
  });

  it('getRemaining reports the cached used count', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.cachedFixedWindow(5, '10 s'),
      prefix: 'rl:cfwrem'
    });
    await rl.limit('user:a');
    const rem = await rl.getRemaining('user:a');
    expect(rem.remaining).toBe(4);
    expect(rem.limit).toBe(5);
  });
});

describe('all algorithms', () => {
  it('a higher rate consumes more tokens per call', async () => {
    const rl = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(10, '10 s'),
      prefix: 'rl:rate'
    });
    const id = 'user:rate';
    const first = await rl.limit(id, { rate: 3 });
    expect(first.success).toBe(true);
    expect(first.remaining).toBe(7);
    const second = await rl.limit(id, { rate: 4 });
    expect(second.success).toBe(true);
    expect(second.remaining).toBe(3);
    const third = await rl.limit(id, { rate: 4 });
    expect(third.success).toBe(false);
  });

  it('prefixes isolate identifiers between limiters', async () => {
    const a = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(1, '10 s'),
      prefix: 'rl:isoA'
    });
    const b = new Ratelimit({
      redis,
      limiter: Ratelimit.fixedWindow(1, '10 s'),
      prefix: 'rl:isoB'
    });
    expect((await a.limit('user:shared')).success).toBe(true);
    expect((await a.limit('user:shared')).success).toBe(false);
    expect((await b.limit('user:shared')).success).toBe(true);
  });
});
