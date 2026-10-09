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

| Phase | Focus | Status |
|-------|-------|--------|
| P0 | Scaffolding, docs, design tokens, tooling | DONE |
| P1 | Storage engine command families | DONE |
| P2 | Gateway | DONE |
| P3 | Client SDK | DONE |
| P4 | Scripts + ratelimit capture | IN PROGRESS |
| P5 | Console/web | TODO |
| P6 | Deploy + ops | TODO |
| P7 | Testing (compat/differential) | TODO |
| P8 | Hardening + launch | TODO |

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
  scripts, users/billing, ops/cron, seed.
- **Verification:** `./supabase/scripts/pg-local-reset.sh` loads all 13
  migrations cleanly; hashes/lists/sets/zsets verified against real Postgres.

## P2 — Gateway

- **Status:** DONE
- **Summary:** Worker app, routing, auth + cache, L1 cache, usage buffer, respond.
- **Verification:** 69 gateway unit tests green; `wrangler deploy --dry-run` builds.

## P3 — Client SDK

- **Status:** DONE
- **Summary:** Transport with failover, typed commands, pipeline/multi.
- **Verification:** 13 client unit tests green.

## Deviations

- Local SQL validation uses a scratch Postgres 15 instance via
  `supabase/scripts/pg-local-reset.sh` (no Docker/Supabase CLI required).

## Follow-ups

- Differential/compat suites (`tests/differential`, `tests/compat`) against SRH.
- Console/web app.
