---
title: Control plane colocated
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0011. Control plane colocated

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P1-T1

## Context

Databases, tokens, usage counters and stats could live in the keyspace
(`UNLOGGED`, crash-truncatable) or in their own logged tables. A control plane
that can vanish on a crash means losing the list of databases and their tokens.

## Decision

Control-plane tables are **logged** and live in the same Supabase project:
`downstash.databases`, `downstash.tokens`, `downstash.usage_hourly`,
`downstash.db_stats_daily`. Only `kv` and `scan_cursors` are `UNLOGGED`.

## Consequences

**Positive**

- One database to operate, one backup story, one connection string.
- A crash loses cache data, never the account.
- `delete_database` is a single `delete` and FK cascades handle the rest.

**Negative**

- Usage writes share the project with the keyspace, so a keyspace-heavy workload
  competes for the same 500 MB.
- The `UNLOGGED` boundary is a real distinction that has to be documented
  ([durability.md](../ops/durability.md)).

## Alternatives considered

| Alternative                                     | Why not                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------- |
| A second Supabase project for the control plane | Two free projects, two backends, one more thing to pay for later |
| Control plane in Clerk metadata                 | Size limits, no SQL, no joins for usage                          |
