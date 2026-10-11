---
title: Git
status: stable
last_updated: 2026-10-11
updated_by: P0-T1
code_paths:
  - package.json
---

# Git

## Branching

One branch per task: `task/P3-T2-gateway-auth`. Short-lived; merge on green.

## Commit format

```
type(scope): imperative summary [P3-T2]
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `perf`,
`style`.

Scopes: `repo`, `docs`, `db`, `protocol`, `gateway`, `client`, `web`, `ui`,
`tests`, `ci`.

Subject in the imperative, 72 characters maximum, no trailing period. Every
commit carries the task ID in brackets. The body (optional) explains **why** and
lists the docs you updated.

## One task, one commit

Small series are fine when they are all tagged with the same task ID. Never
mix two tasks in one commit — the task ID is how history maps to
`docs/progress.md`.

## Never commit

- Secrets. Only `*.example` env files. `.dev.vars` is gitignored and the test
  stack writes it at runtime and deletes it afterwards.
- `node_modules`, `dist`, `.next`, `.turbo`, `.wrangler`, `playwright-report`,
  `test-results`, `supabase/.temp`.
- Generated output that `pnpm docs:commands` owns (`docs/engine/commands.md` is
  the exception: it is committed on purpose so CI can diff it).

## Fix-forward

A merged migration is append-only. Fix forward with a new migration, explain the
bug in its header, and mention it in the commit body.
