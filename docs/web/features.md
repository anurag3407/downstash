---
title: Web features
status: draft
last_updated: 2026-10-11
updated_by: P7-T1
code_paths:
  - apps/web/features
---

# Web features

> One section per `features/*` module: what it owns, what it calls, what it
> returns. `draft` until P7-T7 lands.

Every module has the same shape — `queries.ts` (server-only reads),
`actions.ts` (`'use server'` mutations), `schemas.ts` (zod), `components/`, and
a `README.md`. See [data-access.md](./data-access.md).

## `features/databases`

Database list and creation.

| Action           | Input             | Effect                                                                                                                                                                                                                        |
| ---------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createDatabase` | `{name, l1TtlMs}` | checks `MAX_DATABASES_PER_WORKSPACE` → `issueTokenPair()` → one transaction inserting the database and both tokens → `revalidatePath('/redis')` → `{id}` → client `router.push('/redis/' + id)` and toasts `DATABASE CREATED` |

The name schema is `/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/`, and the input
auto-lowercases as you type.

## `features/details`

Connect snippets and facts.

- `revealToken({dbId, kind})` — decrypts `token_enc`, called from `SecretField`.
  No token is in the initial HTML; `curl` the page and grep for `dsk_` to prove it.
- `getConnectSnippets({dbId, kind, reveal})` — returns pre-highlighted HTML so the
  client can swap in a revealed token without shipping the highlighter.

## `features/usage`

`24H` / `7D` / `30D` buckets, zero-filled in SQL with `generate_series`, plus the
`db_stats_daily` line chart which is always 30 days.

## `features/browser`

`SCAN`-driven key list and a per-type editor. Every mutation is one pipeline
per user action, then the key is re-fetched.

| Action                                | Commands                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `scanKeys`                            | `SCAN cursor MATCH p COUNT 100 [TYPE t]` until 50 keys or cursor `0`                                |
| `getKey`                              | type-appropriate read                                                                               |
| `saveString`                          | `SET k v KEEPTTL`                                                                                   |
| `hashSet` / `hashDelete`              | `HSET` / `HDEL`                                                                                     |
| `listSet` / `listDelete` / `listPush` | `LSET`; `LSET k i __downstash_tombstone__` then `LREM k 1 __downstash_tombstone__`; `LPUSH`/`RPUSH` |
| `setAdd` / `setRemove`                | `SADD` / `SREM`                                                                                     |
| `zsetAdd` / `zsetRemove`              | `ZADD k score member` / `ZREM`                                                                      |
| `setTtl` / `persistKey`               | `EXPIRE` / `PERSIST`                                                                                |
| `deleteKey`                           | `DEL`                                                                                               |
| `createKey`                           | `EXISTS` (fails `CONFLICT` if present) then the type-specific command + `EXPIRE`                    |

## `features/cli`

`execCli({dbId, line})` → `tokenizeCli` → `runCommands(db, [argv])` → envelope.
Client-side built-ins: `HELP`, `CLEAR`, `HISTORY`. `FLUSHDB`/`FLUSHALL` ask for
the database name. History is the last 100 lines in
`localStorage['downstash:cli:{dbId}']`.

## `features/settings`

`renameDatabase`, `updateL1`, `rotateToken`, `flushDatabase`, `deleteDatabase`.
Rotation runs in one transaction: set the old row's `revoked_at = now()`, insert
the new token, then show it once in a `SecretField`.

## `features/quotas`

Reads only: `sum(requests)` since 00:00 UTC across all databases over 100 000;
`pg_database_size(current_database())` over 500 MB; the key count;
`cron.job` joined to the latest `cron.job_run_details`.

## Related

- [routes.md](./routes.md) · [data-access.md](./data-access.md) ·
  [../design/copy.md](../design/copy.md)
