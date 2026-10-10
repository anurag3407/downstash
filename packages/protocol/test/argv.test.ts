/**
 * @file packages/protocol/test/argv.test.ts
 */

import { describe, expect, it } from 'vitest';
import { normalizeCommand, normalizePipeline } from '../src/argv.ts';
import { ERRORS, ProtocolError, formatError } from '../src/errors.ts';

describe('normalizeCommand', () => {
  it('keeps strings as-is', () => {
    expect(normalizeCommand(['SET', 'foo', 'bar'])).toEqual(['SET', 'foo', 'bar']);
  });
  it('stringifies finite numbers', () => {
    expect(normalizeCommand(['INCRBY', 'n', 5])).toEqual(['INCRBY', 'n', '5']);
    expect(normalizeCommand(['a', 0])).toEqual(['a', '0']);
  });
  it('stringifies booleans', () => {
    expect(normalizeCommand([true, false])).toEqual(['true', 'false']);
  });
  it('JSON-stringifies objects and arrays', () => {
    expect(normalizeCommand([{ a: 1 }])).toEqual(['{"a":1}']);
    expect(normalizeCommand([[1, 2]])).toEqual(['[1,2]']);
  });
  it('throws on null / undefined / NaN / Infinity', () => {
    for (const bad of [null, undefined, NaN, Infinity]) {
      expect(() => normalizeCommand([bad])).toThrow(ProtocolError);
    }
  });
  it('throws on empty array', () => {
    expect(() => normalizeCommand([])).toThrow(ProtocolError);
  });
  it('throws on non-array', () => {
    expect(() => normalizeCommand('SET')).toThrow(ProtocolError);
  });
  it('throws on null bytes', () => {
    expect(() => normalizeCommand(['SET', 'a\u0000b'])).toThrow(ProtocolError);
    expect(() => normalizeCommand(['SET', 'a\u0000b'])).toThrow(ERRORS.NULL_BYTES);
  });
});

describe('normalizePipeline', () => {
  it('normalizes each command', () => {
    expect(
      normalizePipeline(
        [
          ['GET', 'a'],
          ['SET', 'b', 'c']
        ],
        10
      )
    ).toEqual([
      ['GET', 'a'],
      ['SET', 'b', 'c']
    ]);
  });
  it('throws on empty pipeline', () => {
    expect(() => normalizePipeline([], 10)).toThrow(ERRORS.PIPELINE_SIZE);
  });
  it('throws when exceeding max', () => {
    const many = Array.from({ length: 11 }, () => ['PING']);
    expect(() => normalizePipeline(many, 10)).toThrow(ERRORS.PIPELINE_SIZE);
  });
});

describe('formatError', () => {
  it('replaces %s in order', () => {
    expect(formatError("wrong number of arguments for '%s' command", 'get')).toBe(
      "wrong number of arguments for 'get' command"
    );
  });
  it('replaces multiple %s', () => {
    expect(formatError('%s and %s', 'a', 'b')).toBe('a and b');
  });
});
