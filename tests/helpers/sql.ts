/**
 * @file tests/helpers/sql.ts
 * Shared `postgres` client + engine helpers (§14.1). `exec` runs a single
 * command via `downstash.console_run` and returns the decoded envelope;
 * `rawRun` runs a full command batch and returns the raw envelope array.
 */
import postgres from 'postgres';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://postgres:postgres@127.0.0.1:54322/postgres';

export interface Envelope {
  result?: unknown;
  error?: string;
}
export type EnvelopeArray = Envelope[];

export const sql = postgres(TEST_DATABASE_URL, {
  max: 10,
  onnotice: () => {}
});

// The transaction tag type returned inside `sql.begin`.
export type TxSql = postgres.TransactionSql<Record<string, unknown>>;

export interface TestDatabase {
  id: string;
  standard: string;
  readonly: string;
}

/** Execute one command against a database as the console (standard token). */
export async function exec(dbId: string, ...argv: string[]): Promise<Envelope> {
  // Pass the real JS array and let `postgres` bind it as jsonb. Passing a
  // pre-stringified JSON value to `::jsonb` double-encodes it into a scalar.
  const rows = await sql<{ envelope: EnvelopeArray }[]>`
    select downstash.console_run(${dbId}::uuid, ${[argv]}::jsonb) as envelope
  `;
  const arr = rows[0]?.envelope ?? [];
  return arr[0] ?? { error: 'ERR no result' };
}

/** Run a batch of commands and return the raw envelope array. */
export async function rawRun(
  dbId: string,
  readonly: boolean,
  commands: string[][]
): Promise<EnvelopeArray> {
  const rows = await sql<{ envelope: EnvelopeArray }[]>`
    select downstash.run(
      ${dbId}::uuid, ${readonly}, ${commands}::jsonb, 'tests'
    ) as envelope
  `;
  return rows[0]?.envelope ?? [];
}

/** The result field of a single-command exec, asserted non-error. */
export function requireResult(e: Envelope): unknown {
  if (e.error) throw new Error(`expected result, got error: ${e.error}`);
  return e.result;
}

/** Close the pool (for scripts, not vitest). */
export async function closeSql(): Promise<void> {
  await sql.end({ timeout: 5 });
}

export type AnonResult<T> = { ok: true; value: T } | { ok: false; error: string };

/**
 * Run a callback inside a transaction as the `anon` role. `set local role`
 * only lasts for the current transaction, so permission tests must run the
 * privileged and asserting statements inside one `sql.begin` block.
 */
export async function asAnon<T>(fn: (tx: TxSql) => Promise<T>): Promise<AnonResult<T>> {
  try {
    // `sql.begin` is typed as `UnwrapPromiseArray<T>` (it supports statements
    // returning several rows); for a single-value callback that is `T`.
    const value = (await sql.begin(async (tx) => {
      await tx.unsafe('set local role anon');
      return await fn(tx);
    })) as T;
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
