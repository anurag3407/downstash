/**
 * @file tests/helpers/fixtures.ts
 * Per-test database fixtures for isolation (§14.1). Each test creates its own
 * database with random tokens in workspace `test` and calls `cleanup()` after.
 */
import { createHash, randomBytes } from 'node:crypto';
import { afterAll } from 'vitest';
import { sql, type TestDatabase } from './sql.ts';

export type { TestDatabase };

function genToken(kind: 'standard' | 'readonly'): string {
  const b = randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${kind === 'standard' ? 'dsk_' : 'dsr_'}${b}`;
}

/** Hash a token with SHA-256, matching `extensions.digest(token, 'sha256')`. */
export function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Create an isolated database + tokens; register an afterAll cleanup. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const standard = genToken('standard');
  const readonly = genToken('readonly');
  const suffix = randomBytes(4).toString('hex');
  const name = `test-${suffix}`;

  const rows = await sql<{ id: string }[]>`
    insert into downstash.databases (workspace_id, name, l1_ttl_ms, created_by)
    values ('test', ${name}, 0, 'fixture')
    returning id
  `;
  const id = rows[0]?.id;
  if (!id) throw new Error('failed to create test database');

  await sql`
    insert into downstash.tokens (db_id, kind, token_hash, token_hint) values
      (${id}::uuid, 'standard', ${hashToken(standard)}, 'dsk_…'),
      (${id}::uuid, 'readonly', ${hashToken(readonly)}, 'dsr_…')
  `;

  afterAll(async () => {
    await sql`delete from downstash.kv where db_id = ${id}::uuid`;
    await sql`delete from downstash.tokens where db_id = ${id}::uuid`;
    await sql`delete from downstash.databases where id = ${id}::uuid`;
  });

  return { id, standard, readonly, sql };
}
