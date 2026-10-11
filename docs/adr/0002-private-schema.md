---
title: Private downstash schema
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0002. Private downstash schema

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P1-T1

## Context

Supabase exposes the `public` schema over PostgREST to the `anon` key. Internal
helper functions in `public` would be callable by anyone holding the publishable
key, which on a shared project is effectively public.

## Decision

All internals live in a private `downstash` schema that PostgREST does not
expose. Only five functions live in `public`, each with explicit grants:

| Function                                | Granted to                              |
| --------------------------------------- | --------------------------------------- |
| `downstash_gw_run`                      | `service_role`                          |
| `downstash_gw_ping`                     | `service_role`                          |
| `downstash_exec`, `_pipeline`, `_multi` | `anon`, `authenticated`, `service_role` |

Every such migration revokes from `public`, `anon` and `authenticated` first,
grants to the intended roles, and ends with `notify pgrst, 'reload schema'`.

## Consequences

**Positive**

- The keyspace is unreachable over REST, even with a valid anon key.
- The gateway's hot path can be locked to `service_role` while the failover path
  stays open with a token check.
- RLS on every table is a second line of defence.

**Negative**

- The console cannot use PostgREST; it uses the `postgres` driver over the
  transaction pooler (ADR [0012](../adr/0012-console-direct-sql.md)).
- Adding a `public` function means remembering the grant dance.

## Alternatives considered

| Alternative                                                        | Why not                                           |
| ------------------------------------------------------------------ | ------------------------------------------------- |
| Prefix internal functions with `_` and hope PostgREST ignores them | It does not; exposed is exposed                   |
| One `public.rpc` dispatcher                                        | Recreates the same surface with extra indirection |
