/**
 * @file packages/client/test/failover.test.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Downstash } from '../src/downstash.ts';
import { SB, baseConfig, clock, makeFetch } from './helpers.ts';

beforeEach(() => clock.reset());
afterEach(() => clock.restore());

describe('failover events + sticky', () => {
  it('fires onFailover once per transition', async () => {
    const { fn } = makeFetch([
      { status: 503, body: {} },
      { status: 200, body: { result: 'a' } }
    ]);
    const onFailover = vi.fn();
    const c = new Downstash(
      baseConfig({
        fetch: fn as unknown as typeof fetch,
        fallback: { supabaseUrl: SB, supabaseKey: 'k' },
        onFailover
      })
    );
    await c.get('foo');
    expect(onFailover).toHaveBeenCalledTimes(1);
    expect(onFailover).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'server_error', status: 503 })
    );
  });

  it('uses RPC directly during the sticky window', async () => {
    const { fn, calls } = makeFetch([
      { status: 503, body: {} },
      { status: 200, body: { result: 'a' } },
      { status: 200, body: { result: 'b' } }
    ]);
    const c = new Downstash(
      baseConfig({
        fetch: fn as unknown as typeof fetch,
        fallback: { supabaseUrl: SB, supabaseKey: 'k' }
      })
    );
    await c.get('foo');
    clock.advance(1000);
    await c.get('foo');
    expect(calls).toHaveLength(3);
    expect(calls[2]!.url).toContain('/rest/v1/rpc/');
  });

  it('leaves sticky window after stickyFailoverMs', async () => {
    const { fn, calls } = makeFetch([
      { status: 503, body: {} },
      { status: 200, body: { result: 'a' } },
      { status: 200, body: { result: 'b' } }
    ]);
    const c = new Downstash(
      baseConfig({
        fetch: fn as unknown as typeof fetch,
        fallback: { supabaseUrl: SB, supabaseKey: 'k' },
        stickyFailoverMs: 5000
      })
    );
    await c.get('foo');
    clock.advance(6000);
    await c.get('foo');
    expect(calls[2]!.url).toContain('gw.example.dev');
  });
});

describe('timeout handling', () => {
  it('fails over on timeout when failoverOnTimeout (default)', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (n++ === 0) {
        const e = new Error('aborted');
        e.name = 'AbortError';
        throw e;
      }
      return {
        status: 200,
        text: async () => JSON.stringify({ result: 'v' })
      } as unknown as Response;
    });
    const onFailover = vi.fn();
    const c = new Downstash(
      baseConfig({
        fetch: fn as unknown as typeof fetch,
        fallback: { supabaseUrl: SB, supabaseKey: 'k' },
        onFailover
      })
    );
    expect(await c.get('foo')).toBe('v');
    expect(onFailover).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'timeout' })
    );
  });

  it('does NOT fail over on timeout when failoverOnTimeout=false', async () => {
    const fn = vi.fn(async () => {
      const e = new Error('aborted');
      e.name = 'AbortError';
      throw e;
    });
    const c = new Downstash(
      baseConfig({
        fetch: fn as unknown as typeof fetch,
        fallback: { supabaseUrl: SB, supabaseKey: 'k' },
        failoverOnTimeout: false
      })
    );
    await expect(c.get('foo')).rejects.toMatchObject({ message: 'Request timed out' });
  });
});

describe('RPC headers (eyJ rule)', () => {
  it('adds Authorization only when key starts with eyJ', async () => {
    let headers: Record<string, string> = {};
    const { fn } = makeFetch([
      { status: 503, body: {} },
      { status: 200, body: { result: 'v' } }
    ]);
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      const r = await fn(url, init);
      if (String(url).includes('/rest/v1/rpc/'))
        headers = (init?.headers as Record<string, string>) ?? {};
      return r;
    });
    const c = new Downstash(
      baseConfig({
        fetch: wrapped as unknown as typeof fetch,
        fallback: { supabaseUrl: SB, supabaseKey: 'eyJpublishable' }
      })
    );
    await c.get('foo');
    expect(headers.Authorization).toBe('Bearer eyJpublishable');
  });

  it('omits Authorization for non-eyJ key', async () => {
    let headers: Record<string, string> = {};
    const { fn } = makeFetch([
      { status: 503, body: {} },
      { status: 200, body: { result: 'v' } }
    ]);
    const wrapped = vi.fn(async (url: string, init?: RequestInit) => {
      const r = await fn(url, init);
      if (String(url).includes('/rest/v1/rpc/'))
        headers = (init?.headers as Record<string, string>) ?? {};
      return r;
    });
    const c = new Downstash(
      baseConfig({
        fetch: wrapped as unknown as typeof fetch,
        fallback: { supabaseUrl: SB, supabaseKey: 'sb_publishable_plain' }
      })
    );
    await c.get('foo');
    expect(headers.Authorization).toBeUndefined();
    expect(headers.apikey).toBe('sb_publishable_plain');
  });
});
