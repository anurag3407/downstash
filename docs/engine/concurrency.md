---
title: Concurrency
status: stable
last_updated: 2026-10-11
updated_by: P1-T2
code_paths:
  - supabase/migrations/20261007000200_core_engine.sql
---

# Concurrency

> Row locks, command ordering and what the engine does about deadlocks.

## The three locking shapes

| Situation                                     | Use              | Example                                             |
| --------------------------------------------- | ---------------- | --------------------------------------------------- |
| Read-modify-write on a key that may not exist | `lock_or_create` | `INCR`, `HSET`, `LPUSH`, `SADD`, `ZADD`, `APPEND`   |
| Modify only if the key exists                 | `lock_live`      | `HDEL`, `LPOP`, `SREM`, `LSET`, `EXPIRE`, `PERSIST` |
| Blind overwrite                               | `put`            | `SET` without `NX`/`XX`/`GET`/`KEEPTTL`, `MSET`     |

`lock_or_create` retries up to five times (`lock_live`, then
`insert … on conflict do nothing`), and raises SQLSTATE `40001` after that. Both
`40P01` (deadlock) and `40001` (retry limit) are re-raised out of
`downstash.run` so the **gateway retries the whole request** — PostgREST reports
them in the JSON body and `PostgrestStorage` retries on exactly those codes plus
502/503/504.

## Why a pipeline is atomic but a failing command is not

`downstash.run` wraps each command in a `begin … exception` block. A
`DS000` (a command error) appends an `{"error": …}` envelope and continues; the
others stay applied. That is Redis `MULTI` semantics: a failed command does not
abort the transaction. The whole request is still one Postgres transaction, so no
other client ever sees a half-applied pipeline.

## Multi-key writes lock in sorted order

`MSET`, `DEL`, `RENAME`, `MSETNX` lock keys `order by key` — the same order the
primary index uses — so two concurrent transactions cannot lock in opposite
order. This is the single biggest source of database deadlocks in a key-value
store, and it is a one-line fix here.

## No advisory locks

Advisory locks live in a shared lock table that many small locks would exhaust
under load. Every lock the engine takes is a real row lock on
`downstash.kv`, which is what the workload actually contends on.

## The `usage_hourly` hot row

Every request adds counters to one row per database per hour. Postgres
serialises the upserts on that row, which is fine at Downstash's scale (a single
short upsert) and is why the gateway batches its piggybacked counters rather
than issuing its own update. If `pg_stat_activity` ever shows lock waits on it,
the fix is per-minute sharding plus an ADR — not a queue.

## Expiry is lazy plus a sweeper

Reads treat an expired row as absent (`read_live` / `lock_live` check
`expires_at > now()`), and `downstash.sweep_expired()` deletes up to 5 000 rows
per batch, at most 20 batches, every minute via pg_cron. A command that mutates
an expired row deletes it inside the same transaction.

## What the tests prove

`tests/sql/*` fire 50 parallel `INCR`s on separate connections and expect a final
value of 50 — same for `HSET`, `LPUSH`, `SADD`, `ZADD`. Two transactions locking
in opposite order prove `40P01` surfaces rather than hanging.
`tests/differential` proves a scan that adds and deletes keys concurrently still
returns every key that existed throughout.

## Related

- [schema.md](./schema.md) ·
  [`downstash.lock_or_create`](../../supabase/migrations/20261007000200_core_engine.sql)
