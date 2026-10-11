/**
 * @file tests/sql/schema.test.ts
 * Schema invariants (§7.2, P1-T1): tables exist, kv is UNLOGGED, key collation
 * is C, anon can't read kv, the seed database exists with two tokens.
 */
import { describe, expect, it } from 'vitest';
import { asAnon, sql } from '../helpers/sql.ts';

describe('schema invariants', () => {
  it('has all core tables', async () => {
    const rows = await sql<{ t: string }[]>`
      select table_name as t from information_schema.tables
      where table_schema = 'downstash'
    `;
    const names = rows.map((r) => r.t).sort();
    for (const expected of [
      'command_registry',
      'databases',
      'db_stats_daily',
      'kv',
      'scan_cursors',
      'scripts',
      'tokens',
      'usage_hourly'
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('kv is unlogged (relpersistence = u)', async () => {
    const rows = await sql<{ p: string }[]>`
      select relpersistence as p from pg_class
      where oid = 'downstash.kv'::regclass
    `;
    expect(rows[0]?.p).toBe('u');
  });

  it('kv.key uses the C collation', async () => {
    const rows = await sql<{ c: string }[]>`
      select c.collname as c
      from pg_attribute a
      join pg_class cl on cl.oid = a.attrelid
      join pg_namespace n on n.oid = cl.relnamespace
      join pg_collation c on c.oid = a.attcollation
      where n.nspname = 'downstash' and cl.relname = 'kv' and a.attname = 'key'
    `;
    expect(rows[0]?.c).toBe('C');
  });

  it('scan_cursors is unlogged', async () => {
    const rows = await sql<{ p: string }[]>`
      select relpersistence as p from pg_class
      where oid = 'downstash.scan_cursors'::regclass
    `;
    expect(rows[0]?.p).toBe('u');
  });

  it('anon cannot select from downstash.kv', async () => {
    // Must run the role switch and the query on the same connection/transaction,
    // otherwise the pooled connection differs and the role never changes.
    const res = await asAnon(async (tx) => tx`select count(*) from downstash.kv`);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/permission denied/i);
  });

  it('the seed database exists with 2 tokens', async () => {
    const dbs = await sql<{ id: string }[]>`
      select id from downstash.databases where name = 'test-db'
    `;
    expect(dbs).toHaveLength(1);
    const toks = await sql<{ n: number }[]>`
      select count(*)::int as n from downstash.tokens where db_id = ${dbs[0]!.id}::uuid
    `;
    expect(toks[0]?.n).toBe(2);
  });

  it('seed tokens resolve to the documented plaintexts', async () => {
    const rows = await sql<{ kind: string }[]>`
      select t.kind from downstash.tokens t
      join downstash.databases d on d.id = t.db_id
      where d.name = 'test-db'
        and t.token_hash in (
          extensions.digest('dsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'sha256'),
          extensions.digest('dsr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'sha256')
        )
      order by t.kind
    `;
    expect(rows.map((r) => r.kind)).toEqual(['readonly', 'standard']);
  });
});
