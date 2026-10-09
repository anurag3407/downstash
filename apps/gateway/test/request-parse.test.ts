import { describe, expect, it } from 'vitest';
import { parseJsonBody, parsePathCommand } from '../src/core/request-parse.ts';
import { ERRORS } from '@downstash/protocol';

describe('parseJsonBody', () => {
  it('parses single command', async () => {
    const r = await parseJsonBody('["GET","foo"]', 'single', 1000);
    expect(r).toEqual({ ok: true, mode: 'single', commands: [['GET', 'foo']] });
  });
  it('parses pipeline', async () => {
    const r = await parseJsonBody('[["GET","a"],["SET","b","c"]]', 'pipeline', 1000);
    expect(r.ok && r.commands).toEqual([['GET', 'a'], ['SET', 'b', 'c']]);
  });
  it('rejects invalid JSON', async () => {
    const r = await parseJsonBody('not json', 'single', 1000);
    expect(r).toEqual({ ok: false, error: 'ERR Downstash: invalid JSON body' });
  });
  it('rejects bad command shape', async () => {
    const r = await parseJsonBody('null', 'single', 1000);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe(ERRORS.COMMAND_SHAPE);
  });
  it('rejects oversized pipeline', async () => {
    const many = JSON.stringify(Array.from({ length: 5 }, () => ['PING']));
    const r = await parseJsonBody(many, 'pipeline', 4);
    expect(r).toEqual({ ok: false, error: ERRORS.PIPELINE_SIZE });
  });
});

describe('parsePathCommand', () => {
  it('builds argv from path segments', () => {
    expect(parsePathCommand('GET', ['foo'], new URLSearchParams(), '')).toEqual(['GET', 'foo']);
  });
  it('decodes URI components in segments', () => {
    expect(parsePathCommand('GET', ['a%20b'], new URLSearchParams(), '')).toEqual(['GET', 'a b']);
  });
  it('appends query params as name/value pairs', () => {
    expect(parsePathCommand('SET', ['k', 'v'], new URLSearchParams('EX=10'), '')).toEqual([
      'SET',
      'k',
      'v',
      'EX',
      '10'
    ]);
  });
  it('appends flag-only params (empty value) as just the name', () => {
    expect(parsePathCommand('ZADD', ['z'], new URLSearchParams('NX='), '')).toEqual(['ZADD', 'z', 'NX']);
  });
  it('skips _token', () => {
    expect(parsePathCommand('GET', ['k'], new URLSearchParams('_token=dsk_x'), '')).toEqual(['GET', 'k']);
  });
  it('appends POST body as last arg', () => {
    expect(parsePathCommand('SET', ['k'], new URLSearchParams(), 'value')).toEqual(['SET', 'k', 'value']);
  });
});
