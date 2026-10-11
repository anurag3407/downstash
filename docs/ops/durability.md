---
title: Durability
status: stable
last_updated: 2026-10-11
updated_by: P1-T10
code_paths:
  - supabase/migrations/20261007000100_core_schema.sql
---

# Durability

> `downstash.kv` is `UNLOGGED`. What that means, what it costs, and how to change
> it.

## The trade-off

`UNLOGGED` tables skip the write-ahead log. Writes are cheaper and the table is
**truncated after a Postgres crash or an unclean restart**. That is acceptable for
a cache and a rate limiter — the workloads Downstash targets — and it is the
main reason the keyspace is fast.

## What survives and what does not

| Data                            | Table                    | Survives a crash                           |
| ------------------------------- | ------------------------ | ------------------------------------------ |
| Keys                            | `downstash.kv`           | **No**                                     |
| SCAN cursors                    | `downstash.scan_cursors` | **No** (a lost cursor only costs a rescan) |
| Databases, tokens, usage, stats | logged tables            | Yes                                        |

## Making it durable

```bash
pnpm db:durable
```

`scripts/make-durable.ts` writes
`supabase/migrations/<timestamp>_kv_logged.sql` containing:

```sql
alter table downstash.kv set logged;
```

and prints the next steps. Migrations are append-only, so this is a fix-forward
migration like any other. The same switch applies to
`downstash.scan_cursors`, which the generator also includes.

## Where this is disclosed

It is not a hidden trade-off. It appears in:

- the landing page FAQ (`apps/web/components/marketing/faq.tsx`),
- the Details tab's `DURABILITY: UNLOGGED (cache-grade)` row, with a tooltip
  pointing here,
- [`docs/ops/runbook.md`](./runbook.md), under "all keys vanished".

## Related

- [runbook.md](./runbook.md) · [quotas.md](./quotas.md) ·
  [../engine/schema.md](../engine/schema.md)
