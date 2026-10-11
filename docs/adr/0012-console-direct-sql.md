---
title: Console direct SQL
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0012. Console direct SQL

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P6-T5

## Context

The console needs to read and write the private `downstash` schema. It cannot use
PostgREST (the schema is not exposed, ADR [0002](./0002-private-schema.md)) and
it must not go through the gateway (that would mean holding a user's token in the
server and losing per-workspace authorisation).

## Decision

The console uses the `postgres` npm driver (porsager) against the **transaction
pooler** (`DATABASE_URL`, port 6543) with `prepare: false` — required because the
pooler multiplexes connections and a prepared statement can be replayed on a
different backend. Reads go through `features/<x>/queries.ts`
(`import 'server-only'`), writes through `actions.ts` (`'use server'`) returning
`ActionResult<T>`. Every action that takes a `dbId` calls `requireDatabase`
first, which checks the uuid shape and then `where id = $1 and workspace_id = $2`.

## Consequences

**Positive**

- Private-schema access and typed SQL with no extra RPC surface.
- Authorisation is an ordinary `where workspace_id = $2`, in the same place as
  the query.
- Server actions mean no `/api` routes and no client-side fetch to our own
  backend.

**Negative**

- The pooler's `prepare: false` costs a little latency and rules out some driver
  features.
- Connection count is a real constraint: `max: 5`, cached on `globalThis` in
  development.

## Alternatives considered

| Alternative                        | Why not                                          |
| ---------------------------------- | ------------------------------------------------ |
| supabase-js over PostgREST         | The schema is not exposed                        |
| Gateway calls with a service token | Loses per-workspace authorisation and adds a hop |
| A direct (non-pooler) connection   | Exhausts the free project's connection count     |
