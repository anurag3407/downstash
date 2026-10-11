---
title: Schema
status: stable
last_updated: 2026-10-11
updated_by: P1-T1
code_paths:
  - supabase/migrations/20261007000100_core_schema.sql
  - supabase/migrations/20261007001100_scripts_ratelimit.sql
  - supabase/migrations/20261007001150_fix_zrange_option_case.sql
  - supabase/migrations/20261007001160_fix_scan_cursor_zrange_rev.sql
---

# Schema

> The `downstash` schema: keyspace, control plane, cursors, registry. All of it
> is invisible to PostgREST.

## Why UNLOGGED

`downstash.kv` is `UNLOGGED`: no write-ahead log, so writes are cheaper and
truncation happens on an unclean restart. That is the right trade for a cache and
a rate limiter, and it is why `docs/ops/durability.md` exists and why the landing
page's FAQ mentions it. `pnpm db:durable` writes a fix-forward migration that
switches the table to `LOGGED` for anyone who needs durability.

## Tables

### `downstash.kv` — the keyspace

| Column       | Type               | Notes                                                                               |
| ------------ | ------------------ | ----------------------------------------------------------------------------------- |
| `db_id`      | `uuid`             | FK → `databases`, `on delete cascade`                                               |
| `key`        | `text collate "C"` | The "C" collation makes btree prefix scans match Redis byte order for `KEYS`/`SCAN` |
| `type`       | `text`             | `string`, `hash`, `list`, `set`, `zset`                                             |
| `val`        | `jsonb`            | Shape per type; see [value-encoding.md](./value-encoding.md)                        |
| `expires_at` | `timestamptz`      | null = no TTL                                                                       |
| `updated_at` | `timestamptz`      | set on write                                                                        |

Primary key `(db_id, key)`. Partial index `kv_expires_at_idx on (expires_at)
where expires_at is not null` serves the pg_cron sweeper.

**Empty collections are never stored.** A command that empties a hash, list, set
or zset deletes the row, which is what makes `EXISTS` and `TYPE` behave like
Redis.

### `downstash.databases`

| Column         | Notes                                                     |
| -------------- | --------------------------------------------------------- |
| `id`           | uuid                                                      |
| `workspace_id` | Clerk org id when one is active, else the user id         |
| `name`         | `^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$`, unique per workspace |
| `l1_ttl_ms`    | 0–10 000, default 0 (off)                                 |
| `created_by`   | Clerk user id                                             |

Index `databases_workspace_idx on (workspace_id, created_at desc)`.

### `downstash.tokens`

`(db_id, kind, token_hash, token_enc, token_hint, created_at, revoked_at)`.
`token_hash` is `bytea`, unique. A partial unique index
`tokens_one_active_per_kind on (db_id, kind) where revoked_at is null` enforces
one live standard and one live read-only token per database.

`token_enc` holds `v1:<iv_b64>:<ct+tag_b64>` AES-256-GCM so the console can
reveal a token once. Null means a seed token — the console says
"Seed token, see supabase/seed.sql".

### `downstash.usage_hourly`

One row per database per UTC hour: `requests`, `commands`, `reads`, `writes`,
`errors`, `l1_hits`, `failover_requests`, `console_commands`, `bytes_in`,
`bytes_out`. This table is **logged**, and it is the one hot row per hour per
database — see `docs/engine/concurrency.md` for why that is acceptable.

### `downstash.db_stats_daily`

`(db_id, day, keys, bytes, computed_at)`, overwritten every 10 minutes by
`downstash.compute_stats()`.

### `downstash.scan_cursors`

`id bigint generated always as identity`, `db_id`, `last_key` (`collate "C"`),
`created_at`. A non-zero SCAN cursor is this id, and it must belong to the
caller's database — an unknown cursor returns `["0", []]`. Rows older than 10
minutes are swept. The table is UNLOGGED because a lost cursor only costs a
rescan.

### `downstash.command_registry`

The source of truth for command metadata: `name`, `handler`, `arity`, `flags`,
`first_key`, `last_key`, `key_step`, `family`, `summary`. `packages/protocol`'s
`COMMANDS` mirror must deep-equal this table — `tests/sql/registry-parity.test.ts`
enforces it. Adding a command means registering it here **and** in the protocol
package.

### `downstash.scripts`

| Column     | Notes                                                           |
| ---------- | --------------------------------------------------------------- |
| `sha1`     | primary key, `^[0-9a-f]{40}$` — the SHA-1 of the exact Lua body |
| `name`     | the PL/pgSQL handler's function name                            |
| `handler`  | `regproc`                                                       |
| `is_write` | gates read-only tokens                                          |
| `source`   | the exact Lua text, byte for byte                               |
| `origin`   | e.g. `@upstash/ratelimit@2.2.0 singleRegion.fixedWindow.limit`  |

Rows are generated from `tests/capture/scripts.json`, which is captured from the
installed SDK. See [scripts.md](./scripts.md).

## Roles

Every table has RLS enabled and no policy for `anon`/`authenticated`, so even a
direct connection with those roles cannot read a row. See
[../architecture/security-model.md](../architecture/security-model.md).

## Migration inventory

| Migration                            | Contents                                     |
| ------------------------------------ | -------------------------------------------- |
| `…000100_core_schema`                | schema, tables, RLS                          |
| `…000200_core_engine`                | helpers, `dispatch`, `run`, usage            |
| `…000300_cmd_server`                 | PING, ECHO, DBSIZE, FLUSHDB, TIME            |
| `…000400_cmd_strings`                | strings                                      |
| `…000500_cmd_keyspace`               | keyspace + expiry                            |
| `…000600_cmd_hashes`                 | hashes                                       |
| `…000700_cmd_lists`                  | lists                                        |
| `…000800_cmd_sets`                   | sets                                         |
| `…000900_cmd_zsets`                  | sorted sets                                  |
| `…001000_cmd_scripts`                | EVAL/EVALSHA/SCRIPT dispatcher               |
| `…001100_users_billing`              | control-plane users and billing              |
| `…001200_ops_cron_stats`             | sweeper, stats, retention, cron              |
| `…001300_seed`                       | dev seed                                     |
| `…001400_rpc_gateway`                | `public.*` RPC surface                       |
| `…001900_test_helpers`               | `tests.*` assertion helpers                  |
| `…001100_scripts_ratelimit`          | the nine native script ports                 |
| `…001150_fix_zrange_option_case`     | ZRANGE options are case-insensitive          |
| `…001160_fix_scan_cursor_zrange_rev` | SCAN cursor index; ZRANGE BYSCORE REV bounds |

## Related

- [value-encoding.md](./value-encoding.md) · [concurrency.md](./concurrency.md) ·
  [../conventions/code-style-sql.md](../conventions/code-style-sql.md)
