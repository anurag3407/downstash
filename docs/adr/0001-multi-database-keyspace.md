---
title: Multi-database keyspace
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0001. Multi-database keyspace

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P1-T1

## Context

The PRD specifies one table `public.downstash_kv` with a single global token. The
console UX copied from Upstash is built around many databases per workspace:
create, list, connect, usage, browse, delete.

## Decision

`downstash.kv` is keyed by `(db_id, key)`. Every database owns a standard token
and a read-only token, both hashed. `downstash.databases` holds the workspace id
(Clerk org id when one is active, else the user id).

## Consequences

**Positive**

- Unlimited databases per workspace, with a soft cap via
  `MAX_DATABASES_PER_WORKSPACE`.
- Read-only tokens, so a token can be shared for analytics without write risk.
- Per-database usage and L1 settings.

**Negative**

- Every command carries a `p_db`; there is no "default" database.
- Quotas are a sum across databases, not per database.

## Alternatives considered

| Alternative                          | Why not                                                   |
| ------------------------------------ | --------------------------------------------------------- |
| One keyspace, prefixes for isolation | `FLUSHDB` and per-database TTL/L1 settings become guesses |
| A database per Supabase project      | The free plan is one project                              |
