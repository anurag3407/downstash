/**
 * @file packages/protocol/test/commands.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  COMMANDS,
  commandNames,
  getCommand,
  isCacheable,
  isWrite,
  precheck
} from '../src/commands.ts';

describe('COMMANDS registry', () => {
  it('is sorted alphabetically', () => {
    const names = commandNames();
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  it('has unique uppercase names', () => {
    const names = commandNames();
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toBe(n.toUpperCase());
  });

  it('every command has a non-empty summary and syntax', () => {
    for (const spec of Object.values(COMMANDS)) {
      expect(spec.summary.length).toBeGreaterThan(0);
      expect(spec.syntax.length).toBeGreaterThan(0);
    }
  });
});

describe('getCommand', () => {
  it('is case-insensitive', () => {
    expect(getCommand('get')?.name).toBe('GET');
    expect(getCommand('Get')?.name).toBe('GET');
  });
  it('returns undefined for unknown', () => {
    expect(getCommand('NOPE')).toBeUndefined();
  });
});

describe('isWrite', () => {
  it('is true for write commands', () => {
    expect(isWrite('SET')).toBe(true);
    expect(isWrite('DEL')).toBe(true);
  });
  it('is false for read commands', () => {
    expect(isWrite('GET')).toBe(false);
    expect(isWrite('MGET')).toBe(false);
  });
  it('is true for script commands', () => {
    expect(isWrite('EVAL')).toBe(true);
  });
  it('is true for unknown commands (fail safe)', () => {
    expect(isWrite('UNKNOWN')).toBe(true);
  });
});

describe('isCacheable', () => {
  it('true for GET/HSET-readable', () => {
    expect(isCacheable('GET')).toBe(true);
    expect(isCacheable('HGET')).toBe(true);
  });
  it('false for SET', () => {
    expect(isCacheable('SET')).toBe(false);
  });
});

describe('precheck', () => {
  it('accepts valid GET', () => {
    const r = precheck(['GET', 'foo']);
    expect(r.ok).toBe(true);
  });
  it('rejects unknown command with exact message', () => {
    const r = precheck(['FOO', 'bar']);
    expect(r).toEqual({ ok: false, error: "ERR unknown command 'FOO', with args beginning with: 'bar' " });
  });
  it('rejects wrong arity (GET needs 2)', () => {
    const r = precheck(['GET']);
    expect(r).toEqual({ ok: false, error: "ERR wrong number of arguments for 'get' command" });
  });
  it('rejects too many args for fixed arity', () => {
    expect(precheck(['GET', 'a', 'b']).ok).toBe(false);
  });
  it('accepts variadic SET with >=3 args', () => {
    expect(precheck(['SET', 'k', 'v', 'EX', '10']).ok).toBe(true);
  });
  it('rejects empty argv as unknown command', () => {
    expect(precheck([]).ok).toBe(false);
  });
});
