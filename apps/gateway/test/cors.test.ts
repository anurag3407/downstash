/**
 * @file apps/gateway/test/cors.test.ts
 */
import { describe, expect, it } from 'vitest';
import { resolveCorsOrigin, preflightResponse } from '../src/middleware/cors.ts';

describe('resolveCorsOrigin', () => {
  it('returns * for wildcard', () => {
    expect(resolveCorsOrigin('*', 'https://x.com')).toBe('*');
    expect(resolveCorsOrigin('*', null)).toBe('*');
  });
  it('echoes a listed origin', () => {
    expect(resolveCorsOrigin('https://a.com,https://b.com', 'https://b.com')).toBe('https://b.com');
  });
  it('returns null for unlisted origin', () => {
    expect(resolveCorsOrigin('https://a.com', 'https://evil.com')).toBe(null);
  });
  it('returns null when no origin header', () => {
    expect(resolveCorsOrigin('https://a.com', null)).toBe(null);
  });
});

describe('preflightResponse', () => {
  it('is 204 with methods and max-age', () => {
    const req = new Request('http://x/', { method: 'OPTIONS', headers: { Origin: 'https://a.com' } });
    const res = preflightResponse('https://a.com', req);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST, OPTIONS');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://a.com');
  });
  it('reflects requested headers', () => {
    const req = new Request('http://x/', {
      method: 'OPTIONS',
      headers: { 'Access-Control-Request-Headers': 'X-Custom' }
    });
    expect(preflightResponse('*', req).headers.get('Access-Control-Allow-Headers')).toBe('X-Custom');
  });
});
