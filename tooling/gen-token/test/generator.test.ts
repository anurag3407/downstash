/**
 * @file tooling/gen-token/test/generator.test.ts
 */

import { describe, expect, it } from 'vitest';
import { hashToken, renderSeedSql, sqlString, type TokenRow } from '../src/generator.ts';

describe('hashToken', () => {
  it('produces a 64-char sha256 hex digest', () => {
    expect(hashToken('dts_abc')).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic', () => {
    expect(hashToken('dts_abc')).toBe(hashToken('dts_abc'));
  });
});

describe('sqlString', () => {
  it('doubles single quotes', () => {
    expect(sqlString("a'b")).toBe("'a''b'");
  });
});

describe('renderSeedSql', () => {
  const tokens: TokenRow[] = [
    {
      name: 'default',
      token_hash: hashToken('dts_x'),
      db_slug: 'primary',
      read_only: false,
      rate_per_sec: null,
      rate_burst: null,
      expires_at: null,
      metadata: JSON.stringify({})
    }
  ];
  it('emits idempotent insert statements', () => {
    const sql = renderSeedSql([{ slug: 'primary', name: 'Primary' }], tokens);
    expect(sql).toContain('insert into downstash.databases');
    expect(sql).toContain('insert into downstash.tokens');
    expect(sql).toContain('on conflict (slug) do nothing');
    expect(sql).toContain('on conflict (token_hash) do nothing');
    expect(sql).toContain(hashToken('dts_x'));
    // Never contains the raw token.
    expect(sql).not.toContain('dts_x');
  });
});
