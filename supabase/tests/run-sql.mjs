/**
 * @file supabase/tests/run-sql.mjs
 * Runs the SQL engine test suite (supabase/tests/*.sql) against a live Postgres.
 * Loads `_harness.sql` first (which defines the `tests.*` assertion helpers),
 * then each family file. A file passes if psql exits 0 under ON_ERROR_STOP=1.
 *
 * Env: PGBIN, PGHOST, PGPORT, PGUSER, PGDATABASE (see pg-local-reset.sh).
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

const PGBIN = process.env.PGBIN ?? '/opt/homebrew/opt/postgresql@15/bin';
const PSQL = `${PGBIN}/psql`;
const HOST = process.env.PGHOST ?? '/tmp';
const PORT = process.env.PGPORT ?? '55432';
const USER = process.env.PGUSER ?? process.env.USER ?? 'postgres';
const DB = process.env.PGDATABASE ?? 'downstash_test';

// Discover family files (everything except the underscore-prefixed harness).
const files = readdirSync(here)
  .filter((f) => f.endsWith('.sql') && !f.startsWith('_'))
  .sort();

function psql(file) {
  const res = spawnSync(
    PSQL,
    [
      '-h',
      HOST,
      '-p',
      PORT,
      '-U',
      USER,
      '-d',
      DB,
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      file
    ],
    { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C.UTF-8', LANG: 'C.UTF-8' } }
  );
  return res;
}

// Load the assertion harness once.
const harness = psql(join(here, '_harness.sql'));
if (harness.status !== 0) {
  console.error(
    'Failed to load test harness (_harness.sql):\n' + (harness.stderr || harness.stdout)
  );
  process.exit(1);
}

let failed = 0;
for (const f of files) {
  const path = join(here, f);
  const res = psql(path);
  if (res.status === 0) {
    console.log(`  ok   ${f}`);
  } else {
    failed += 1;
    const detail = (res.stderr || res.stdout || '')
      .trim()
      .split('\n')
      .filter(Boolean)
      .slice(-4)
      .join('\n    ');
    console.error(`  FAIL ${f}\n    ${detail}`);
  }
}

console.log(`\n${files.length - failed}/${files.length} SQL test files passed`);
process.exit(failed === 0 ? 0 : 1);
