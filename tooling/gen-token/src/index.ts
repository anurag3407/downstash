#!/usr/bin/env node
/**
 * @file tooling/gen-token/src/index.ts
 * CLI wrapper around generator.ts. Reads databases.toml, writes seed.sql.
 * Usage: pnpm gen:token
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  hashToken,
  renderSeedSql,
  type DatabaseRow,
  type TokenRow
} from './generator.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');

interface TomlToken {
  name: string;
  token: string;
  db: string;
  read_only: boolean;
  rate_per_sec?: number | null;
  rate_burst?: number | null;
}

/** Read + validate the local databases.toml. */
function loadConfig(): { databases: DatabaseRow[]; tokens: TomlToken[] } {
  const file = path.join(root, 'databases.toml');
  const src = readFileSync(file, 'utf8');
  const databases: DatabaseRow[] = [];
  const tokens: TomlToken[] = [];
  let section: 'db' | 'token' | null = null;
  let obj: Record<string, unknown> = {};

  const flush = (): void => {
    if (section === 'db') {
      databases.push({ slug: String(obj.slug), name: String(obj.name) });
    } else if (section === 'token') {
      tokens.push(obj as unknown as TomlToken);
    }
    obj = {};
  };

  for (const rawLine of src.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const table = /^\[\[?([a-zA-Z0-9_]+)\]\]?$/.exec(line);
    if (table) {
      flush();
      section =
        table[1] === 'databases' ? 'db' : table[1] === 'tokens' ? 'token' : null;
      continue;
    }
    const kv = /^([a-zA-Z0-9_]+)\s*=\s*(.+)$/.exec(line);
    if (kv) {
      obj[kv[1] as string] = parseValue((kv[2] as string).trim());
    }
  }
  flush();
  return { databases, tokens };
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.startsWith('"') && raw.endsWith('"')) return raw.slice(1, -1);
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1);
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim();
    return inner === ''
      ? []
      : inner.split(',').map((s) => String(s.trim()).replace(/^["']|["']$/g, ''));
  }
  return raw;
}

function main(): void {
  const { databases, tokens } = loadConfig();
  const rows: TokenRow[] = tokens.map((t) => ({
    name: t.name,
    token_hash: hashToken(t.token),
    db_slug: t.db,
    read_only: t.read_only,
    rate_per_sec: t.rate_per_sec ?? null,
    rate_burst: t.rate_burst ?? null,
    expires_at: null,
    metadata: JSON.stringify({ generated: true })
  }));
  const sql = renderSeedSql(databases, rows);
  const out = path.join(root, 'supabase', 'seed.sql');
  writeFileSync(out, sql, 'utf8');
  process.stdout.write(`wrote ${out} (${tokens.length} tokens)\n`);
}

main();
