/**
 * @file tests/compat/failover.test.ts
 * Failover compatibility test (P5-T2, §14.3(3)).
 *
 * Proves `@downstash/client` completes commands through Supabase's REST
 * endpoint when the gateway cannot be reached, and that `onFailover` fires with
 * the right reason. Runs against the local Supabase through the same shim the
 * gateway uses, so no Docker is needed.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { Downstash, DownstashError } from '@downstash/client';
import { createTestDatabase, type TestDatabase } from '../helpers/fixtures.ts';
import { gatewayRun, waitForHealth, GATEWAY_URL } from '../helpers/gateway.ts';

let db: TestDatabase;

/** The shim URL the gateway talks to; the client's failover endpoint. */
const SUPABASE_URL = process.env.SHIM_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_KEY = 'shim-local-key';

beforeAll(async () => {
  await waitForHealth();
  db = await createTestDatabase();
});

describe('failover: gateway unreachable', () => {
  it('runs commands through the Supabase RPC when the gateway is down', async () => {
    const reason: string[] = [];
    const c = new Downstash({
      // A closed port: connect() fails immediately, no DNS resolution.
      url: 'http://127.0.0.1:1',
      token: db.standard,
      fallback: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY },
      timeoutMs: 2000,
      onFailover: (e) => reason.push(e.reason)
    });

    expect(await c.ping()).toBe('PONG');
    await c.set('fb:a', '1');
    expect(await c.get('fb:a')).toBe('1');
    expect(await c.incr('fb:a')).toBe(2);
    await c.del('fb:a');

    expect(reason).toContain('network_error');
  });

  it('routes a pipeline through the RPC and keeps envelopes in order', async () => {
    const c = new Downstash({
      url: 'http://127.0.0.1:1',
      token: db.standard,
      fallback: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY },
      timeoutMs: 2000
    });
    const out = await c.pipeline([
      ['SET', 'fb:pipe', '7'],
      ['INCR', 'fb:pipe'],
      ['GET', 'fb:pipe']
    ]);
    expect(out).toEqual([{ result: 'OK' }, { result: 8 }, { result: '8' }]);
    await c.del('fb:pipe');
  });
});

describe('failover: gateway returns 429', () => {
  it('fails over with reason rate_limited and reports the status', async () => {
    const reason: Array<{ reason: string; status?: number | undefined }> = [];
    const calls: string[] = [];
    const stub = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes('rpc/')) {
        return new Response(JSON.stringify({ result: 'PONG' }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'rate limited' }), { status: 429 });
    }) as unknown as typeof fetch;

    const c = new Downstash({
      url: GATEWAY_URL,
      token: db.standard,
      fallback: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY },
      timeoutMs: 2000,
      fetch: stub,
      onFailover: (e) => reason.push(e)
    });
    expect(await c.ping()).toBe('PONG');
    expect(reason).toEqual([
      { reason: 'rate_limited', status: 429, at: expect.any(Number) }
    ]);
    expect(calls.some((u) => u.includes('rpc/downstash_exec'))).toBe(true);
  });

  it('fails over on 503 with reason server_error', async () => {
    const reason: string[] = [];
    const stub = (async (input: string | URL | Request) => {
      // Only the gateway is down; the Supabase RPC still answers.
      if (String(input).includes('rpc/')) {
        return new Response(JSON.stringify({ result: 'PONG' }), { status: 200 });
      }
      return new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 });
    }) as unknown as typeof fetch;
    const c = new Downstash({
      url: GATEWAY_URL,
      token: db.standard,
      fallback: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY },
      timeoutMs: 2000,
      fetch: stub,
      onFailover: (e) => reason.push(e.reason)
    });
    expect(await c.ping()).toBe('PONG');
    expect(reason).toEqual(['server_error']);
  });
});

describe('failover: not all failures qualify', () => {
  it('does NOT fail over on a 400 Redis error', async () => {
    const reasons: string[] = [];
    const stub = (async () =>
      new Response(
        JSON.stringify({
          error: 'WRONGTYPE Operation against a key holding the wrong kind of value'
        }),
        {
          status: 400
        }
      )) as unknown as typeof fetch;
    const c = new Downstash({
      url: GATEWAY_URL,
      token: db.standard,
      fallback: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY },
      timeoutMs: 2000,
      fetch: stub,
      onFailover: (e) => reasons.push(e.reason)
    });
    await expect(c.get('k')).rejects.toThrow(DownstashError);
    expect(reasons).toEqual([]);
  });

  it('does NOT fail over on a 401', async () => {
    const reasons: string[] = [];
    const stub = (async () =>
      new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401
      })) as unknown as typeof fetch;
    const c = new Downstash({
      url: GATEWAY_URL,
      token: db.standard,
      fallback: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY },
      timeoutMs: 2000,
      fetch: stub,
      onFailover: (e) => reasons.push(e.reason)
    });
    await expect(c.get('k')).rejects.toThrow(/Unauthorized/);
    expect(reasons).toEqual([]);
  });

  it('throws without a fallback configured', async () => {
    const c = new Downstash({
      url: 'http://127.0.0.1:1',
      token: db.standard,
      timeoutMs: 1000
    });
    await expect(c.ping()).rejects.toThrow(DownstashError);
  });
});

describe('failover: read-only token', () => {
  it('rejects a write through the RPC with NOPERM', async () => {
    const c = new Downstash({
      url: 'http://127.0.0.1:1',
      token: db.readonly,
      fallback: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY },
      timeoutMs: 2000
    });
    await expect(c.set('fb:ro', 'x')).rejects.toThrow(/NOPERM/);
  });
});

describe('gateway still healthy', () => {
  it('prefers the gateway when it works', async () => {
    const c = new Downstash({
      url: GATEWAY_URL,
      token: db.standard,
      fallback: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY },
      timeoutMs: 5000
    });
    const reasons: string[] = [];
    const c2 = new Downstash({
      url: GATEWAY_URL,
      token: db.standard,
      fallback: { supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_KEY },
      timeoutMs: 5000,
      onFailover: (e) => reasons.push(e.reason)
    });
    expect(await c.set('fb:direct', '1')).toBe('OK');
    expect(await c2.get('fb:direct')).toBe('1');
    expect(reasons).toEqual([]);
    await gatewayRun(db.standard, ['DEL', 'fb:direct']);
  });
});
