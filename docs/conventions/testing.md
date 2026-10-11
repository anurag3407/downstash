---
title: Testing
status: stable
last_updated: 2026-10-11
updated_by: P4-T1
code_paths:
  - tests/vitest.sql.config.ts
  - tests/differential/differential.test.ts
---

# Testing

> Every behaviour ships with a test. The layers below are the only places tests
> live, and each layer has one job.

## Layers

| Layer          | Tool                     | Location                 | Runs against                      | Command                                  |
| -------------- | ------------------------ | ------------------------ | --------------------------------- | ---------------------------------------- |
| Protocol unit  | vitest                   | `packages/protocol/test` | pure TS                           | `pnpm --filter @downstash/protocol test` |
| Gateway unit   | vitest (node)            | `apps/gateway/test`      | `FakeStorage`                     | `pnpm --filter @downstash/gateway test`  |
| Client unit    | vitest                   | `packages/client/test`   | mocked `fetch`                    | `pnpm --filter @downstash/client test`   |
| Web unit       | vitest + Testing Library | `apps/web/test`          | components, schemas, format       | `pnpm --filter @downstash/web test`      |
| Storage engine | vitest + `postgres`      | `tests/sql`              | local scratch Postgres on :55432  | `pnpm test:sql`                          |
| Compatibility  | vitest + `@upstash/*`    | `tests/compat`           | gateway on :8787 → local Supabase | `pnpm test:compat`                       |
| Differential   | vitest                   | `tests/differential`     | Downstash vs SRH (Redis 7)        | `pnpm test:diff`                         |
| E2E + a11y     | Playwright + axe         | `apps/web/e2e`           | `next dev` + gateway + Supabase   | `pnpm test:e2e`                          |

## Running the live suites locally

The compat and differential suites need two services. `tests/helpers/stack.ts`
boots them for you: a PostgREST shim on :54321 and `wrangler dev` on :8787,
pointed at the scratch Postgres.

```bash
# 1. Load migrations into the scratch database
PGBIN=/opt/homebrew/opt/postgresql@15/bin pnpm db:reset-docs-note || true
./supabase/scripts/pg-local-reset.sh

# 2. Point the suites at it and run
cd tests
TEST_DATABASE_URL="postgres://$USER@127.0.0.1:55432/downstash_test" pnpm test:sql
TEST_DATABASE_URL="postgres://$USER@127.0.0.1:55432/downstash_test" pnpm test:compat
TEST_DATABASE_URL="postgres://$USER@127.0.0.1:55432/downstash_test" pnpm test:diff
```

`pg-local-reset.sh` is the local substitute for `supabase db reset`: it creates
the scratch database, the Supabase-like `extensions` schema and the
`anon`/`authenticated`/`service_role` roles, then loads every migration in
order. No Docker required.

## What each suite proves

- **SQL**: every command's happy path, missing key, wrong type, arity, options,
  TTL interaction, read-only NOPERM, plus 50-way concurrency for INCR, HSET,
  LPUSH, SADD and ZADD.
- **Compat**: the official clients work unchanged, with both response encodings.
- **Differential**: Downstash and real Redis 7 agree, step by step. Anything that
  legitimately differs goes in `docs/engine/commands.md` under "Known
  differences".

## Isolation rules

- Every SQL/compat/differential test file creates its own database with random
  tokens via `createTestDatabase()` and cleans it up in `afterAll`.
- SQL files run serially (`fileParallelism: false`) because they share one
  database.
- Never assert on a global counter (`DBSIZE`, `RANDOMKEY`) without seeding first.

## Related

- [../plan.md §14](../../plan.md) — the specification this file implements.
