---
title: Progress
status: stable
last_updated: 2026-10-07
updated_by: P0-T1
code_paths:
  - plan.md
---

# Progress

Task tracker. Status is one of `TODO`, `IN PROGRESS`, `DONE`, `BLOCKED`.

## Status summary

| Phase | Focus                                     | Status      |
| ----- | ----------------------------------------- | ----------- |
| P0    | Scaffolding, docs, design tokens, tooling | DONE        |
| P1    | Storage engine command families           | DONE        |
| P2    | Gateway                                   | DONE        |
| P3    | Client SDK                                | DONE        |
| P4    | Scripts + ratelimit capture               | IN PROGRESS |
| P5    | Console/web                               | TODO        |
| P6    | Deploy + ops                              | TODO        |
| P7    | Testing (compat/differential)             | TODO        |
| P8    | Hardening + launch                        | TODO        |

## P0-T1 — Scaffold

- **Status:** DONE
- **Summary:** pnpm workspace, TS base config, ESLint, Prettier, root scripts.
- **Verification:** `pnpm -r typecheck` green.

## P0-T2 — Docs + tooling

- **Status:** DONE
- **Summary:** `docs/` tree, `check-docs`, `check-design`, `gen-token`, `gen-enc-key`.
- **Verification:** `pnpm check:docs` and `pnpm check:design` pass.

## P1-T1..T10 — Storage engine

- **Status:** DONE
- **Summary:** Core schema + engine, all 8 command families (95 commands),
  scripts, users/billing, ops/cron, seed, RPC gateway surface.
- **Verification:** `./supabase/scripts/pg-local-reset.sh` loads all 14
  migrations cleanly; hashes/lists/sets/zsets verified against real Postgres.
- **Fixes made while writing the engine tests:** `to_int` compares in `numeric`
  (19-digit out-of-range values return the friendly error instead of a raw cast
  failure), `dispatch` coalesces a SQL-null handler result to JSON `null`,
  `TTL` rounds once instead of truncating milliseconds first, `RPOP count` no
  longer reorders the popped values, and all `cmd_eval` error paths raise through
  `downstash.raise_err` (errcode `DS000`) so per-command error envelopes and the
  400-status RPC path behave as specified.

## P2 — Gateway

- **Status:** DONE
- **Summary:** Worker app, routing, auth + cache, L1 cache, usage buffer, respond.
- **Verification:** 69 gateway unit tests green; `wrangler deploy --dry-run` builds.

## P3 — Client SDK

- **Status:** DONE
- **Summary:** Transport with failover, typed commands, pipeline/multi.
- **Verification:** 13 client unit tests green.

## Engine test suites

- **Status:** DONE
- **Summary:** Two suites, both green against the scratch Postgres:
  - `supabase/tests/*.sql` — raw PL/pgSQL assertions via
    `node supabase/tests/run-sql.mjs`.
  - `tests/sql/*.test.ts` — vitest suite via
    `TEST_DATABASE_URL=postgres://<user>@127.0.0.1:55432/downstash_test pnpm test:sql`
    (151 tests: schema, engine, helpers, strings, hashes, lists, sets).
- **Verification:** 7/7 SQL files pass; 151/151 vitest tests pass; typecheck,
  lint, format, `check:docs`, `check:design` and `build` all green.
- **Notes:**
  - `tests/tsconfig.json` sets `allowImportingTsExtensions` (the suites import
    `./helpers/*.ts` under `noEmit`).
  - `asAnon` casts the `sql.begin` result (`UnwrapPromiseArray<T>` → `T`);
    `TxSql` uses `Record<string, unknown>` to satisfy
    `@typescript-eslint/no-empty-object-type`.
  - The `postgres` driver serializes string parameters as JSON, so values bound
    against `::jsonb` must be passed as JS arrays, never pre-stringified.
  - Null bytes are unreachable from SQL — Postgres's jsonb parser rejects
    `\u0000` before `to_argv` runs. The gateway/protocol layer rejects them first
    (`packages/protocol/test/argv.test.ts`); the SQL guard is defense-in-depth
    and the SQL test documents that layering.
  - `tests` lint covers `sql` and `helpers`; the compat/differential suites do
    not exist yet, so those directories are not linted.

## Deviations

- Local SQL validation uses a scratch Postgres 15 instance via
  `supabase/scripts/pg-local-reset.sh` (no Docker/Supabase CLI required).
- Engine tests live in two places: raw SQL assertions (`supabase/tests`) and
  the vitest `tests/sql` suite; both run against the same scratch database.

## Follow-ups

- Script capture harness (`tests/capture/capture-scripts.ts`) + native ports
  (P4-T1).
- Compat suite `tests/compat/redis.test.ts` + `ratelimit.test.ts` (P4-T2, P4-T3).
- Differential suite `tests/differential/*` (P4-T4) — needs SRH.
- Console/web app.
