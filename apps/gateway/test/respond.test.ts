import { describe, expect, it } from 'vitest';
import { respondSingle, respondMany, respondError } from '../src/core/respond.ts';
import { wantsBase64, maybeEncode } from '../src/core/encoding.ts';
import { utf8ToBase64 } from '@downstash/protocol';

describe('respondSingle', () => {
  it('returns 200 with L1 header', async () => {
    const res = respondSingle({ result: 'OK' }, { cors: '*', l1: 'MISS', base64: false });
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Downstash-L1')).toBe('MISS');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(await res.json()).toEqual({ result: 'OK' });
  });
  it('returns 400 for an error envelope', async () => {
    const res = respondSingle({ error: 'WRONGTYPE' }, { cors: null, l1: 'BYPASS', base64: false });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'WRONGTYPE' });
  });
  it('base64-encodes result when requested', async () => {
    const res = respondSingle({ result: 'hello' }, { cors: null, l1: 'HIT', base64: true });
    expect(await res.json()).toEqual({ result: utf8ToBase64('hello') });
  });
});

describe('respondMany', () => {
  it('is always 200 and returns an array', async () => {
    const res = respondMany([{ result: 'a' }, { error: 'E' }], { cors: '*', l1: 'BYPASS', base64: false });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ result: 'a' }, { error: 'E' }]);
  });
});

describe('respondError', () => {
  it('returns the given status and error body', async () => {
    const res = respondError(401, 'Unauthorized', null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(null);
  });
});

describe('wantsBase64', () => {
  it('true only for base64 value (case-insensitive)', () => {
    expect(wantsBase64(new Headers({ 'Upstash-Encoding': 'base64' }))).toBe(true);
    expect(wantsBase64(new Headers({ 'Upstash-Encoding': 'BASE64' }))).toBe(true);
    expect(wantsBase64(new Headers({ 'Upstash-Encoding': 'json' }))).toBe(false);
    expect(wantsBase64(new Headers())).toBe(false);
  });
});

describe('maybeEncode', () => {
  it('encodes only when base64 requested', () => {
    expect(maybeEncode({ result: 'x' }, false)).toEqual({ result: 'x' });
    expect(maybeEncode({ result: 'x' }, true)).toEqual({ result: utf8ToBase64('x') });
    expect(maybeEncode({ error: 'E' }, true)).toEqual({ error: 'E' });
  });
});
