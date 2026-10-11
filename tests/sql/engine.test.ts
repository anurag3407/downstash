/**
 * @file tests/sql/engine.test.ts
 * Engine-level tests (§14.2): dispatch/run shape, pipeline limits, mid-pipeline
 * error continuation, gw_run auth, anon grants, usage counters, sweep_expired.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createTestDatabase } from '../helpers/fixtures.ts';
import {
  exec,
  rawRun,
  sql,
  asAnon,
  type Envelope,
  type TestDatabase
} from '../helpers/sql.ts';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

describe('exec / dispatch', () => {
  it('returns a PONG for PING', async () => {
    expect(await exec(db.id, 'PING')).toEqual({ result: 'PONG' });
  });

  it('returns unknown command error', async () => {
    const e = await exec(db.id, 'NOPE', 'x');
    expect(e.error).toMatch(/^ERR unknown command 'NOPE'/);
  });

  it('returns wrong arity error', async () => {
    const e = await exec(db.id, 'GET');
    expect(e.error).toBe("ERR wrong number of arguments for 'get' command");
  });

  it('rejects null bytes in arguments', async () => {
    // Layering note: a NUL can never reach `downstash.to_argv` from Postgres —
    // the jsonb parser itself refuses `\u0000` (it cannot be stored), and the
    // `postgres` driver escapes NUL in bound parameters. The gateway
    // (`packages/protocol`) rejects NUL bytes in argv before the DB is called
    // (see packages/protocol/test/argv.test.ts); the SQL guard in `to_argv` is
    // defense-in-depth. Here we assert the layer that fires first.
    await expect(
      sql`select downstash.console_run(${db.id}::uuid, ${[['SET', 'a\u0000b', 'v']]}::jsonb)`
    ).rejects.toThrow(/null character|Unicode escape/i);
  });

  it('rejects keys over 2000 bytes', async () => {
    const e = await exec(db.id, 'SET', 'k'.repeat(2001), 'v');
    expect(e.error).toMatch(/exceeds 2000 bytes/);
  });
});

describe('run / pipeline', () => {
  it('runs 1000 commands', async () => {
    const cmds = Array.from({ length: 1000 }, () => ['PING']);
    const out = await rawRun(db.id, false, cmds);
    expect(out).toHaveLength(1000);
    expect(out.every((e: Envelope) => e.result === 'PONG')).toBe(true);
  });

  it('rejects 1001 commands', async () => {
    const cmds = Array.from({ length: 1001 }, () => ['PING']);
    await expect(rawRun(db.id, false, cmds)).rejects.toThrow(
      /pipeline must contain 1\.\.1000/
    );
  });

  it('continues after a mid-pipeline error', async () => {
    const out = await rawRun(db.id, false, [['SET', 'k', 'v'], ['GET'], ['GET', 'k']]);
    expect(out[0]).toEqual({ result: 'OK' });
    expect(out[1]?.error).toMatch(/wrong number of arguments/);
    expect(out[2]).toEqual({ result: 'v' });
  });
});

describe('gw_run auth', () => {
  type GwRunResult = {
    ok: boolean;
    status?: number;
    error?: string;
    results?: Envelope[];
  };
  const hashOf = (t: string) => createHash('sha256').update(t).digest('hex');

  async function gwRun(
    tokenHash: string,
    mode: string,
    commands: readonly (readonly string[])[]
  ): Promise<GwRunResult> {
    // Pass the real JS array: the driver serializes string parameters as JSON,
    // so a pre-stringified body would double-encode into a scalar against ::jsonb.
    const rows = await sql<{ r: GwRunResult }[]>`
      select public.downstash_gw_run(${tokenHash}, ${mode}, ${commands}::jsonb) as r
    `;
    const r = rows[0]?.r;
    if (!r) throw new Error('downstash_gw_run returned no row');
    return r;
  }

  it('rejects a malformed token hash with 401', async () => {
    const r = await gwRun('deadbeef', 'single', [['PING']]);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
    expect(r.error).toBe('Unauthorized');
  });

  it('rejects an unknown token hash with 401', async () => {
    const r = await gwRun('a'.repeat(64), 'single', [['PING']]);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(401);
  });

  it('runs a single command for a standard token', async () => {
    const r = await gwRun(await hashOf(db.standard), 'single', [['PING']]);
    expect(r.ok).toBe(true);
    expect(r.results).toEqual([{ result: 'PONG' }]);
  });

  it('allows reads but rejects writes for a readonly token', async () => {
    const okGet = await gwRun(await hashOf(db.readonly), 'single', [['GET', 'nope']]);
    expect(okGet.ok).toBe(true);
    // NOPERM surfaces as a per-command error envelope, not an ok:false envelope.
    const badSet = await gwRun(await hashOf(db.readonly), 'single', [
      ['SET', 'a', 'b']
    ]);
    expect(badSet.ok).toBe(true);
    expect(badSet.results?.[0]?.error).toMatch(/^NOPERM/);
  });
});

describe('anon grants', () => {
  it('anon can call downstash_exec', async () => {
    const r = await asAnon(async (tx) => {
      const rows = await tx<
        { r: Envelope }[]
      >`select public.downstash_exec(${db.standard}, 'PING') as r`;
      return rows[0]?.r;
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ result: 'PONG' });
  });

  it('anon cannot call downstash_gw_run', async () => {
    const r = await asAnon(
      async (tx) =>
        tx`select public.downstash_gw_run(${'a'.repeat(64)}, 'single', ${'[["PING"]]'}::jsonb)`
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/permission denied/i);
  });

  it('anon cannot select from downstash.kv', async () => {
    const r = await asAnon(async (tx) => tx`select count(*) from downstash.kv`);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/permission denied/i);
  });
});

describe('usage counters', () => {
  it('increments gateway requests/commands for a token', async () => {
    const hash = Buffer.from(
      (await import('node:crypto')).createHash('sha256').update(db.standard).digest()
    ).toString('hex');
    const before = await sql<{ c: number }[]>`
      select coalesce(sum(commands),0)::int as c from downstash.usage_hourly where db_id = ${db.id}::uuid
    `;
    await sql`select public.downstash_gw_run(${hash}, 'pipeline', '[["PING"],["PING"]]'::jsonb)`;
    const after = await sql<{ c: number }[]>`
      select coalesce(sum(commands),0)::int as c from downstash.usage_hourly where db_id = ${db.id}::uuid
    `;
    expect(after[0]?.c).toBe((before[0]?.c ?? 0) + 2);
  });
});

describe('sweep_expired', () => {
  it('deletes rows with a past expires_at', async () => {
    await exec(db.id, 'SET', 'will-expire', 'v', 'PX', '10');
    // Force an already-expired row directly.
    await sql`
      update downstash.kv set expires_at = now() - interval '1 minute'
      where db_id = ${db.id}::uuid and key = 'will-expire'
    `;
    const rows = await sql<{ n: number }[]>`select downstash.sweep_expired(1000) as n`;
    expect(rows[0]?.n).toBeGreaterThanOrEqual(1);
    const e = await exec(db.id, 'GET', 'will-expire');
    expect(e).toEqual({ result: null });
  });
});
