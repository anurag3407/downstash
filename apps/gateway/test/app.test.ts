/**
 * @file apps/gateway/test/app.test.ts
 * End-to-end tests through the pure Hono app with a fake storage. No network.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeStorage, VALID, makeApp, okRun } from './helpers.ts';
import type { App } from '../src/app.ts';

let app: App;
let storage: FakeStorage;

beforeEach(() => {
  storage = new FakeStorage(() =>
    okRun({ result: 'PONG' }, { dbId: 'db-1', readonly: false, l1TtlMs: 0 })
  );
  app = makeApp(storage);
});
afterEach(() => {
  // no global timers to restore; caches are per-instance
});

function post(body: unknown, token = VALID) {
  return app.hono.request('/', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

describe('POST / single', () => {
  it('forwards a command and returns the envelope', async () => {
    storage = new FakeStorage(() => okRun({ result: 'bar' }));
    app = makeApp(storage);
    const res = await post(['GET', 'foo']);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'bar' });
    expect(storage.calls).toHaveLength(1);
    expect(storage.calls[0]?.commands).toEqual([['GET', 'foo']]);
    expect(storage.calls[0]?.mode).toBe('single');
  });

  it('hashes the token before sending to storage', async () => {
    await post(['PING']);
    expect(storage.calls[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('401 when no token', async () => {
    const res = await app.hono.request('/', { method: 'POST', body: '["PING"]' });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('400 on invalid JSON', async () => {
    const res = await app.hono.request('/', {
      method: 'POST',
      headers: { Authorization: `Bearer ${VALID}` },
      body: '{ not json'
    });
    expect(res.status).toBe(400);
  });

  it('400 on bad command shape', async () => {
    const res = await post(null);
    expect(res.status).toBe(400);
  });

  it('maps a 400 storage failure to a 400 with the error body', async () => {
    storage = new FakeStorage(() => ({
      ok: false,
      status: 400,
      error: 'WRONGTYPE ...'
    }));
    app = makeApp(storage);
    const res = await post(['GET', 'foo']);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'WRONGTYPE ...' });
  });
});

describe('POST /pipeline and /multi-exec', () => {
  it('returns an array of envelopes', async () => {
    storage = new FakeStorage(() => okRun([{ result: 'a' }, { result: 'b' }]));
    app = makeApp(storage);
    const res = await app.hono.request('/pipeline', {
      method: 'POST',
      headers: { Authorization: `Bearer ${VALID}` },
      body: JSON.stringify([
        ['GET', 'a'],
        ['GET', 'b']
      ])
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ result: 'a' }, { result: 'b' }]);
    expect(storage.calls[0]?.mode).toBe('pipeline');
  });

  it('multi-exec maps to multi mode', async () => {
    storage = new FakeStorage((req) =>
      req.mode === 'multi' ? okRun([{ result: 'PONG' }]) : okRun({ result: 'PONG' })
    );
    app = makeApp(storage);
    const res = await app.hono.request('/multi-exec', {
      method: 'POST',
      headers: { Authorization: `Bearer ${VALID}` },
      body: JSON.stringify([['PING']])
    });
    expect(res.status).toBe(200);
    expect(storage.calls[0]?.mode).toBe('multi');
  });
});

describe('path-style commands', () => {
  it('GET /get/foo builds argv', async () => {
    await app.hono.request('/get/foo', {
      headers: { Authorization: `Bearer ${VALID}` }
    });
    expect(storage.calls[0]?.commands).toEqual([['GET', 'foo']]);
  });

  it('query params become options', async () => {
    await app.hono.request('/set/k/v?EX=10', {
      method: 'POST',
      headers: { Authorization: `Bearer ${VALID}` }
    });
    expect(storage.calls[0]?.commands).toEqual([['SET', 'k', 'v', 'EX', '10']]);
  });
});

describe('health', () => {
  it('GET /health reports ok', async () => {
    const res = await app.hono.request('/health');
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; storage: string };
    expect(j.ok).toBe(true);
    expect(j.storage).toBe('ok');
  });
  it('GET /health reports 503 when storage is down', async () => {
    storage = new FakeStorage();
    storage.pingOk = false;
    app = makeApp(storage);
    const res = await app.hono.request('/health');
    expect(res.status).toBe(503);
  });
});

describe('routing / errors', () => {
  it('404 for unknown routes', async () => {
    const res = await app.hono.request('/', {
      headers: { Authorization: `Bearer ${VALID}` }
    });
    expect(res.status).toBe(404);
  });
  it('OPTIONS preflight returns 204 with CORS', async () => {
    const res = await app.hono.request('/', {
      method: 'OPTIONS',
      headers: { Origin: 'https://x.com' }
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});

describe('413 too large', () => {
  it('rejects a body over maxRequestBytes', async () => {
    app = makeApp(storage, { MAX_REQUEST_BYTES: 10 });
    const res = await post(['SET', 'k', 'x'.repeat(100)]);
    expect(res.status).toBe(413);
  });
});

describe('503 storage unavailable', () => {
  it('maps StorageUnavailable to 503', async () => {
    const { StorageUnavailableError } = await import('../src/storage/storage.ts');
    storage = new FakeStorage(() => {
      throw new StorageUnavailableError();
    });
    app = makeApp(storage);
    const res = await post(['PING']);
    expect(res.status).toBe(503);
  });
});
