/**
 * @file packages/client/test/execute.test.ts
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Downstash } from '../src/downstash.ts';
import { SB, baseConfig, clock, enc, makeFetch } from './helpers.ts';

beforeEach(() => clock.reset());
afterEach(() => clock.restore());

describe('Downstash.execute', () => {
  it('returns decoded result on 2xx', async () => {
    const { fn } = makeFetch([{ status: 200, body: { result: enc('hello') } }]);
    const c = new Downstash(baseConfig({ fetch: fn as unknown as typeof fetch }));
    expect(await c.get('foo')).toBe('hello');
  });

  it('throws DownstashError on 400 (no failover)', async () => {
    const { fn, calls } = makeFetch([{ status: 400, body: { error: 'ERR bad' } }]);
    const c = new Downstash(baseConfig({ fetch: fn as unknown as typeof fetch, fallback: { supabaseUrl: SB, supabaseKey: 'anon' } }));
    await expect(c.get('foo')).rejects.toMatchObject({ message: 'ERR bad', source: 'gateway', status: 400 });
    expect(calls).toHaveLength(1);
  });

  it('does not fail over on 401/403/404/413', async () => {
    for (const status of [401, 403, 404, 413]) {
      const { fn, calls } = makeFetch([{ status, body: { error: 'x' } }]);
      const c = new Downstash(baseConfig({ fetch: fn as unknown as typeof fetch, fallback: { supabaseUrl: SB, supabaseKey: 'k' } }));
      await expect(c.get('k')).rejects.toBeInstanceOf(Error);
      expect(calls).toHaveLength(1);
    }
  });

  it('fails over on 429 via RPC', async () => {
    const { fn, calls } = makeFetch([
      { status: 429, body: { error: 'rate' } },
      { status: 200, body: { result: enc('v') } }
    ]);
    const c = new Downstash(baseConfig({ fetch: fn as unknown as typeof fetch, fallback: { supabaseUrl: SB, supabaseKey: 'k' } }));
    expect(await c.get('foo')).toBe('v');
    expect(calls[1]!.url).toContain('/rest/v1/rpc/downstash_exec');
  });

  it('fails over on 503 via RPC', async () => {
    const { fn } = makeFetch([
      { status: 503, body: {} },
      { status: 200, body: { result: enc('ok') } }
    ]);
    const c = new Downstash(baseConfig({ fetch: fn as unknown as typeof fetch, fallback: { supabaseUrl: SB, supabaseKey: 'k' } }));
    expect(await c.get('foo')).toBe('ok');
  });

  it('throws when 429 but no fallback configured', async () => {
    const { fn } = makeFetch([{ status: 429, body: {} }]);
    const c = new Downstash(baseConfig({ fetch: fn as unknown as typeof fetch }));
    await expect(c.get('foo')).rejects.toMatchObject({ source: 'gateway', status: 429 });
  });
});
