# Downstash — Master Implementation Plan (`plan.md`)

> **Audience:** autonomous coding agents (and humans) building Downstash from zero.
> **Source of truth for product intent:** [`PRD.md`](./PRD.md). **Source of truth for _how_ to build it:** this file.
> **Plan version:** 1.0.0 · **Created:** 2026-10-07 · **Owner:** Downstash core

This plan is written so that _any_ agent, given a single task ID (e.g. `P3-T2`), can produce the same output another agent would. To make that possible it pins versions, file paths, names, SQL, class strings, copy text and acceptance checks. **If something is specified here, do it exactly. If something is not specified, follow the conventions in §5 and record your decision in an ADR (§13.4).**

---

## Table of contents

0. [How agents must use this plan (read first)](#0-how-agents-must-use-this-plan-read-first)
1. [Product summary & scope](#1-product-summary--scope)
2. [Deliberate deviations from the PRD](#2-deliberate-deviations-from-the-prd)
3. [Technology stack (all free)](#3-technology-stack-all-free)
4. [Repository layout](#4-repository-layout)
5. [Engineering conventions](#5-engineering-conventions)
6. [System architecture](#6-system-architecture)
7. [Storage engine specification (Supabase Postgres)](#7-storage-engine-specification-supabase-postgres)
8. [Protocol package specification](#8-protocol-package-specification)
9. [Gateway specification (Cloudflare Worker)](#9-gateway-specification-cloudflare-worker)
10. [Client SDK specification (`@downstash/client`)](#10-client-sdk-specification-downstashclient)
11. [Design system — Neo-brutalism implementation](#11-design-system--neo-brutalism-implementation)
12. [Web app specification (console + landing)](#12-web-app-specification-console--landing)
13. [Documentation system (mandatory)](#13-documentation-system-mandatory)
14. [Testing strategy](#14-testing-strategy)
15. [Deployment, operations & CI](#15-deployment-operations--ci)
16. [Phased task breakdown](#16-phased-task-breakdown)
17. [Appendices](#17-appendices)

---

## 0. How agents must use this plan (read first)

### 0.1 The agent loop (every task, no exceptions)

1. **Orient.** Read, in order: `AGENTS.md` → `docs/README.md` → `docs/codemap.md` → `docs/progress.md` → the task section in §16 → every section of this plan the task references.
2. **Check dependencies.** Every task lists `Depends on`. If any dependency is not `DONE` in `docs/progress.md`, stop and report. Do not start.
3. **Claim.** Set your task row in `docs/progress.md` to `IN PROGRESS` with the date.
4. **Implement** exactly the listed deliverables. Do not create files outside the task's scope. If you _must_, list them under "Extra files" in your progress note and explain why.
5. **Verify.** Run every command under the task's `Acceptance`. All must pass. Paste the summarized output into your progress note.
6. **Document** (§13). At minimum update `docs/codemap.md`, `docs/progress.md`, and every doc listed under the task's `Docs`. Add `@file` headers to every new source file.
7. **Commit** using the format in §5.7. One task = one commit (or a small series, all tagged with the task ID).
8. **Report** in `docs/progress.md`: status `DONE`, what you built, deviations, follow-ups.

### 0.2 Golden rules

| #   | Rule                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | **Never invent APIs.** If unsure how a library works, read its installed types in `node_modules` or the official docs. Don't guess.              |
| G2  | **Never weaken security** to make a test pass (no disabling RLS, no granting `anon` on internal functions, no logging tokens).                   |
| G3  | **Never commit secrets.** Only `*.example` env files are committed.                                                                              |
| G4  | **No paid services.** Every dependency and service must be free (see §3). If you think something paid is needed, write an ADR proposal and stop. |
| G5  | **Wire compatibility beats elegance.** If `@upstash/redis` expects a shape, produce that shape even if it's odd.                                 |
| G6  | **Design tokens only.** UI code never contains raw hex colors, raw shadows, or `rounded-md/lg/xl`. Use the tokens in §11.                        |
| G7  | **Docs are part of the deliverable.** A task with stale docs is not done.                                                                        |
| G8  | **Small, typed, tested.** TypeScript `strict`, no `any`, and tests for every behavior you add.                                                   |
| G9  | **Preserve unrelated code and comments.** Only touch what your task requires.                                                                    |
| G10 | **When this plan conflicts with the PRD, this plan wins** (deviations are justified in §2).                                                      |

### 0.3 Glossary (use these words consistently in code, docs and UI)

| Term                                 | Meaning                                                                                | Don't say                            |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------ |
| **Gateway**                          | The Cloudflare Worker (`apps/gateway`) that speaks the Upstash REST protocol           | "edge server", "proxy"               |
| **Storage engine**                   | Supabase Postgres + the `downstash` schema & PL/pgSQL functions                        | "backend DB"                         |
| **Console**                          | The authenticated dashboard in `apps/web` (`/redis/...`)                               | "admin panel"                        |
| **Landing**                          | The public marketing page in `apps/web` (`/`)                                          | "homepage" in code                   |
| **Database**                         | A logical Redis database owned by a workspace (a row in `downstash.databases`)         | "instance", "project"                |
| **Workspace**                        | Owner of databases: the Clerk organization ID if one is active, else the Clerk user ID | "tenant", "account"                  |
| **Standard token / Read-only token** | The two bearer tokens per database                                                     | "API key", "password"                |
| **Direct-RPC failover**              | SDK falling back to Supabase PostgREST when the gateway is out of quota or down        | "backup mode"                        |
| **L1 cache**                         | Per-isolate in-memory read cache inside the gateway                                    | "edge cache" in code (OK in UI copy) |
| **Command**                          | One Redis command as an argv array, e.g. `["SET","k","v"]`                             | "query"                              |

---

## 1. Product summary & scope

Downstash is a **self-hosted, $0/month, Upstash-wire-compatible serverless Redis & rate-limit engine**:

- **Gateway**: Cloudflare Worker (Hono). It implements Upstash's REST protocol (`POST /`, `POST /pipeline`, `POST /multi-exec`, path commands), so official `@upstash/redis` and `@upstash/ratelimit` clients work unchanged.
- **Storage engine**: Supabase Postgres. An `UNLOGGED` JSONB key-value table plus PL/pgSQL functions that run every command atomically.
- **Failover**: the `@downstash/client` SDK falls back to Supabase PostgREST RPC when the gateway returns 429/5xx or can't be reached.
- **Console**: a Next.js dashboard that copies the **UX of the Upstash console** (database list → create → details/connect → usage → data browser → CLI → settings) with a **completely different UI**: Neo-brutalism (§11).
- **Auth**: Clerk (users + optional organizations as workspaces).

### 1.1 In scope (v1.0)

| Area           | Included                                                                                                                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Protocol       | `POST /`, `POST /pipeline`, `POST /multi-exec`, `GET                                                                                                                                             | POST /<cmd>/<arg>/...`, `GET /health`, `Upstash-Encoding: base64`, `\_token` query auth, CORS |
| Commands       | Full matrix in §7.8 (strings, keyspace, expiry, hashes, lists, sets, sorted sets, server, scripting-for-ratelimit)                                                                               |
| Ratelimit      | All `@upstash/ratelimit` single-region algorithms (fixed window, sliding window, token bucket, cached fixed window) + `getRemaining` + `resetUsedTokens`                                         |
| Multi-database | Unlimited databases per workspace (soft cap via env), two tokens each                                                                                                                            |
| Console        | Database list, create, details/connect snippets, usage charts, data browser (CRUD for all types), web CLI, settings (rename, L1 cache, token rotation, flush, delete), quotas page, account page |
| Landing        | Single-page marketing site                                                                                                                                                                       |
| SDK            | `@downstash/client`: standalone `Downstash` class + `createDownstashRequester()` for `@upstash/redis` with failover                                                                              |
| Ops            | pg_cron TTL sweeper, usage retention, keep-alive cron trigger, CI on GitHub Actions                                                                                                              |
| Docs           | Full documentation system (§13)                                                                                                                                                                  |

### 1.2 Out of scope (v1.0) — do NOT build

Raw TCP/RESP, Pub/Sub, Streams, RedisJSON, arbitrary Lua execution, billing/payments, multi-region replication, backups UI (Supabase handles backups), QStash/Vector-like products, Upstash Developer API, dark mode (the design system is light-only), i18n.

---

## 2. Deliberate deviations from the PRD

Each deviation below must also be written up as an ADR in `docs/adr/` during `P0-T2` (files listed).

| #   | PRD says                                                        | Plan does                                                                                                                                                                                                                                               | Why                                                                                                                 | ADR                               |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| D1  | One table `public.downstash_kv`, one global token               | Multi-database: `downstash.kv` keyed by `(db_id, key)`, per-database standard + read-only tokens                                                                                                                                                        | The console UX (copied from Upstash) is built around many databases per user                                        | `0001-multi-database-keyspace.md` |
| D2  | Tables/functions in `public`                                    | Internals live in a private `downstash` schema that PostgREST doesn't expose. Only 5 vetted functions live in `public`                                                                                                                                  | Supabase exposes `public` over REST to the `anon` key. Internal functions there would be a data leak                | `0002-private-schema.md`          |
| D3  | `downstash_exec(p_cmd, p_args)` callable with the Supabase key  | `public.downstash_exec(p_token, p_cmd, p_args)`. The **Downstash token** is checked inside Postgres; the Supabase anon (publishable) key only gets you to PostgREST                                                                                     | With the PRD signature, anyone holding the public anon key could read and write every database                      | `0003-token-checked-failover.md`  |
| D4  | Bearer token compared with `timingSafeEqual` against one secret | Tokens are SHA-256 hashed at the gateway; the hash is looked up in Postgres (cached per isolate). Malformed tokens are rejected with no DB call. Known-bad hashes are negatively cached. The final hash comparison uses `crypto.subtle.timingSafeEqual` | Needed for multiple databases, and stays constant-time                                                              | `0004-token-format-and-auth.md`   |
| D5  | Command semantics partly in the Worker ("AST parser")           | **All command semantics live in PL/pgSQL.** The gateway only normalizes, validates arity, caches and encodes                                                                                                                                            | Direct-RPC failover must behave _identically_. A single implementation guarantees it                                | `0005-sql-is-the-engine.md`       |
| D6  | Coverage matrix (§5 of PRD)                                     | Extended matrix (§7.8) incl. `PX`, `PEXPIRE`, `HMGET`, `SCAN`, `TYPE`, sorted sets, `EVAL/EVALSHA`                                                                                                                                                      | `@upstash/ratelimit` uses `EVALSHA` scripts that call `PEXPIRE`, `HMGET`, etc. The data browser needs `SCAN`/`TYPE` | `0006-command-matrix.md`          |
| D7  | `EVAL` not mentioned                                            | `EVAL`/`EVALSHA`/`SCRIPT` work only for a **registry of known scripts** (matched by SHA-1), each ported to native PL/pgSQL                                                                                                                              | Ratelimit compatibility without running a Lua VM in a 10 ms CPU budget                                              | `0007-script-registry.md`         |
| D8  | Values stored as raw JSONB (numbers stay numbers)               | Every Redis string is stored as a **JSONB string**. `INCR` writes `"2"`, not `2`                                                                                                                                                                        | Redis strings are byte strings. `GET` after `INCR` must return `"2"` (the PRD's own example shows `"1"`)            | `0008-value-encoding.md`          |
| D9  | L1 cache always on                                              | L1 cache is **per database, off by default** (`l1_ttl_ms = 0`), max 10 000 ms, toggled in Settings                                                                                                                                                      | Isolates aren't coherent with each other, so silent staleness would break sessions/locks                            | `0009-l1-cache-opt-in.md`         |
| D10 | pg_cron "prevents 7-day pause"                                  | pg_cron sweeper **plus** a Worker Cron Trigger that calls the DB every 6 h through the REST API                                                                                                                                                         | Supabase measures project activity through its API; internal cron jobs alone may not count                          | `0010-keep-alive.md`              |
| D11 | —                                                               | Control plane (databases, tokens, usage) stored in the same Supabase project, in **logged** tables                                                                                                                                                      | $0 budget; one database to operate                                                                                  | `0011-control-plane-colocated.md` |
| D12 | —                                                               | Console talks to Postgres directly over the Supabase **transaction pooler** (`DATABASE_URL`) using the `postgres` npm driver, not supabase-js                                                                                                           | Private schema access, typed SQL, no extra RPC surface                                                              | `0012-console-direct-sql.md`      |

> [!WARNING] > `UNLOGGED` tables are **truncated after a Postgres crash or unclean restart**. That's acceptable for cache and rate-limit data, which is what the PRD targets. Document it in `docs/ops/durability.md` and on the Landing FAQ. The command `pnpm db:durable` (P1-T9) generates a migration that switches the table to `LOGGED` for users who need durability.

---

## 3. Technology stack (all free)

### 3.1 Services

| Concern                   | Choice                                                            | Free tier used                                 | Notes                                                                                   |
| ------------------------- | ----------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------- |
| Gateway hosting           | **Cloudflare Workers (Free)**                                     | 100 000 req/day, 10 ms CPU/req                 | `wrangler deploy`                                                                       |
| Storage + control plane   | **Supabase (Free)**                                               | 500 MB DB, pg_cron, PostgREST                  | One project                                                                             |
| Console/landing hosting   | **Vercel (Hobby)**                                                | Free for personal/non-commercial               | Alternative documented: Cloudflare Workers via OpenNext (`docs/ops/deploy.md` appendix) |
| Auth                      | **Clerk (Free plan)**                                             | Free monthly active users quota, organizations | Keyless mode works in local dev                                                         |
| CI                        | **GitHub Actions**                                                | Free minutes for public repos                  |                                                                                         |
| Reference Redis for tests | **Docker `redis:7-alpine` + `hiett/serverless-redis-http` (SRH)** | Free, local                                    | Upstash-compatible REST proxy used for differential testing                             |
| Fonts                     | **Google Fonts via `next/font`**                                  | Free                                           | Space Grotesk, Space Mono                                                               |

### 3.2 Toolchain & libraries (pin these majors; commit `pnpm-lock.yaml`)

| Package                                                                                                                          | Version                                                                                                | Where                | Purpose                       |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------- | ----------------------------- |
| Node.js                                                                                                                          | `22.x` LTS (`.nvmrc` = `22`)                                                                           | all                  | runtime                       |
| pnpm                                                                                                                             | `9.15.x` (`packageManager` field)                                                                      | root                 | workspaces                    |
| turbo                                                                                                                            | `^2`                                                                                                   | root                 | task runner                   |
| typescript                                                                                                                       | `^5.7`                                                                                                 | all                  |                               |
| eslint                                                                                                                           | `^9` (flat config) + `typescript-eslint ^8` + `eslint-plugin-react-hooks` + `@next/eslint-plugin-next` | root                 | lint                          |
| prettier                                                                                                                         | `^3` + `prettier-plugin-tailwindcss`                                                                   | root                 | format                        |
| vitest                                                                                                                           | `^3`                                                                                                   | all                  | unit/integration tests        |
| supabase (CLI, devDependency)                                                                                                    | `^2`                                                                                                   | root                 | local Postgres, migrations    |
| postgres                                                                                                                         | `^3.4`                                                                                                 | web, tests           | SQL driver (porsager)         |
| hono                                                                                                                             | `^4`                                                                                                   | gateway              | router                        |
| wrangler                                                                                                                         | `^4`                                                                                                   | gateway              | dev/deploy                    |
| @cloudflare/workers-types                                                                                                        | latest                                                                                                 | gateway              | types                         |
| next                                                                                                                             | `15.x` (pin major 15)                                                                                  | web                  | App Router                    |
| react / react-dom                                                                                                                | `19.x`                                                                                                 | web                  |                               |
| @clerk/nextjs                                                                                                                    | `^6`                                                                                                   | web                  | auth                          |
| @clerk/testing                                                                                                                   | `^1`                                                                                                   | web (dev)            | Playwright auth               |
| tailwindcss + @tailwindcss/postcss                                                                                               | `^4`                                                                                                   | web                  | styling (CSS-first `@theme`)  |
| class-variance-authority                                                                                                         | `^0.7`                                                                                                 | web                  | component variants            |
| clsx + tailwind-merge                                                                                                            | `^2` / `^3`                                                                                            | web                  | `cn()`                        |
| @radix-ui/react-\* (dialog, dropdown-menu, select, tabs, switch, tooltip, accordion, alert-dialog, slot, label, visually-hidden) | latest `^1`/`^2`                                                                                       | web                  | accessible primitives         |
| lucide-react                                                                                                                     | latest                                                                                                 | web                  | icons                         |
| recharts                                                                                                                         | `^2.15`                                                                                                | web                  | charts                        |
| sonner                                                                                                                           | `^2`                                                                                                   | web                  | toasts                        |
| react-fast-marquee                                                                                                               | `^1.6`                                                                                                 | web                  | marquees                      |
| shiki                                                                                                                            | `^3`                                                                                                   | web                  | server-side code highlighting |
| zod                                                                                                                              | `^3.24`                                                                                                | web, client          | validation                    |
| server-only                                                                                                                      | latest                                                                                                 | web                  | guard                         |
| @playwright/test + @axe-core/playwright                                                                                          | `^1` / `^4`                                                                                            | web (dev)            | e2e + a11y                    |
| @upstash/redis                                                                                                                   | latest `1.x`, **exact pin** (no caret)                                                                 | tests, client (peer) | compat target                 |
| @upstash/ratelimit                                                                                                               | latest `2.x`, **exact pin** (no caret)                                                                 | tests                | compat target                 |
| tsup                                                                                                                             | `^8`                                                                                                   | client               | build SDK                     |

> [!IMPORTANT] > `@upstash/redis` and `@upstash/ratelimit` are pinned **exactly**. Their wire behavior (script bodies, SHA-1s, headers) is a contract. Bumping either requires re-running `P4-T1`'s script capture and the full compat suite, then an ADR.

---

## 4. Repository layout

Create exactly this structure (files appear as tasks deliver them). `docs/codemap.md` mirrors it with one line per file.

```text
downstash/
├── AGENTS.md                      # Entry point for agents (P0-T1)
├── PRD.md                         # Product requirements (given)
├── plan.md                        # This plan
├── README.md                      # Public readme (P9-T3)
├── CHANGELOG.md                   # Keep a Changelog format
├── LICENSE                        # MIT
├── package.json                   # root scripts, packageManager
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── eslint.config.mjs
├── prettier.config.mjs
├── .editorconfig  .nvmrc  .gitignore  .gitattributes
├── .github/workflows/{ci.yml,deploy-gateway.yml}
├── scripts/
│   ├── gen-token.ts               # prints a fresh token pair + hashes (dev helper)
│   ├── gen-enc-key.ts             # prints a base64 32-byte key
│   ├── make-durable.ts            # writes a migration switching kv to LOGGED
│   └── check-docs.ts              # verifies @file headers + codemap coverage
├── supabase/
│   ├── config.toml
│   ├── seed.sql                   # dev/test database + fixed tokens
│   └── migrations/
│       ├── 20261007000100_core_schema.sql
│       ├── 20261007000200_core_engine.sql
│       ├── 20261007000300_cmd_server.sql
│       ├── 20261007000400_cmd_strings.sql
│       ├── 20261007000500_cmd_keyspace.sql
│       ├── 20261007000600_cmd_hashes.sql
│       ├── 20261007000700_cmd_lists.sql
│       ├── 20261007000800_cmd_sets.sql
│       ├── 20261007000900_cmd_zsets.sql
│       ├── 20261007001000_ops_cron_stats.sql
│       └── 20261007001100_scripts_ratelimit.sql
├── packages/
│   ├── protocol/                  # @downstash/protocol (internal, TS source)
│   │   ├── package.json
│   │   ├── src/{index.ts,commands.ts,argv.ts,encoding.ts,errors.ts,token.ts,types.ts,format-cli.ts,tokenize-cli.ts}
│   │   ├── scripts/gen-commands-doc.ts
│   │   └── test/*.test.ts
│   └── client/                    # @downstash/client (publishable)
│       ├── package.json  tsup.config.ts  README.md
│       ├── src/{index.ts,downstash.ts,requester.ts,transport.ts,errors.ts,types.ts}
│       └── test/*.test.ts
├── apps/
│   ├── gateway/                   # @downstash/gateway (Cloudflare Worker)
│   │   ├── package.json  wrangler.jsonc  .dev.vars.example  tsconfig.json  vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts           # Worker entry: fetch + scheduled
│   │   │   ├── app.ts             # createApp(deps): Hono
│   │   │   ├── env.ts
│   │   │   ├── routes/{health.ts,commands.ts}
│   │   │   ├── middleware/{cors.ts,body-limit.ts,errors.ts}
│   │   │   ├── core/{auth.ts,auth-cache.ts,l1-cache.ts,encoding.ts,request-parse.ts,usage-buffer.ts,respond.ts}
│   │   │   ├── storage/{storage.ts,postgrest-storage.ts}
│   │   │   └── scheduled.ts
│   │   └── test/*.test.ts
│   └── web/                       # @downstash/web (Next.js 15)
│       ├── package.json  next.config.ts  postcss.config.mjs  tsconfig.json  .env.example
│       ├── middleware.ts
│       ├── playwright.config.ts  e2e/*.spec.ts
│       ├── app/                   # see §12.2 for the full route tree
│       ├── components/{ui,brand,console,marketing}/
│       ├── features/{databases,details,usage,browser,cli,settings,quotas}/
│       ├── lib/{env.ts,db.ts,engine.ts,crypto.ts,tokens.ts,auth.ts,format.ts,utils.ts,action-result.ts,shiki.ts,clerk-appearance.ts}
│       └── test/*.test.ts(x)
├── tests/                         # @downstash/tests (private workspace package)
│   ├── package.json  vitest.config.ts  docker-compose.yml
│   ├── helpers/{sql.ts,gateway.ts,srh.ts,fixtures.ts}
│   ├── sql/*.test.ts              # storage engine tests (direct SQL)
│   ├── compat/*.test.ts           # @upstash/redis + @upstash/ratelimit against gateway
│   ├── differential/*.test.ts     # same corpus vs SRH reference, results compared
│   └── capture/capture-scripts.ts # P4-T1 script capture harness
└── docs/                          # §13
```

---

## 5. Engineering conventions

These are the summary rules. The full guides live in `docs/conventions/*` (written in `P0-T2`, content specified in §13.3).

### 5.1 TypeScript

- `tsconfig.base.json`: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": false`, `"noImplicitOverride": true`, `"verbatimModuleSyntax": true`, `"moduleResolution": "Bundler"`, `"module": "ESNext"`, `"target": "ES2022"`, `"skipLibCheck": true`, `"isolatedModules": true`.
- No `any`. Use `unknown` + narrowing. `// eslint-disable` needs a reason comment.
- **Named exports only**, except where frameworks require default exports (Next.js `page.tsx`, `layout.tsx`, `route.ts` handlers, `error.tsx`, `loading.tsx`, `not-found.tsx`, Worker `index.ts`).
- Files: `kebab-case.ts(x)`. React components: `PascalCase` exports. Hooks: `use-thing.ts` exporting `useThing`. Types: `PascalCase`. Constants: `SCREAMING_SNAKE_CASE`.
- Path alias in web: `@/*` → `apps/web/*`.
- Import order (enforced by eslint `import/order` or manual): node builtins → external → `@downstash/*` → `@/` → relative. Blank line between groups.

### 5.2 Comments & file headers

Every source file (TS, TSX, SQL, scripts) starts with a header. `scripts/check-docs.ts` enforces it in CI.

```ts
/**
 * @file Gateway command routes: POST /, /pipeline, /multi-exec and path commands.
 * @module apps/gateway/routes/commands
 * @see docs/gateway/request-lifecycle.md
 */
```

```sql
-- @file Hash commands (HSET, HGET, ...). Registered in downstash.command_registry.
-- @see docs/engine/commands.md
```

- Every exported function, class, type and component gets a TSDoc block: one-line summary, then `@param`/`@returns`/`@throws` where non-obvious.
- Comment the **why**, not the what.

### 5.3 Errors

- **Storage engine:** raise Redis-style messages only through `downstash.raise_err(text)` (§7.4). Messages come from the catalog in §17.2.
- **Gateway:** never throws to the runtime. Every error becomes a JSON `{ "error": string }` with the right status (§9.6).
- **Web server actions:** never throw across the boundary. Return `ActionResult<T>` (§12.6).
- **SDK:** throws `DownstashError` (with `.command` and `.source: "gateway" | "rpc"`).

### 5.4 Logging

- Gateway: `console.log(JSON.stringify({ level, msg, ...fields }))`, only for 5xx and cron. **Never log tokens, token hashes, keys or values.**
- Web: `console.error('[module] message', { safeFields })` on the server only.

### 5.5 SQL style

- Lowercase keywords, 2-space indent, always schema-qualified (`downstash.kv`, `pg_catalog.now()` not needed — but tables/functions always qualified).
- Params `p_*`, locals `v_*`, records `r_*`.
- Command handlers are named `downstash.cmd_<lowercase_command>` with signature `(p_db uuid, p_args text[]) returns jsonb`.
- Every function is preceded by a doc comment block (Command, Syntax, Returns, Errors) and gets a `comment on function`.
- `security definer` functions **must** `set search_path = ''`.
- Migrations are append-only once merged. Fix forward with a new migration. Use `create or replace function` and `insert ... on conflict do update` so they can be re-applied.

### 5.6 React / Next.js

- Server Components by default. Add `'use client'` only for interactivity, as low in the tree as possible.
- Data reads: `features/<feature>/queries.ts` (`import 'server-only'`). Mutations: `features/<feature>/actions.ts` (`'use server'`). Validation: `features/<feature>/schemas.ts` (zod).
- Components never call `fetch` to our own API routes. Use server actions.
- Styling only via Tailwind classes built from tokens + `cn()`. No CSS modules, no inline `style` except for computed values (chart widths, progress percentages).

### 5.7 Git

- Branch per task: `task/P3-T2-gateway-auth`.
- Conventional Commits: `type(scope): imperative summary [P3-T2]`.
  - types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci`, `perf`, `style`
  - scopes: `repo`, `docs`, `db`, `protocol`, `gateway`, `client`, `web`, `ui`, `tests`, `ci`
- Example: `feat(db): add hash commands HSET..HINCRBYFLOAT [P1-T5]`.

### 5.8 Root scripts (`package.json`)

```jsonc
{
  "name": "downstash",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "engines": { "node": ">=22" },
  "scripts": {
    "dev": "turbo run dev --parallel --filter=@downstash/gateway --filter=@downstash/web",
    "build": "turbo run build",
    "lint": "turbo run lint && eslint .",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "db:start": "supabase start",
    "db:stop": "supabase stop",
    "db:reset": "supabase db reset",
    "db:push": "supabase db push",
    "db:durable": "tsx scripts/make-durable.ts",
    "test:sql": "pnpm --filter @downstash/tests test:sql",
    "test:compat": "pnpm --filter @downstash/tests test:compat",
    "test:diff": "pnpm --filter @downstash/tests test:diff",
    "test:e2e": "pnpm --filter @downstash/web test:e2e",
    "docs:commands": "pnpm --filter @downstash/protocol gen:docs",
    "docs:check": "tsx scripts/check-docs.ts",
    "gen:token": "tsx scripts/gen-token.ts",
    "gen:enc-key": "tsx scripts/gen-enc-key.ts"
  }
}
```

`turbo.json` tasks: `build` (dependsOn `^build`, outputs `dist/**`, `.next/**`, excluding `.next/cache/**`), `dev` (cache false, persistent true), `lint`, `typecheck` (dependsOn `^build` for client only), `test` (dependsOn `^build`).

---

## 6. System architecture

### 6.1 Topology

```mermaid
flowchart TD
    subgraph Clients
        A["App using @upstash/redis / @upstash/ratelimit"]
        B["App using @downstash/client (with failover)"]
        C["curl / browser (path commands)"]
    end

    subgraph CF["Cloudflare Worker: apps/gateway"]
        G1["CORS + body limit"]
        G2["Token shape check + SHA-256"]
        G3["Auth cache (positive 60s / negative 30s)"]
        G4["L1 cache (opt-in per database)"]
        G5["Request parse + argv normalize + arity precheck"]
        G6["PostgREST storage adapter"]
        G7["Response encoder (base64 opt-in)"]
    end

    subgraph SB["Supabase Postgres"]
        P1["public.downstash_gw_run (service_role only)"]
        P2["public.downstash_exec / _pipeline / _multi (anon OK, token checked)"]
        E1["downstash.run → downstash.dispatch → downstash.cmd_*"]
        E2["downstash.kv (UNLOGGED)"]
        E3["downstash.databases / tokens / usage_hourly / db_stats_daily"]
        CR["pg_cron: sweeper 1m, stats 10m, retention daily"]
    end

    subgraph WEB["Next.js: apps/web (Vercel)"]
        W1["Landing /"]
        W2["Console /redis/... (Clerk-protected)"]
        W3["Server actions → postgres driver → downstash.*"]
    end

    A -->|"POST / /pipeline /multi-exec"| G1
    B -->|primary| G1
    C --> G1
    G1 --> G2 --> G3 --> G4 --> G5 --> G6 -->|"HTTPS RPC"| P1 --> E1 --> E2
    G6 --> G7
    B -.->|"on 429/5xx/network error"| P2 --> E1
    W2 --> W3 -->|"SQL over pooler"| E1
    W3 --> E3
    CR --> E2
    CR --> E3
```

### 6.2 Request lifecycle (gateway, single command)

```mermaid
sequenceDiagram
    participant C as Client
    participant G as Gateway
    participant P as PostgREST
    participant S as downstash.run
    C->>G: POST / ["GET","k"] + Bearer dsk_...
    G->>G: CORS / size check / token regex
    G->>G: sha256(token) → hash
    alt hash in negative cache
        G-->>C: 401 {"error":"Unauthorized"}
    else positive cache hit AND db.l1TtlMs > 0 AND cacheable AND L1 hit
        G-->>C: 200 {"result": ...} (L1, l1Hits++)
    else
        G->>P: POST /rest/v1/rpc/downstash_gw_run {p_token_hash, p_mode, p_commands, p_l1_hits, p_bytes_in, p_bytes_out}
        P->>S: run(db, readonly, commands, 'gateway', ...)
        S-->>P: {"ok":true,"db":..,"readonly":..,"l1TtlMs":..,"results":[...]}
        P-->>G: JSON
        G->>G: update auth cache, L1 cache (store or invalidate)
        G-->>C: 200/400 {"result":...} or {"error":...} (base64 if requested)
    end
```

### 6.3 Single-implementation rule

All Redis semantics live in `downstash.dispatch` and `downstash.cmd_*`. The gateway, the failover RPC and the console's data browser/CLI **all** call `downstash.run`. Any new command is added in SQL first (§7.10). The TS registry mirror (§8.2) exists only for early validation and UI metadata, and a parity test keeps it in sync.

---

## 7. Storage engine specification (Supabase Postgres)

### 7.1 Schemas, roles and exposure

| Object                                                                                                              | Schema      | Exposed via PostgREST?     | Callable by                                                              |
| ------------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------- | ------------------------------------------------------------------------ |
| Tables `databases`, `tokens`, `kv`, `usage_hourly`, `db_stats_daily`, `scan_cursors`, `command_registry`, `scripts` | `downstash` | **No** (schema not in API) | `postgres` (console, migrations)                                         |
| `downstash.*` functions                                                                                             | `downstash` | No                         | `postgres`                                                               |
| `public.downstash_gw_run`, `public.downstash_gw_ping`                                                               | `public`    | Yes                        | **`service_role` only**                                                  |
| `public.downstash_exec`, `public.downstash_pipeline`, `public.downstash_multi`                                      | `public`    | Yes                        | `anon`, `authenticated`, `service_role` (Downstash token checked inside) |

Every migration that creates a `public` function must:

1. `revoke all on function ... from public, anon, authenticated;` (Supabase grants new functions to these roles by default.)
2. `grant execute on function ... to <allowed roles>;`
3. End with `notify pgrst, 'reload schema';`

### 7.2 Migration `20261007000100_core_schema.sql` (write exactly)

```sql
-- @file Core schema: private `downstash` schema, control-plane tables and the UNLOGGED keyspace.
-- @see docs/engine/schema.md

create extension if not exists pgcrypto with schema extensions;

create schema if not exists downstash;
revoke all on schema downstash from public;
revoke all on schema downstash from anon, authenticated;

-- Databases: one logical Redis database per row, owned by a workspace (Clerk org id or user id).
create table if not exists downstash.databases (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  name         text not null check (name ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  l1_ttl_ms    integer not null default 0 check (l1_ttl_ms between 0 and 10000),
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists databases_workspace_idx on downstash.databases (workspace_id, created_at desc);

-- Tokens: SHA-256 hash for lookup; AES-256-GCM ciphertext so the console can reveal it.
create table if not exists downstash.tokens (
  id          uuid primary key default gen_random_uuid(),
  db_id       uuid not null references downstash.databases (id) on delete cascade,
  kind        text not null check (kind in ('standard', 'readonly')),
  token_hash  bytea not null unique,
  token_enc   text,           -- 'v1:<iv_b64>:<ciphertext_and_tag_b64>'; null only for seed tokens
  token_hint  text not null,  -- e.g. 'dsk_Ab3x…9QzT'
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create unique index if not exists tokens_one_active_per_kind
  on downstash.tokens (db_id, kind) where revoked_at is null;

-- Keyspace. UNLOGGED = no WAL = fast writes, truncated on crash (see docs/ops/durability.md).
-- key uses the "C" collation so btree prefix scans (KEYS/SCAN) and byte ordering work.
create unlogged table if not exists downstash.kv (
  db_id      uuid not null references downstash.databases (id) on delete cascade,
  key        text collate "C" not null,
  type       text not null check (type in ('string', 'hash', 'list', 'set', 'zset')),
  val        jsonb not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (db_id, key)
);
create index if not exists kv_expires_at_idx on downstash.kv (expires_at) where expires_at is not null;

-- Usage counters, one row per database per UTC hour.
create table if not exists downstash.usage_hourly (
  db_id             uuid not null references downstash.databases (id) on delete cascade,
  hour              timestamptz not null,
  requests          bigint not null default 0,
  commands          bigint not null default 0,
  reads             bigint not null default 0,
  writes            bigint not null default 0,
  errors            bigint not null default 0,
  l1_hits           bigint not null default 0,
  failover_requests bigint not null default 0,
  console_commands  bigint not null default 0,
  bytes_in          bigint not null default 0,
  bytes_out         bigint not null default 0,
  primary key (db_id, hour)
);

-- Storage snapshots, one row per database per UTC day (overwritten every 10 minutes).
create table if not exists downstash.db_stats_daily (
  db_id       uuid not null references downstash.databases (id) on delete cascade,
  day         date not null,
  keys        bigint not null,
  bytes       bigint not null,
  computed_at timestamptz not null default now(),
  primary key (db_id, day)
);

-- SCAN cursors: numeric cursor id -> last key returned. Swept after 10 minutes.
create unlogged table if not exists downstash.scan_cursors (
  id         bigint generated always as identity primary key,
  db_id      uuid not null,
  last_key   text collate "C" not null,
  created_at timestamptz not null default now()
);

-- Command registry: the single source of truth for command metadata.
create table if not exists downstash.command_registry (
  name      text primary key check (name = upper(name)),
  handler   regproc not null,
  arity     smallint not null,     -- Redis convention: includes the command name; negative = minimum
  flags     text[] not null,       -- subset of {read, write, cacheable, admin, script}
  first_key smallint not null,     -- Redis convention (argv[0] = command); 0 = no keys
  last_key  smallint not null,     -- -1 = last argument
  key_step  smallint not null,
  family    text not null check (family in ('strings','keyspace','hashes','lists','sets','zsets','server','scripting')),
  summary   text not null
);

-- Known Lua scripts (by SHA-1) mapped to native PL/pgSQL ports. See docs/engine/scripts.md.
create table if not exists downstash.scripts (
  sha1     text primary key check (sha1 ~ '^[0-9a-f]{40}$'),
  name     text not null,
  handler  regproc not null,       -- (p_db uuid, p_keys text[], p_argv text[]) returns jsonb
  is_write boolean not null,
  source   text not null,          -- exact Lua body
  origin   text not null           -- e.g. '@upstash/ratelimit@2.0.5 fixedWindowLimitScript'
);

alter table downstash.databases        enable row level security;
alter table downstash.tokens           enable row level security;
alter table downstash.kv               enable row level security;
alter table downstash.usage_hourly     enable row level security;
alter table downstash.db_stats_daily   enable row level security;
alter table downstash.scan_cursors     enable row level security;
alter table downstash.command_registry enable row level security;
alter table downstash.scripts          enable row level security;
```

> [!NOTE]
> Postgres allows an UNLOGGED table to reference a permanent table. If `supabase db reset` rejects the `kv → databases` FK on your Postgres version, drop the FK, delete keys explicitly in `downstash.delete_database()`, and record that in an ADR.

### 7.3 Value encoding (ADR 0008)

| Redis type | `type`   | `val` JSONB shape                     | Example                     |
| ---------- | -------- | ------------------------------------- | --------------------------- |
| String     | `string` | JSON **string**, always (numbers too) | `"hello"`, `"42"`           |
| Hash       | `hash`   | object field → string                 | `{"name":"alex","age":"3"}` |
| List       | `list`   | array of strings, index 0 = head      | `["c","b","a"]`             |
| Set        | `set`    | object member → `1`                   | `{"a":1,"b":1}`             |
| Sorted set | `zset`   | object member → JSON number (score)   | `{"alice":1.5,"bob":3}`     |

Rules:

- **Empty collections are never stored.** A command that would leave a hash/list/set/zset empty deletes the key.
- **Null bytes (`\u0000`) aren't supported.** JSONB can't store them. The gateway rejects them and SQL `to_argv` rejects them too: `ERR Downstash: null bytes are not supported`.
- **Max key size: 2000 bytes (UTF-8)**, because of the btree index entry limit. Error: `ERR Downstash: key exceeds 2000 bytes`.
- Infinite sorted-set scores (`+inf`/`-inf`) are accepted **as range bounds only**. Storing them errors with `ERR Downstash: infinite scores are not supported`.

### 7.4 Reply mapping (Redis RESP2 → JSON)

| RESP2 reply            | JSON in `result`                          | Examples                                                         |
| ---------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| Simple string          | string                                    | `"OK"`, `"PONG"`, `"string"` (TYPE)                              |
| Bulk string            | string                                    | `GET` → `"v"`; `INCRBYFLOAT` → `"10.5"`; `ZSCORE` → `"1.5"`      |
| Null bulk / null array | `null`                                    | `GET missing`                                                    |
| Integer                | number                                    | `INCR` → `2`, `EXISTS` → `1`                                     |
| Array                  | array (may nest)                          | `HGETALL` → `["f1","v1","f2","v2"]`, `SCAN` → `["17",["a","b"]]` |
| Error                  | `{"error": "..."}` envelope, not `result` | `WRONGTYPE ...`                                                  |

Float formatting (`downstash.fmt_float(double precision)`): use Postgres `float8::text` (shortest round-trip). Integral values print without a decimal point (`10`, not `10.0`), which matches Redis.

### 7.5 Engine core: migration `20261007000200_core_engine.sql`

Implement these functions **with exactly these names and signatures**. Every one is `set search_path = ''` and fully schema-qualified. `extensions.digest` is used for hashing.

| Function                    | Signature                                                                                                                                                            | Behavior                                                                                                                                                                                                                                                                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `downstash.raise_err`       | `(p_message text) returns void`                                                                                                                                      | `raise exception using message = p_message, errcode = 'DS000';` Command errors **only** use this.                                                                                                                                                                                                                                     |
| `downstash.err_args`        | `(p_cmd text) returns void`                                                                                                                                          | `raise_err(format('ERR wrong number of arguments for ''%s'' command', lower(p_cmd)))`                                                                                                                                                                                                                                                 |
| `downstash.to_int`          | `(p_text text, p_message text default 'ERR value is not an integer or out of range') returns bigint`                                                                 | Accept `^(0\|-?[1-9][0-9]{0,18})$`, then check the range using `numeric`. **No exception blocks.**                                                                                                                                                                                                                                    |
| `downstash.to_float`        | `(p_text text, p_allow_inf boolean default false, p_message text default 'ERR value is not a valid float') returns double precision`                                 | Accept `^[+-]?([0-9]+(\.[0-9]*)?\|\.[0-9]+)([eE][+-]?[0-9]+)?$`. If `p_allow_inf`, also accept `inf`/`+inf`/`-inf` (any case). Reject NaN.                                                                                                                                                                                            |
| `downstash.fmt_float`       | `(p_value double precision) returns text`                                                                                                                            | `p_value::text`; map `Infinity` → `inf`, `-Infinity` → `-inf`.                                                                                                                                                                                                                                                                        |
| `downstash.check_key`       | `(p_key text) returns void`                                                                                                                                          | `octet_length(p_key) > 2000` → error from §7.3.                                                                                                                                                                                                                                                                                       |
| `downstash.read_live`       | `(p_db uuid, p_key text, p_type text) returns downstash.kv`                                                                                                          | Non-locking read. Returns a null row (check `r.key is null`) if missing/expired. Raises WRONGTYPE if `p_type` is not null and differs.                                                                                                                                                                                                |
| `downstash.lock_live`       | `(p_db uuid, p_key text, p_type text) returns downstash.kv`                                                                                                          | `select ... for update`. If expired: `delete` it and return a null row. WRONGTYPE check as above.                                                                                                                                                                                                                                     |
| `downstash.lock_or_create`  | `(p_db uuid, p_key text, p_type text, p_init jsonb, out o_row downstash.kv, out o_created boolean)`                                                                  | Loop ≤ 5×: `lock_live`; if found, return. Else `insert ... on conflict do nothing returning *`; if inserted, return `o_created = true`. If both fail, retry. After 5 tries, raise with errcode `40001`.                                                                                                                               |
| `downstash.set_val`         | `(p_db uuid, p_key text, p_val jsonb) returns void`                                                                                                                  | `update downstash.kv set val = p_val, updated_at = now() where ...` (row must already be locked). Keeps TTL.                                                                                                                                                                                                                          |
| `downstash.put`             | `(p_db uuid, p_key text, p_type text, p_val jsonb, p_expires_at timestamptz) returns void`                                                                           | Full upsert (`on conflict do update set type, val, expires_at, updated_at`).                                                                                                                                                                                                                                                          |
| `downstash.del_key`         | `(p_db uuid, p_key text) returns boolean`                                                                                                                            | Delete one live key. Returns true if a live key was removed. An expired row is deleted too but returns false.                                                                                                                                                                                                                         |
| `downstash.glob_to_regex`   | `(p_pattern text) returns text`                                                                                                                                      | Redis glob → anchored ARE regex: `*`→`.*`, `?`→`.`, `[...]` kept (`[^...]` negation), `\x` → literal `x`; escape every other regex metacharacter. Immutable.                                                                                                                                                                          |
| `downstash.glob_prefix`     | `(p_pattern text) returns text`                                                                                                                                      | Literal prefix before the first unescaped `*`, `?` or `[` (unescaped). Immutable.                                                                                                                                                                                                                                                     |
| `downstash.like_escape`     | `(p_text text) returns text`                                                                                                                                         | Escape `\`, `%`, `_` for `LIKE ... escape '\'`.                                                                                                                                                                                                                                                                                       |
| `downstash.to_argv`         | `(p_cmd jsonb) returns text[]`                                                                                                                                       | Must be a non-empty JSON array of strings/numbers (numbers → their text). Anything else: `ERR Downstash: each command must be a JSON array of strings`. Null bytes → error.                                                                                                                                                           |
| `downstash.args_preview`    | `(p_args text[]) returns text`                                                                                                                                       | Redis-style `'a' 'b' ` preview (≤ 3 args, each truncated to 128 chars).                                                                                                                                                                                                                                                               |
| `downstash.dispatch`        | `(p_db uuid, p_readonly boolean, p_argv text[], out o_result jsonb, out o_flags text[])`                                                                             | See §7.5.1.                                                                                                                                                                                                                                                                                                                           |
| `downstash.record_usage`    | `(p_db uuid, p_source text, p_commands int, p_reads int, p_writes int, p_errors int, p_l1_hits int, p_bytes_in bigint, p_bytes_out bigint) returns void`             | Upsert into `usage_hourly` for `date_trunc('hour', now() at time zone 'utc') at time zone 'utc'`. `requests += 1` and `failover_requests += 1` when `p_source='failover'`. `requests += 1` for `'gateway'`. `console_commands += p_commands` for `'console'` (and no request). Always add commands/reads/writes/errors/l1_hits/bytes. |
| `downstash.run`             | `(p_db uuid, p_readonly boolean, p_commands jsonb, p_source text, p_l1_hits int default 0, p_bytes_in bigint default 0, p_bytes_out bigint default 0) returns jsonb` | See §7.5.2.                                                                                                                                                                                                                                                                                                                           |
| `downstash.console_run`     | `(p_db uuid, p_commands jsonb) returns jsonb`                                                                                                                        | `run(p_db, false, p_commands, 'console')`                                                                                                                                                                                                                                                                                             |
| `public.downstash_gw_run`   | `(p_token_hash text, p_mode text, p_commands jsonb, p_l1_hits integer default 0, p_bytes_in bigint default 0, p_bytes_out bigint default 0) returns jsonb`           | §7.5.3. `security definer`. **service_role only.**                                                                                                                                                                                                                                                                                    |
| `public.downstash_gw_ping`  | `() returns jsonb`                                                                                                                                                   | `{"ok":true,"now":<iso>}` and `select 1 from downstash.databases limit 1`. service_role only.                                                                                                                                                                                                                                         |
| `public.downstash_exec`     | `(p_token text, p_cmd text, p_args jsonb default '[]') returns jsonb`                                                                                                | §7.5.4. Granted to anon/authenticated/service_role.                                                                                                                                                                                                                                                                                   |
| `public.downstash_pipeline` | `(p_token text, p_commands jsonb) returns jsonb`                                                                                                                     | Same as above; returns an array of envelopes.                                                                                                                                                                                                                                                                                         |
| `public.downstash_multi`    | `(p_token text, p_commands jsonb) returns jsonb`                                                                                                                     | Identical to pipeline (both are atomic in Downstash).                                                                                                                                                                                                                                                                                 |

#### 7.5.1 `downstash.dispatch` algorithm

1. `v_n := coalesce(array_length(p_argv, 1), 0)`. If 0: `ERR empty command`.
2. `v_name := upper(p_argv[1])`. Look up `command_registry`. If missing: `ERR unknown command '<argv1 as sent>', with args beginning with: <args_preview(p_argv[2:])>`.
3. Arity: `arity > 0 and v_n <> arity` or `arity < 0 and v_n < -arity` → `err_args(v_name)`.
4. `if p_readonly and 'write' = any(flags)` → `NOPERM this token has no permissions to run the '<lower name>' command`.
5. If `'script' = any(flags)`: `perform set_config('downstash.readonly', p_readonly::text, true)`. The script handler enforces write permission itself.
6. Key length guard: if `first_key > 0`, loop `i` from `first_key + 1` to `(case when last_key < 0 then v_n + last_key + 1 else last_key + 1 end)` step `key_step`, calling `check_key(p_argv[i])`.
7. `execute format('select %s($1, $2)', r.handler) into o_result using p_db, p_argv[2:v_n];`
8. `o_flags := r.flags`.

#### 7.5.2 `downstash.run` algorithm

```text
validate p_commands is a JSON array with 1..1000 items (else raise_err 'ERR Downstash: pipeline must contain 1..1000 commands')
items := empty jsonb[]
for each element cmd (in order):
  begin
    argv := to_argv(cmd)
    (res, flags) := dispatch(p_db, p_readonly, argv)
    append {"result": res}   -- res SQL NULL → JSON null
    commands++; reads++ if 'read' in flags; writes++ if 'write' in flags
  exception
    when sqlstate '40P01' then raise;      -- deadlock: let the caller retry the whole request
    when sqlstate '40001' then raise;      -- serialization/retry-limit: same
    when sqlstate 'DS000' then append {"error": SQLERRM}; commands++; errors++
    when others          then append {"error": 'ERR ' || SQLERRM}; commands++; errors++
  end
record_usage(p_db, p_source, commands, reads, writes, errors, p_l1_hits, p_bytes_in, p_bytes_out)
return to_jsonb(items)
```

Each command runs in its own sub-transaction (the `begin ... exception` block). A failing command doesn't undo the others, which matches Redis `MULTI` semantics. The whole request is still one Postgres transaction, so other clients never see a half-applied pipeline.

#### 7.5.3 `public.downstash_gw_run`

```text
if p_token_hash !~ '^[0-9a-f]{64}$' → return {"ok":false,"status":401,"error":"Unauthorized"}
if p_mode not in ('single','pipeline','multi') → {"ok":false,"status":400,"error":"ERR Downstash: invalid mode"}
select d.id, t.kind, d.l1_ttl_ms from downstash.tokens t join downstash.databases d on d.id = t.db_id
  where t.token_hash = decode(p_token_hash,'hex') and t.revoked_at is null
not found → {"ok":false,"status":401,"error":"Unauthorized"}
if p_mode = 'single' and jsonb_array_length(p_commands) <> 1 → status 400
begin
  results := downstash.run(id, kind='readonly', p_commands, 'gateway', p_l1_hits, p_bytes_in, p_bytes_out)
exception when sqlstate 'DS000' then return {"ok":false,"status":400,"error":SQLERRM}
end
return {"ok":true,"db":id,"readonly":kind='readonly',"l1TtlMs":l1_ttl_ms,"results":results}
```

#### 7.5.4 `public.downstash_exec` / `_pipeline` / `_multi` (failover, ADR 0003)

```text
if p_token is null or p_token !~ '^ds[kr]_[A-Za-z0-9_-]{43}$' → return {"error":"Unauthorized"}
hash := extensions.digest(p_token, 'sha256')
lookup as above → not found → {"error":"Unauthorized"}
exec:     return (downstash.run(id, ro, jsonb_build_array(jsonb_build_array(p_cmd) || coalesce(p_args,'[]')), 'failover')) -> 0
pipeline: return downstash.run(id, ro, p_commands, 'failover')
on DS000 at the top level (bad body): exec → {"error":SQLERRM}; pipeline → [{"error":SQLERRM}]
```

Grants for this migration:

```sql
revoke all on function public.downstash_gw_run(text, text, jsonb, integer, bigint, bigint) from public, anon, authenticated;
grant execute on function public.downstash_gw_run(text, text, jsonb, integer, bigint, bigint) to service_role;
revoke all on function public.downstash_gw_ping() from public, anon, authenticated;
grant execute on function public.downstash_gw_ping() to service_role;
revoke all on function public.downstash_exec(text, text, jsonb) from public;
grant execute on function public.downstash_exec(text, text, jsonb) to anon, authenticated, service_role;
revoke all on function public.downstash_pipeline(text, jsonb) from public;
grant execute on function public.downstash_pipeline(text, jsonb) to anon, authenticated, service_role;
revoke all on function public.downstash_multi(text, jsonb) from public;
grant execute on function public.downstash_multi(text, jsonb) to anon, authenticated, service_role;
notify pgrst, 'reload schema';
```

### 7.6 Command handler template (copy this style for every command)

Every handler has the signature `downstash.cmd_<lowercase>(p_db uuid, p_args text[]) returns jsonb`. `p_args` **excludes** the command name (so `p_args[1]` is usually the key). Mark reads `stable` and writes `volatile`.

```sql
-- Command: GET key
-- Returns: bulk string, or null if the key doesn't exist
-- Errors:  WRONGTYPE
create or replace function downstash.cmd_get(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  r downstash.kv;
begin
  r := downstash.read_live(p_db, p_args[1], 'string');
  return coalesce(r.val, 'null'::jsonb);
end;
$$;
comment on function downstash.cmd_get(uuid, text[]) is 'GET key';

-- Command: HSET key field value [field value ...]
-- Returns: integer, the number of fields that were added (updates don't count)
-- Errors:  WRONGTYPE; wrong number of arguments if field/value pairs are incomplete
create or replace function downstash.cmd_hset(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile
set search_path = ''
as $$
declare
  v_key   text := p_args[1];
  v_n     int  := array_length(p_args, 1);
  v_slot  record;
  v_val   jsonb;
  v_added int  := 0;
begin
  if v_n % 2 = 0 then
    perform downstash.err_args('hset');
  end if;
  select * into v_slot from downstash.lock_or_create(p_db, v_key, 'hash', '{}'::jsonb);
  v_val := (v_slot.o_row).val;
  for i in 2 .. v_n by 2 loop
    if not (v_val ? p_args[i]) then
      v_added := v_added + 1;
    end if;
    v_val := v_val || jsonb_build_object(p_args[i], p_args[i + 1]);
  end loop;
  perform downstash.set_val(p_db, v_key, v_val);
  return to_jsonb(v_added);
end;
$$;
comment on function downstash.cmd_hset(uuid, text[]) is 'HSET key field value [field value ...]';

-- Register (at the end of every family migration):
insert into downstash.command_registry (name, handler, arity, flags, first_key, last_key, key_step, family, summary) values
  ('GET',  'downstash.cmd_get',  2,  '{read,cacheable}', 1, 1, 1, 'strings', 'Get the value of a key'),
  ('HSET', 'downstash.cmd_hset', -4, '{write}',          1, 1, 1, 'hashes',  'Set hash fields')
on conflict (name) do update set
  handler = excluded.handler, arity = excluded.arity, flags = excluded.flags,
  first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step,
  family = excluded.family, summary = excluded.summary;
```

**Concurrency rules for handlers:**

- Read-modify-write on a key that may not exist yet (INCR\*, HSET, LPUSH, SADD, ZADD, APPEND, ...): use `lock_or_create`.
- Modifying only if the key exists (HDEL, LPOP, SREM, EXPIRE, PERSIST, LSET, ...): use `lock_live`.
- Blind overwrite (SET without NX/XX/GET/KEEPTTL, MSET): use `put`.
- Multi-key writes (MSET, DEL, RENAME, MSETNX): lock keys **in sorted order** (`order by key`) to minimise deadlocks.
- Never use advisory locks (they exhaust the shared lock table on large pipelines).
- Integer overflow: do the math in `numeric`, check it against the bigint range, and raise `ERR increment or decrement would overflow`.

### 7.7 Error message catalog (use these strings exactly)

See §17.2. Handlers must not invent new messages. If one is missing, add it to §17.2's mirror in `docs/engine/errors.md` within the same task.

### 7.8 Command coverage matrix (v1.0)

Legend: **Flags**: `r` read, `w` write, `c` cacheable (L1), `a` admin, `s` script. **Arity** uses Redis convention (counts the command name; negative = minimum). Key spec = `first,last,step`.

#### Strings (migration `..0400_cmd_strings.sql`, task P1-T4)

| Command         | Arity | Flags | Keys   | Supported syntax / reply / notes                                                                                                                                                                                                                       |
| --------------- | ----- | ----- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET             | 2     | r c   | 1,1,1  | bulk / null                                                                                                                                                                                                                                            |
| SET             | -3    | w     | 1,1,1  | `SET k v [NX\|XX] [GET] [EX s\|PX ms\|EXAT ts\|PXAT ms\|KEEPTTL]`. Reply `"OK"`, `null` (NX/XX not met), or the old value with `GET`. Errors: `ERR syntax error` for conflicting or unknown options; `ERR invalid expire time in 'set' command` for ≤0 |
| SETNX           | 3     | w     | 1,1,1  | 1/0                                                                                                                                                                                                                                                    |
| SETEX           | 4     | w     | 1,1,1  | `SETEX k seconds v` → `"OK"`; invalid time error uses `'setex'`                                                                                                                                                                                        |
| PSETEX          | 4     | w     | 1,1,1  | ms variant                                                                                                                                                                                                                                             |
| GETSET          | 3     | w     | 1,1,1  | old value / null; clears TTL                                                                                                                                                                                                                           |
| GETDEL          | 2     | w     | 1,1,1  | value / null                                                                                                                                                                                                                                           |
| MGET            | -2    | r c   | 1,-1,1 | array of value/null (wrong-type keys → null, as in Redis)                                                                                                                                                                                              |
| MSET            | -3    | w     | 1,-1,2 | odd pair count → arity error; `"OK"`; clears TTLs                                                                                                                                                                                                      |
| MSETNX          | -3    | w     | 1,-1,2 | 1 if all set, 0 if any exists (then none are set)                                                                                                                                                                                                      |
| INCR / DECR     | 2     | w     | 1,1,1  | integer; non-integer value → `ERR value is not an integer or out of range`                                                                                                                                                                             |
| INCRBY / DECRBY | 3     | w     | 1,1,1  | integer                                                                                                                                                                                                                                                |
| INCRBYFLOAT     | 3     | w     | 1,1,1  | bulk string via `fmt_float`                                                                                                                                                                                                                            |
| APPEND          | 3     | w     | 1,1,1  | new length (UTF-8 bytes: `octet_length`)                                                                                                                                                                                                               |
| STRLEN          | 2     | r     | 1,1,1  | byte length or 0                                                                                                                                                                                                                                       |

#### Keyspace & expiry (`..0500_cmd_keyspace.sql`, P1-T5)

| Command              | Arity | Flags | Keys   | Notes                                                                                                                                                                                                                                                                                                                 |
| -------------------- | ----- | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DEL / UNLINK         | -2    | w     | 1,-1,1 | count of live keys removed                                                                                                                                                                                                                                                                                            |
| EXISTS               | -2    | r     | 1,-1,1 | count (repeated keys count repeatedly)                                                                                                                                                                                                                                                                                |
| TYPE                 | 2     | r     | 1,1,1  | `"string"\|"hash"\|"list"\|"set"\|"zset"\|"none"`                                                                                                                                                                                                                                                                     |
| KEYS                 | 2     | r     | 0,0,0  | array; uses `glob_prefix` + `LIKE` range + `~ glob_to_regex`; hard cap 10 000 keys → `ERR Downstash: KEYS matched more than 10000 keys, use SCAN`                                                                                                                                                                     |
| SCAN                 | -2    | r     | 0,0,0  | `SCAN cursor [MATCH p] [COUNT n] [TYPE t]` → `["<next cursor>", [keys]]`. Cursor `"0"` = start, returned `"0"` = done. Non-zero cursor = `scan_cursors.id`, which must belong to `p_db`; an unknown cursor returns `["0",[]]`. Returns up to COUNT (default 10, max 1000) matching keys in key order after `last_key` |
| RENAME               | 3     | w     | 1,2,1  | `ERR no such key`; keeps TTL; overwrites destination                                                                                                                                                                                                                                                                  |
| RENAMENX             | 3     | w     | 1,2,1  | 1/0                                                                                                                                                                                                                                                                                                                   |
| RANDOMKEY            | 1     | r     | 0,0,0  | random live key / null                                                                                                                                                                                                                                                                                                |
| EXPIRE / PEXPIRE     | -3    | w     | 1,1,1  | `[NX\|XX\|GT\|LT]`; 1/0; ≤0 deletes the key and returns 1                                                                                                                                                                                                                                                             |
| EXPIREAT / PEXPIREAT | -3    | w     | 1,1,1  | absolute unix s / ms, same options                                                                                                                                                                                                                                                                                    |
| TTL / PTTL           | 2     | r     | 1,1,1  | -2 missing, -1 no TTL, otherwise remaining (TTL = `round(ms/1000)`)                                                                                                                                                                                                                                                   |
| PERSIST              | 2     | w     | 1,1,1  | 1 if a TTL was removed, else 0                                                                                                                                                                                                                                                                                        |

#### Hashes (`..0600_cmd_hashes.sql`, P1-T6)

| Command       | Arity | Flags | Notes                                                 |
| ------------- | ----- | ----- | ----------------------------------------------------- |
| HSET          | -4    | w     | fields added                                          |
| HMSET         | -4    | w     | `"OK"`                                                |
| HSETNX        | 4     | w     | 1/0                                                   |
| HGET          | 3     | r c   | value / null                                          |
| HMGET         | -3    | r c   | array value/null                                      |
| HGETALL       | 2     | r c   | flat array `[f1,v1,...]`; missing → `[]`              |
| HDEL          | -3    | w     | count removed; deletes the key when empty             |
| HLEN          | 2     | r     | count                                                 |
| HEXISTS       | 3     | r     | 1/0                                                   |
| HKEYS / HVALS | 2     | r     | arrays                                                |
| HINCRBY       | 4     | w     | integer; `ERR hash value is not an integer`           |
| HINCRBYFLOAT  | 4     | w     | bulk via `fmt_float`; `ERR hash value is not a float` |
| HSTRLEN       | 3     | r     | byte length or 0                                      |
| HRANDFIELD    | -2    | r     | `[count [WITHVALUES]]`                                |

All hash commands use key spec `1,1,1`.

#### Lists (`..0700_cmd_lists.sql`, P1-T7), key spec `1,1,1`

| Command         | Arity | Flags | Notes                                                     |
| --------------- | ----- | ----- | --------------------------------------------------------- |
| LPUSH / RPUSH   | -3    | w     | new length; LPUSH a b c → `["c","b","a"]`                 |
| LPUSHX / RPUSHX | -3    | w     | 0 if missing                                              |
| LPOP / RPOP     | -2    | w     | `[count]`: no count → value/null; with count → array/null |
| LRANGE          | 4     | r c   | Redis negative-index semantics                            |
| LLEN            | 2     | r     |                                                           |
| LINDEX          | 3     | r     | value/null                                                |
| LSET            | 4     | w     | `ERR no such key`, `ERR index out of range`               |
| LREM            | 4     | w     | count>0 head→tail, <0 tail→head, 0 all                    |
| LTRIM           | 4     | w     | `"OK"`; empty → delete                                    |
| LPOS            | -3    | r     | `LPOS key element [RANK r] [COUNT n] [MAXLEN m]`          |

#### Sets (`..0800_cmd_sets.sql`, P1-T8)

| Command                 | Arity | Flags | Keys   | Notes                                             |
| ----------------------- | ----- | ----- | ------ | ------------------------------------------------- |
| SADD                    | -3    | w     | 1,1,1  | added count                                       |
| SREM                    | -3    | w     | 1,1,1  | removed count                                     |
| SMEMBERS                | 2     | r c   | 1,1,1  | array (order unspecified; return JSONB key order) |
| SISMEMBER               | 3     | r c   | 1,1,1  | 1/0                                               |
| SMISMEMBER              | -3    | r     | 1,1,1  | array of 1/0                                      |
| SCARD                   | 2     | r     | 1,1,1  |                                                   |
| SPOP                    | -2    | w     | 1,1,1  | `[count]` random                                  |
| SRANDMEMBER             | -2    | r     | 1,1,1  | `[count]` (negative count allows repeats)         |
| SINTER / SUNION / SDIFF | -2    | r     | 1,-1,1 | arrays                                            |

#### Sorted sets (`..0900_cmd_zsets.sql`, P1-T9), key spec `1,1,1`

| Command          | Arity | Flags | Notes                                                                                                                                                                         |
| ---------------- | ----- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ZADD             | -4    | w     | `[NX\|XX] [GT\|LT] [CH] [INCR] score member ...`; with INCR → bulk score or null                                                                                              |
| ZINCRBY          | 4     | w     | bulk score                                                                                                                                                                    |
| ZSCORE           | 3     | r c   | bulk / null                                                                                                                                                                   |
| ZMSCORE          | -3    | r     | array                                                                                                                                                                         |
| ZREM             | -3    | w     | removed count                                                                                                                                                                 |
| ZCARD            | 2     | r     |                                                                                                                                                                               |
| ZCOUNT           | 4     | r     | `min max` with `(` exclusive and `-inf/+inf`                                                                                                                                  |
| ZRANGE           | -4    | r     | `ZRANGE k start stop [BYSCORE] [REV] [LIMIT off cnt] [WITHSCORES]` (BYLEX → `ERR Downstash: BYLEX is not supported`). Order by score, then member (byte order, `collate "C"`) |
| ZRANK / ZREVRANK | 3     | r     | int / null                                                                                                                                                                    |
| ZREMRANGEBYSCORE | 4     | w     | count                                                                                                                                                                         |
| ZREMRANGEBYRANK  | 4     | w     | count                                                                                                                                                                         |

#### Server (`..0300_cmd_server.sql`, P1-T3)

| Command            | Arity | Flags | Notes                                                                          |
| ------------------ | ----- | ----- | ------------------------------------------------------------------------------ |
| PING               | -1    | r     | `"PONG"` or echoes the argument                                                |
| ECHO               | 2     | r     |                                                                                |
| DBSIZE             | 1     | r     | live keys in this database                                                     |
| FLUSHDB / FLUSHALL | -1    | w a   | `[ASYNC\|SYNC]` ignored; deletes only this database's keys and cursors; `"OK"` |
| TIME               | 1     | r     | `["<unix s>","<µs>"]`                                                          |

#### Scripting (`..1100_scripts_ratelimit.sql`, P4-T1)

| Command              | Arity | Flags | Notes                                                                                                                                                                                                    |
| -------------------- | ----- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EVAL / EVAL_RO       | -3    | s     | `EVAL body numkeys k... a...`; `sha1 := encode(extensions.digest(body,'sha1'),'hex')`; known → handler; unknown → `ERR Downstash: arbitrary Lua is not supported (script <sha1> is not in the registry)` |
| EVALSHA / EVALSHA_RO | -3    | s     | unknown → `NOSCRIPT No matching script. Please use EVAL.`                                                                                                                                                |
| SCRIPT               | -2    | s     | `SCRIPT LOAD body` → sha1 if known, else the EVAL error; `SCRIPT EXISTS sha...` → array of 1/0; `SCRIPT FLUSH` → `"OK"` (no-op)                                                                          |

Script write permission: if `scripts.is_write` and `current_setting('downstash.readonly', true) = 'true'` → NOPERM using the command name. `*_RO` variants with a write script → `ERR Write commands are not allowed from read-only scripts`.

### 7.9 Script registry (ADR 0007)

1. **Capture (P4-T1):** `tests/capture/capture-scripts.ts` runs every `@upstash/ratelimit` algorithm (`fixedWindow`, `slidingWindow`, `tokenBucket`, `cachedFixedWindow`; methods `limit`, `getRemaining`, `resetUsedTokens`; with `rate` > 1 and default) and every `@upstash/redis` helper that issues EVAL, against **SRH + real Redis**. It wraps `fetch` to log every `EVAL`/`EVALSHA` body. It also reads script strings from `node_modules/@upstash/ratelimit/dist/*.js` as a cross-check. Output: `tests/capture/scripts.json` = `[{ sha1, name, origin, source, keysMeaning, argvMeaning }]`. Commit it.
2. **Port:** for each captured script, write `downstash.script_<snake_name>(p_db uuid, p_keys text[], p_argv text[]) returns jsonb`. It reproduces the Lua semantics by calling `downstash.dispatch(p_db, false, array[...])` for each `redis.call`, plus native logic for arithmetic. **Apply Lua → Redis conversions:** Lua numbers become integers (truncate toward zero), `nil`/`false` become `null`, Lua tables become arrays (stopping at the first nil).
3. **Register** each script in `downstash.scripts` with its exact `source` text, SHA-1 and origin version.
4. **Test:** for each script, run the same KEYS/ARGV sequences against SRH and Downstash, and require identical replies (`tests/differential/scripts.test.ts`).

### 7.10 Adding a command (procedure, also goes in `docs/engine/adding-a-command.md`)

1. Write `downstash.cmd_<name>` in the family migration (or a new migration if that one is already merged).
2. Register it in `command_registry` (upsert).
3. Add it to `packages/protocol/src/commands.ts` (§8.2). The parity test enforces this.
4. Add SQL tests (`tests/sql/<family>.test.ts`) covering: happy path, missing key, wrong type, arity, edge options.
5. Add the command to the differential corpus (`tests/differential/corpus/<family>.json`).
6. Run `pnpm docs:commands` to regenerate `docs/engine/commands.md`.

### 7.11 Ops functions: migration `..1000_ops_cron_stats.sql` (P1-T10)

| Function / job                                                      | Schedule                                 | Behavior                                                                                                                                                                                |
| ------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `downstash.sweep_expired(p_batch int default 5000) returns int`     | job `downstash-ttl-sweeper`, `* * * * *` | Delete up to `p_batch` expired rows (`where ctid in (select ctid ... limit p_batch)`), loop at most 20 batches. Delete `scan_cursors` older than 10 minutes. Return the number deleted. |
| `downstash.compute_stats() returns void`                            | job `downstash-stats`, `*/10 * * * *`    | For each database: upsert `db_stats_daily(db_id, current_date at UTC, count(live keys), sum(octet_length(key) + pg_column_size(val)))`.                                                 |
| `downstash.retention() returns void`                                | job `downstash-retention`, `17 3 * * *`  | Delete `usage_hourly` rows older than 35 days, `db_stats_daily` rows older than 90 days, and `cron.job_run_details` rows older than 7 days.                                             |
| `downstash.delete_database(p_db uuid) returns void`                 | —                                        | Delete the database row; FK cascades handle the rest.                                                                                                                                   |
| `downstash.workspace_overview(p_workspace text) returns table(...)` | —                                        | Optional helper for the database list: id, name, created_at, keys, bytes, commands_today.                                                                                               |

```sql
create extension if not exists pg_cron;
select cron.schedule('downstash-ttl-sweeper', '* * * * *',  $$select downstash.sweep_expired()$$);
select cron.schedule('downstash-stats',       '*/10 * * * *', $$select downstash.compute_stats()$$);
select cron.schedule('downstash-retention',   '17 3 * * *',   $$select downstash.retention()$$);
```

### 7.12 Seed data (`supabase/seed.sql`)

Creates one database `local-dev` (workspace `seed`, created_by `seed`) with fixed tokens. Use them **only** for local dev:

| Kind     | Token                                             |
| -------- | ------------------------------------------------- |
| standard | `dsk_local0standard0token0for0development0only0x` |
| readonly | `dsr_local0readonly0token0for0development0only0x` |

`token_hash = extensions.digest(<token>, 'sha256')`, `token_enc = null`, `token_hint` per §8.5. The console shows "Seed token, see supabase/seed.sql" when `token_enc` is null.

---

## 8. Protocol package specification

`packages/protocol` (`@downstash/protocol`, `"private": true`) holds isomorphic TypeScript shared by the gateway, web and client. It has **zero runtime dependencies**, uses only Web APIs (`crypto.subtle`, `crypto.getRandomValues`, `TextEncoder`, `btoa`/`atob`), and runs in Workers, Node 22 and browsers.

`package.json`:

```json
{
  "name": "@downstash/protocol",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint src test",
    "test": "vitest run",
    "gen:docs": "tsx scripts/gen-commands-doc.ts"
  }
}
```

Consumers: the gateway (bundled by wrangler/esbuild), web (`transpilePackages: ['@downstash/protocol']` in `next.config.ts`) and the client (bundled by tsup with `noExternal: ['@downstash/protocol']`).

### 8.1 `src/types.ts`

```ts
export type CommandFlag = 'read' | 'write' | 'cacheable' | 'admin' | 'script';
export type CommandFamily =
  | 'strings'
  | 'keyspace'
  | 'hashes'
  | 'lists'
  | 'sets'
  | 'zsets'
  | 'server'
  | 'scripting';
export type RedisValue = string | number | null | RedisValue[];
export type ResultEnvelope = { result: RedisValue } | { error: string };
export type RunMode = 'single' | 'pipeline' | 'multi';
export type TokenKind = 'standard' | 'readonly';

export interface CommandSpec {
  name: string; // uppercase
  arity: number; // Redis convention
  flags: readonly CommandFlag[];
  firstKey: number;
  lastKey: number;
  keyStep: number;
  family: CommandFamily;
  summary: string; // must equal command_registry.summary
  syntax: string; // e.g. 'SET key value [NX|XX] [GET] [EX seconds|PX ms|EXAT ts|PXAT ms|KEEPTTL]'
}
```

### 8.2 `src/commands.ts`

- `export const COMMANDS: Readonly<Record<string, CommandSpec>>`: one entry per row in §7.8, sorted alphabetically.
- `export function getCommand(name: string): CommandSpec | undefined` (case-insensitive).
- `export function isWrite(name: string): boolean`: true for `write` or `script` flags **and for unknown commands** (fail safe).
- `export function isCacheable(name: string): boolean`.
- `export function precheck(argv: readonly string[]): { ok: true; spec: CommandSpec } | { ok: false; error: string }` produces the exact unknown-command and arity messages as `downstash.dispatch`.
- **Parity test** (`tests/sql/registry-parity.test.ts`, in the tests package because it needs Postgres): `select name, arity, flags, first_key, last_key, key_step, family, summary from downstash.command_registry` must deep-equal `COMMANDS` (minus `syntax`).

### 8.3 `src/argv.ts`

`normalizeCommand(input: unknown): string[]`, used by the gateway to turn a JSON body into argv:

- Must be a non-empty array, otherwise throw `ProtocolError(ERRORS.COMMAND_SHAPE)`.
- Each element: `string` → as is; finite `number` → `String(n)`; `boolean` → `'true'|'false'`; plain object/array → `JSON.stringify(x)`; `null`/`undefined`/non-finite → throw `ProtocolError(ERRORS.COMMAND_SHAPE)`.
- Any element containing `\u0000` → throw `ProtocolError(ERRORS.NULL_BYTES)`.
- `normalizePipeline(input: unknown, max: number): string[][]`: a non-empty array of commands with `length ≤ max`, otherwise `ERRORS.PIPELINE_SIZE`.

### 8.4 `src/encoding.ts`

- `utf8ToBase64(s: string): string` and `base64ToUtf8(b64: string): string` (via `TextEncoder`/`TextDecoder`, chunked `btoa` for large strings).
- `encodeResult(v: RedisValue): RedisValue`: recursively base64-encode **every string at every depth**. Numbers and nulls are unchanged. (`@upstash/redis` decodes every string except the literal `"OK"`, and `"OK"` survives a base64 round trip, so encoding it is correct too.)
- `encodeEnvelope(e: ResultEnvelope): ResultEnvelope`: encode `result` only, never `error`.

### 8.5 `src/token.ts`

```ts
export const TOKEN_REGEX = /^ds[kr]_[A-Za-z0-9_-]{43}$/;
export function generateToken(kind: TokenKind): string; // 'dsk_'|'dsr_' + base64url(32 random bytes, no padding) → 43 chars
export async function sha256Hex(token: string): Promise<string>; // lowercase hex
export function tokenKind(token: string): TokenKind | null;
export function tokenHint(token: string): string; // token.slice(0, 8) + '…' + token.slice(-4)
```

### 8.6 `src/errors.ts`

`export const ERRORS = { ... } as const`, mirroring §17.2 (keys in SCREAMING_SNAKE_CASE, values the exact strings, with `%s` placeholders where needed). Also `formatError(template, ...args)` and `class ProtocolError extends Error`.

### 8.7 `src/tokenize-cli.ts` and `src/format-cli.ts`

- `tokenizeCli(line: string): string[]` follows redis-cli rules: whitespace separates args; `"..."` supports `\" \\ \n \t \r \xHH` escapes; `'...'` is literal except `\'`. Unbalanced quotes → `throw new ProtocolError('ERR Invalid argument(s)')`.
- `formatCli(envelope: ResultEnvelope): string` follows redis-cli output:
  - error → `(error) <message>`
  - `null` → `(nil)`
  - number → `(integer) <n>`
  - `"OK"`/`"PONG"`/`"QUEUED"` → plain text without quotes
  - other strings → JSON-quoted (`"value"`)
  - `[]` → `(empty array)`
  - arrays → `1) ...` numbered lines; nested arrays indent by the width of the numbering (exactly as redis-cli).
- Unit tests include at least 25 table-driven cases each.

### 8.8 `scripts/gen-commands-doc.ts`

Generates `docs/engine/commands.md` from `COMMANDS`: one table per family with columns Command · Syntax · Flags · Summary. It writes a header `<!-- GENERATED by pnpm docs:commands. DO NOT EDIT. -->`. CI fails if the regenerated file differs (`git diff --exit-code docs/engine/commands.md`).

---

## 9. Gateway specification (Cloudflare Worker)

### 9.1 Files and responsibilities

| File                               | Responsibility                                                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `src/index.ts`                     | `export default { fetch(req, env, ctx), scheduled(evt, env, ctx) }`. Builds deps once per isolate (module-level lazy singleton keyed by env identity) and delegates to `createApp(deps).fetch`. |
| `src/app.ts`                       | `createApp(deps: AppDeps): Hono<{ Bindings: Env }>`: mounts middleware and routes. **Pure**: no globals, so tests inject fakes.                                                                 |
| `src/env.ts`                       | `Env` interface + `readConfig(env): GatewayConfig` (parses numeric vars with defaults, validates `SUPABASE_URL`).                                                                               |
| `src/routes/health.ts`             | `GET/HEAD /health`.                                                                                                                                                                             |
| `src/routes/commands.ts`           | `POST /`, `POST /pipeline`, `POST /multi-exec`, `GET                                                                                                                                            | POST /:command{[a-zA-Z_.-]+}/\*`, plus a 404 fallback. |
| `src/middleware/cors.ts`           | CORS (§9.5).                                                                                                                                                                                    |
| `src/middleware/body-limit.ts`     | Rejects bodies over `MAX_REQUEST_BYTES` with 413 (checks `Content-Length` first, then the actual bytes read).                                                                                   |
| `src/middleware/errors.ts`         | `app.onError`: unexpected → 500 `{"error":"ERR Downstash: internal error"}`; logs without secrets.                                                                                              |
| `src/core/auth.ts`                 | `extractToken(c)`, `authenticate(token, deps)` → `{ kind: 'unknown' } \| { kind: 'invalid' } \| { kind: 'cached', principal }`.                                                                 |
| `src/core/auth-cache.ts`           | `class AuthCache` (positive and negative TTL maps with size caps).                                                                                                                              |
| `src/core/l1-cache.ts`             | `class L1Cache` (§9.7).                                                                                                                                                                         |
| `src/core/request-parse.ts`        | Body → argv lists, plus path-command → argv (§9.4).                                                                                                                                             |
| `src/core/encoding.ts`             | `wantsBase64(req)`, plus re-export of `encodeEnvelope`.                                                                                                                                         |
| `src/core/usage-buffer.ts`         | `class UsageBuffer` (per-db `l1Hits` and `bytesOut` awaiting piggyback).                                                                                                                        |
| `src/core/respond.ts`              | `respondSingle`, `respondMany`, `respondError`, which set status, headers and encoding.                                                                                                         |
| `src/storage/storage.ts`           | `Storage` interface, `RunRequest`, `RunResponse`, `StorageUnavailableError`.                                                                                                                    |
| `src/storage/postgrest-storage.ts` | `class PostgrestStorage implements Storage` (§9.8).                                                                                                                                             |
| `src/scheduled.ts`                 | Keep-alive: `storage.ping()`, logs `{level:'info',msg:'keepalive',ok}`.                                                                                                                         |

### 9.2 Configuration (`wrangler.jsonc`)

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "downstash",
  "main": "src/index.ts",
  "compatibility_date": "2026-10-01",
  "observability": { "enabled": true },
  "triggers": { "crons": ["0 */6 * * *"] },
  "vars": {
    "DOWNSTASH_VERSION": "1.0.0",
    "ALLOWED_ORIGINS": "*",
    "MAX_REQUEST_BYTES": "1048576",
    "MAX_PIPELINE_COMMANDS": "1000",
    "AUTH_CACHE_TTL_MS": "60000",
    "NEGATIVE_AUTH_CACHE_TTL_MS": "30000",
    "RPC_TIMEOUT_MS": "8000"
  }
  // secrets (wrangler secret put): SUPABASE_URL, SUPABASE_SECRET_KEY
}
```

`.dev.vars.example`:

```dotenv
SUPABASE_URL=http://127.0.0.1:54321
# Local: the "Secret key" (or legacy service_role key) printed by `supabase start` / `supabase status`
SUPABASE_SECRET_KEY=replace-me
```

### 9.3 Authentication

1. Token source: the `Authorization: Bearer <token>` header (case-insensitive scheme), else the `_token` query parameter (Upstash supports it). Neither → 401.
2. If `!TOKEN_REGEX.test(token)` → 401 immediately (no DB call, nothing cached).
3. `hash = await sha256Hex(token)`.
4. If `hash` is in the negative cache → 401.
5. If it's in the positive cache → `principal = { dbId, readonly, l1TtlMs }` (we can use L1 and do readonly prechecks). Otherwise the principal is unknown and the DB call authenticates.
6. After a storage call: `ok:false,status:401` → add to the negative cache. `ok:true` → `authCache.set(hash, {db, readonly, l1TtlMs})`.
7. Positive cache hit: confirm with `crypto.subtle.timingSafeEqual(hexToBytes(entry.hash), hexToBytes(hash))` (defense in depth, ADR 0004). Wrap it so tests in Node can call `crypto.subtle.timingSafeEqual` when it exists and fall back to a constant-time XOR loop otherwise.
8. Revocation and rotation take up to `AUTH_CACHE_TTL_MS` (60 s) to apply across isolates. This is documented in Settings UI copy and `docs/gateway/auth.md`.

Response for every auth failure: `401 {"error":"Unauthorized"}`.

### 9.4 Routes and parsing

| Route                   | Body                     | argv                                                                                                                                                                                                           |
| ----------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /`                | JSON array (one command) | `normalizeCommand(body)`                                                                                                                                                                                       |
| `POST /pipeline`        | JSON array of arrays     | `normalizePipeline(body, MAX_PIPELINE_COMMANDS)`, mode `pipeline`                                                                                                                                              |
| `POST /multi-exec`      | same                     | mode `multi`                                                                                                                                                                                                   |
| `GET /<cmd>/<a>/<b>...` | —                        | `[cmd, decodeURIComponent(a), decodeURIComponent(b), ...]` then query params (excluding `_token`) appended in order as `[name, value]`. A param with an empty value appends only the name (e.g. `?NX` → `NX`). |
| `POST /<cmd>/<a>...`    | raw text body            | as GET, then if the body is non-empty, append the **raw body text** as the last arg                                                                                                                            |
| `GET /health`           | —                        | not a command                                                                                                                                                                                                  |
| `GET /`                 | —                        | 404                                                                                                                                                                                                            |

Invalid JSON → 400 `{"error":"ERR Downstash: invalid JSON body"}`. Reserved first segments that aren't commands: `health`, `pipeline`, `multi-exec`.

### 9.5 CORS

- `ALLOWED_ORIGINS="*"` → `Access-Control-Allow-Origin: *`. A comma list → echo the request `Origin` if listed, otherwise no CORS headers.
- Preflight `OPTIONS` → 204 with `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: <echo Access-Control-Request-Headers, else "Authorization, Content-Type, Upstash-Encoding, Upstash-Sync-Token, Upstash-Response-Format">`, and `Access-Control-Max-Age: 86400`.
- Every response: `Access-Control-Expose-Headers: X-Downstash-L1, Upstash-Sync-Token`.

### 9.6 Status codes and response shapes

| Situation                                          | Status | Body                                                        |
| -------------------------------------------------- | ------ | ----------------------------------------------------------- |
| Single command OK                                  | 200    | `{"result": ...}`                                           |
| Single command error (Redis error)                 | 400    | `{"error":"..."}`                                           |
| Pipeline / multi OK (even with per-command errors) | 200    | `[{"result":...},{"error":"..."}]`                          |
| Malformed body / bad pipeline size / null bytes    | 400    | `{"error":"..."}`                                           |
| Auth failure                                       | 401    | `{"error":"Unauthorized"}`                                  |
| Body too large                                     | 413    | `{"error":"ERR Downstash: request body exceeds <n> bytes"}` |
| Unknown route                                      | 404    | `{"error":"ERR Downstash: not found"}`                      |
| Storage unreachable / timeout / 5xx after retries  | 503    | `{"error":"ERR Downstash: storage unavailable"}`            |
| Unexpected exception                               | 500    | `{"error":"ERR Downstash: internal error"}`                 |

Headers on every command response: `Content-Type: application/json`, `X-Downstash-L1: HIT|MISS|BYPASS`, plus CORS. If the request has `Upstash-Encoding: base64` (case-insensitive value), apply `encodeEnvelope` to every envelope.

### 9.7 L1 cache

```ts
export class L1Cache {
  constructor(opts: {
    maxEntries: number /* 1000 */;
    maxValueBytes: number /* 65536 */;
    now: () => number;
  });
  get(dbId: string, argv: readonly string[]): RedisValue | undefined;
  set(dbId: string, argv: readonly string[], value: RedisValue, ttlMs: number): void;
  invalidateDb(dbId: string): void;
  get size(): number;
}
```

- Cache key: `dbId + '\u0000' + [argv[0].toUpperCase(), ...argv.slice(1)].join('\u0000')` (null bytes are banned in argv, so keys can't collide).
- LRU via `Map` re-insertion; evict the oldest when over `maxEntries`. Skip values whose `JSON.stringify` length exceeds `maxValueBytes`.
- **Read path**: only for single commands where `principal` is cached, `principal.l1TtlMs > 0` and `isCacheable(argv[0])`. Hit → respond `X-Downstash-L1: HIT` and `usageBuffer.addL1Hit(dbId)`. Miss → DB, then `set(...)` if the envelope has a `result`.
- **Write path**: after any DB call whose commands include a command where `isWrite()` is true, call `invalidateDb(dbId)`.
- `BYPASS` when L1 isn't applicable.

### 9.8 PostgREST storage adapter

```ts
export class PostgrestStorage implements Storage {
  constructor(opts: {
    url: string;
    key: string;
    timeoutMs: number;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  });
  run(req: RunRequest): Promise<RunResponse>; // POST {url}/rest/v1/rpc/downstash_gw_run
  ping(): Promise<void>; // POST {url}/rest/v1/rpc/downstash_gw_ping
}
```

- Headers: `apikey: <key>`, `Content-Type: application/json`, `Accept: application/json`. Add `Authorization: Bearer <key>` **only if the key starts with `eyJ`** (legacy JWT keys). New `sb_secret_...` keys go only in `apikey`. Check the current Supabase docs before finalising (G1) and record the outcome in `docs/gateway/configuration.md`.
- Body: `{ p_token_hash, p_mode, p_commands, p_l1_hits, p_bytes_in, p_bytes_out }`.
- Timeout via `AbortController` (`RPC_TIMEOUT_MS`).
- Retry up to **2** extra attempts (sleep 15 ms, then 60 ms) when the response is non-2xx with JSON `code` equal to `40P01` or `40001`, or the status is 502/503/504. Never retry other 4xx.
- Network error, timeout or final 5xx → throw `StorageUnavailableError`.
- Never include the key or token hash in error messages.

### 9.9 Usage piggyback

`UsageBuffer.take(dbId)` returns and clears `{ l1Hits, bytesOut }`. It's sent with the next DB call for that db (only possible when the principal is cached). After responding, `addBytesOut(dbId, responseBodyByteLength)`. Counts are **approximate** (an isolate can die holding buffered counts). The Usage page says this in a footnote.

### 9.10 Gateway tests (`apps/gateway/test`, vitest, Node environment)

Use `createApp({ storage: new FakeStorage(), config, now })`, where `FakeStorage` records calls and returns scripted responses. You **must** cover: health; each auth path (missing, malformed, negative-cached, DB-401, cached-positive); `_token` query; path commands with query params and POST bodies; base64 encoding of nested results; pipeline with mixed errors; 413; 404; 503 on storage failure; retry on 40P01; L1 hit/miss/bypass/invalidate; readonly NOPERM precheck from cache; CORS preflight and allow-list. Target **≥ 90% line coverage** of `src/core` and `src/routes`.

---

## 10. Client SDK specification (`@downstash/client`)

Publishable package. Built with tsup to ESM + CJS + `.d.ts`. `peerDependencies: { "@upstash/redis": ">=1.34.0" }` (optional peer, only needed for `createDownstashRequester`). No runtime dependencies (protocol is bundled in).

### 10.1 Public API (`src/index.ts` exports exactly these)

```ts
export interface DownstashFallbackConfig {
  supabaseUrl: string; // https://<ref>.supabase.co
  supabaseKey: string; // publishable/anon key is enough (the Downstash token is checked in SQL)
}

export interface DownstashConfig {
  url: string; // gateway URL
  token: string; // dsk_... or dsr_...
  fallback?: DownstashFallbackConfig;
  timeoutMs?: number; // default 5000, per attempt
  failoverOnTimeout?: boolean; // default true (see 10.3 caveat)
  stickyFailoverMs?: number; // default 60000: after a failover, use RPC directly for this long
  onFailover?: (event: FailoverEvent) => void;
  fetch?: typeof fetch;
}

export interface FailoverEvent {
  reason: 'rate_limited' | 'server_error' | 'network_error' | 'timeout';
  status?: number;
  at: number; // epoch ms
}

export class DownstashError extends Error {
  readonly command: string | undefined; // uppercase command name, if known
  readonly source: 'gateway' | 'rpc';
  readonly status: number | undefined;
}

export class Downstash {
  constructor(config: DownstashConfig);
  execute<T = unknown>(command: Array<string | number | boolean>): Promise<T>;
  pipeline(
    commands: Array<Array<string | number | boolean>>
  ): Promise<ResultEnvelope[]>;
  multi(commands: Array<Array<string | number | boolean>>): Promise<ResultEnvelope[]>;
  // thin conveniences (all call execute):
  ping(): Promise<string>;
  get<T = string>(key: string): Promise<T | null>;
  set(
    key: string,
    value: string,
    opts?: { ex?: number; px?: number; nx?: boolean; xx?: boolean }
  ): Promise<'OK' | null>;
  incr(key: string): Promise<number>;
  incrby(key: string, delta: number): Promise<number>;
  del(...keys: string[]): Promise<number>;
  expire(key: string, seconds: number): Promise<0 | 1>;
  ttl(key: string): Promise<number>;
}

export function createDownstashRequester(config: DownstashConfig): Requester; // Requester type from @upstash/redis
export type { ResultEnvelope, RedisValue } from '@downstash/protocol';
```

### 10.2 Failover algorithm (`src/transport.ts`)

```text
if fallback && now < stickyUntil → go to RPC
try gateway (timeout)
  status 2xx                         → return parsed body
  status 400 / 401 / 403 / 404 / 413 → DO NOT fail over; surface the error (400 single → throw DownstashError)
  status 429                         → reason rate_limited  → failover
  status ≥ 500                       → reason server_error  → failover
catch AbortError                     → reason timeout (failover only if failoverOnTimeout)
catch other (TypeError, network)     → reason network_error → failover
failover: if !fallback → throw DownstashError(source 'gateway')
          stickyUntil = now + stickyFailoverMs; onFailover?.(event)
          RPC: single   → POST {supabaseUrl}/rest/v1/rpc/downstash_exec     {p_token, p_cmd, p_args}
               pipeline → POST .../downstash_pipeline {p_token, p_commands}
               multi    → POST .../downstash_multi    {p_token, p_commands}
          headers: apikey always; Authorization: Bearer only if key starts with 'eyJ'
          RPC returns the same envelopes as the gateway. {"error":"Unauthorized"} → throw DownstashError(status 401, source 'rpc')
```

> [!IMPORTANT]
> This deliberately differs from the PRD sample, which failed over on **any** thrown error, including Redis errors (HTTP 400). That would re-run commands and hide real bugs.

### 10.3 Timeout caveat (document in `docs/client/failover.md`)

When a gateway request times out, it may still have executed. Failing over then runs the command twice. For rate limiters this only makes limits slightly stricter. For non-idempotent business writes, set `failoverOnTimeout: false`.

### 10.4 `createDownstashRequester`

Implements `@upstash/redis`'s `Requester` interface. **Read `node_modules/@upstash/redis` type definitions for the pinned version first** (G1) and match the `request<TResult>(req: UpstashRequest): Promise<UpstashResponse<TResult>>` signature exactly.

- `req.path` undefined/`[]` → single; `['pipeline']` → pipeline; `['multi-exec']` → multi; any other path → gateway only (no failover).
- Never send `Upstash-Encoding` (results come back plain).
- Return value: single → `{ result }` or `{ error }`; pipeline/multi → the envelope array.
- Usage (put this in the README):

```ts
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import { createDownstashRequester } from '@downstash/client';

const redis = new Redis(
  createDownstashRequester({
    url: process.env.DOWNSTASH_URL!,
    token: process.env.DOWNSTASH_TOKEN!,
    fallback: {
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY!
    }
  })
);
const ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, '10 s') });
```

### 10.5 Client tests

Unit tests with a mocked `fetch` cover: success, 400 (no failover), 401 (no failover), 429 → RPC, 503 → RPC, network error → RPC, timeout with and without `failoverOnTimeout`, sticky window, `onFailover` called once per transition, the pipeline RPC path, the requester path mapping, and the `eyJ` header rule. Integration (in `tests/compat/failover.test.ts`) points the gateway URL at a closed port and checks commands succeed through the local Supabase RPC.

---

## 11. Design system — Neo-brutalism implementation

**UX = Upstash console. UI = Neo-brutalism.** Flows, information architecture, page names and the order of actions follow Upstash (§12). Every pixel of visual styling follows this section. The full design brief is copied verbatim into `docs/design/system.md` during P0-T2 (paste it from the original request in the conversation that produced this plan; summary below). This section is the **implementation contract**.

### 11.1 Non-negotiables (checked by `scripts/check-design.ts` in CI)

1. Colors come only from tokens: canvas `#FFFDF5`, ink `#000000`, accent `#FF6B6B`, secondary `#FFD93D`, muted `#C4B5FD`, white `#FFFFFF`. **No grays.**
2. Borders: `border-4 border-black` by default; `border-2` for dense inline elements (badges, table rows, small icon buttons); `border-8` for hero/section dividers.
3. Corners: `rounded-none` everywhere. `rounded-full` only for pill badges, circular stickers and decorative circles.
4. Shadows: hard, zero blur, bottom-right offset, using only `shadow-neo-*` tokens.
5. Type: Space Grotesk 700/900 (500 rarely). Headings `font-black uppercase tracking-tighter`. Labels `uppercase tracking-widest`. **Design deviation D-UI1:** Space Mono 400/700 is allowed **only** for code, keys, tokens, CLI and numeric IDs, because the data browser and CLI need a monospace font. Record it in ADR `0013-monospace-exception.md`.
6. Motion: `duration-100` (buttons) or `duration-200`/`300` (cards), `ease-linear` or `ease-out`. Never `ease-in-out`. Respect `prefers-reduced-motion`.
7. No blur, no gradients, no backdrop-blur, no soft shadows. Alpha transparency only for texture overlays, the dialog scrim, disabled states and placeholders (`placeholder:text-black/40`).
8. Contrast: **black text on accent, secondary, muted, white and canvas. White text only on black.** Colored text only on black backgrounds (yellow, red and violet on black all pass AA). Never put white text on red: `#FFF` on `#FF6B6B` is 2.8:1 and fails AA.

### 11.2 `apps/web/app/globals.css` (write exactly; extend only by adding tokens)

```css
/* @file Global styles + Neo-brutalism design tokens (single source of truth). @see docs/design/tokens.md */
@layer theme, base, clerk, components, utilities;
@import 'tailwindcss';

@theme {
  /* Reset default palettes so off-brand utilities (gray-500, rounded-lg, shadow-lg, blur-*) don't exist. */
  --color-*: initial;
  --radius-*: initial;
  --shadow-*: initial;
  --inset-shadow-*: initial;
  --drop-shadow-*: initial;
  --blur-*: initial;
  --ease-*: initial;
  --font-*: initial;

  --color-neo-canvas: #fffdf5;
  --color-neo-ink: #000000;
  --color-neo-accent: #ff6b6b;
  --color-neo-secondary: #ffd93d;
  --color-neo-muted: #c4b5fd;
  --color-black: #000000;
  --color-white: #ffffff;

  --font-sans: var(--font-space-grotesk), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-space-mono), ui-monospace, SFMono-Regular, Menlo, monospace;

  --shadow-neo-xs: 2px 2px 0px 0px #000;
  --shadow-neo-sm: 4px 4px 0px 0px #000;
  --shadow-neo-hover: 6px 6px 0px 0px #000;
  --shadow-neo-md: 8px 8px 0px 0px #000;
  --shadow-neo-lg: 12px 12px 0px 0px #000;
  --shadow-neo-xl: 16px 16px 0px 0px #000;
  --shadow-neo-white-md: 8px 8px 0px 0px #fff;
  --shadow-neo-white-xl: 20px 20px 0px 0px #fff;
  --shadow-neo-accent-sm: 4px 4px 0px 0px #ff6b6b;
  --shadow-neo-secondary-md: 8px 8px 0px 0px #ffd93d;

  --ease-out: cubic-bezier(0, 0, 0.2, 1);

  --animate-spin-slow: spin-slow 10s linear infinite;
  --animate-pop-in: pop-in 150ms ease-out;
  --animate-wiggle: wiggle 300ms linear;

  @keyframes spin-slow {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
  @keyframes pop-in {
    from {
      transform: translate(-50%, -48%) scale(0.96);
      opacity: 0;
    }
    to {
      transform: translate(-50%, -50%) scale(1);
      opacity: 1;
    }
  }
  @keyframes wiggle {
    0%,
    100% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(-3deg);
    }
    75% {
      transform: rotate(3deg);
    }
  }
}

@utility text-stroke {
  -webkit-text-stroke: 2px #000;
  color: transparent;
}
@utility text-stroke-white {
  -webkit-text-stroke: 2px #fff;
  color: transparent;
}
@utility text-shadow-neo {
  text-shadow: 4px 4px 0px #000;
}
@utility text-shadow-neo-lg {
  text-shadow: 6px 6px 0px #000;
}
@utility bg-halftone {
  background-image: radial-gradient(#000 1.5px, transparent 1.5px);
  background-size: 20px 20px;
}
@utility bg-dots {
  background-image: radial-gradient(circle, #000 2px, transparent 2.5px);
  background-size: 30px 30px;
}
@utility bg-grid {
  background-size: 40px 40px;
  background-image: linear-gradient(to right, rgba(0, 0, 0, 0.1) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.1) 1px, transparent 1px);
}
@utility bg-noise {
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'%2F%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
}
@utility bg-stripes {
  background-image: repeating-linear-gradient(45deg, #000 0 2px, transparent 2px 12px);
}

@layer base {
  html {
    background-color: var(--color-neo-canvas);
    color: var(--color-neo-ink);
  }
  body {
    @apply bg-neo-canvas font-sans font-bold text-black antialiased;
  }
  h1,
  h2,
  h3,
  h4 {
    @apply font-black uppercase tracking-tighter;
  }
  ::selection {
    background: var(--color-neo-secondary);
    color: #000;
  }
  :focus-visible {
    outline: 3px solid #000;
    outline-offset: 3px;
  }
  code,
  kbd,
  samp,
  pre {
    @apply font-mono;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  ::before,
  ::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

`apps/web/lib/tokens.ts` is the **only** TS file allowed to hold hex values (charts, Clerk and Shiki need raw colors):

```ts
/** @file Raw design token values for libraries that can't consume CSS classes (Recharts, Clerk, Shiki). */
export const NEO = {
  canvas: '#FFFDF5',
  ink: '#000000',
  accent: '#FF6B6B',
  secondary: '#FFD93D',
  muted: '#C4B5FD',
  white: '#FFFFFF'
} as const;
export type NeoColor = keyof typeof NEO;
```

Fonts in `app/layout.tsx`:

```ts
import { Space_Grotesk, Space_Mono } from 'next/font/google';
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
  display: 'block'
});
// Space Grotesk tops out at 700 on Google Fonts. font-black (900) is synthesized from 700; that's accepted.
// Check the weights next/font offers for the pinned Next version; if 900 is offered, include it.
const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap'
});
// <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable}`}>
```

### 11.3 Scales

| Use             | Landing                                                       | Console                                          |
| --------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| Display / H1    | `text-5xl sm:text-7xl md:text-8xl lg:text-9xl leading-[0.85]` | `text-4xl md:text-6xl leading-none` (page title) |
| H2              | `text-4xl sm:text-6xl md:text-7xl leading-none`               | `text-2xl md:text-3xl` (card/section title)      |
| H3              | `text-3xl md:text-4xl`                                        | `text-xl`                                        |
| Body            | `text-lg md:text-xl leading-relaxed`                          | `text-base leading-snug`                         |
| Small / label   | `text-sm uppercase tracking-widest`                           | `text-xs uppercase tracking-widest`              |
| Section padding | `py-16 md:py-24 lg:py-32`                                     | `py-8 md:py-10`                                  |
| Gaps            | `gap-8 md:gap-12`                                             | `gap-6`                                          |
| Shadows         | `md`–`xl`                                                     | `sm`–`md`                                        |

The console is denser but still unmistakably brutalist: thick borders, hard shadows, uppercase labels and color blocking everywhere.

### 11.4 Component contracts (`apps/web/components/ui/*`)

All components use `cva` for variants, `cn()` for merging, forward `className` and refs (React 19 `ref` prop), and are built on Radix where noted. **Base class strings below are mandatory**; you may add layout classes, but not change the look.

| Component (file)                       | Radix                      | Base classes / variants                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button` (`button.tsx`)                | `Slot` for `asChild`       | base: `inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border-4 border-black font-bold uppercase tracking-wide select-none transition-[transform,box-shadow] duration-100 ease-linear focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-neo-canvas active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-60 disabled:shadow-none [&_svg]:size-5 [&_svg]:stroke-[3px]` · variants: `primary` `bg-neo-accent text-black shadow-neo-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo-hover`; `secondary` same with `bg-neo-secondary`; `muted` with `bg-neo-muted`; `outline` with `bg-white`; `dark` `bg-black text-white shadow-neo-accent-sm hover:-translate-x-0.5 hover:-translate-y-0.5`; `danger` `bg-black text-neo-accent shadow-neo-accent-sm`; `ghost` `border-2 border-transparent bg-transparent shadow-none hover:border-black active:translate-x-0 active:translate-y-0` · sizes: `sm` `h-11 px-4 text-xs`, `md` `h-12 px-6 text-sm`, `lg` `h-14 px-8 text-base`, `icon` `size-12 p-0` · prop `loading` swaps the icon for `<Spinner/>` and sets `aria-busy` |
| `Input` (`input.tsx`)                  | —                          | `h-14 w-full rounded-none border-4 border-black bg-white px-4 text-lg font-bold text-black placeholder:text-black/40 transition-[background-color,box-shadow] duration-100 focus-visible:bg-neo-secondary focus-visible:shadow-neo-sm focus-visible:outline-none focus-visible:ring-0 aria-[invalid=true]:shadow-neo-accent-sm` · `mono` prop adds `font-mono text-base`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Textarea`                             | —                          | Input classes with `min-h-40 py-3 font-mono text-base leading-relaxed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Label`                                | `Label`                    | `text-xs font-black uppercase tracking-widest text-black`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Field` (`field.tsx`)                  | —                          | Label + control + `hint` (`text-sm font-medium`) + `error` (rendered in `inline-block border-2 border-black bg-neo-accent px-2 py-0.5 text-xs font-black uppercase` with `role="alert"`). Wires `aria-describedby`/`aria-invalid`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Card` family (`card.tsx`)             | —                          | `Card` `rounded-none border-4 border-black bg-white shadow-neo-md`; prop `interactive` adds `transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-neo-lg`; `CardHeader` `flex items-center justify-between gap-4 border-b-4 border-black px-6 py-4` with `tone` = `muted`(default) `bg-neo-muted` / `secondary` / `accent` / `black` (`bg-black text-white`) / `white`; `CardTitle` `text-xl md:text-2xl font-black uppercase tracking-tight`; `CardContent` `p-6`; `CardFooter` `flex items-center gap-4 border-t-4 border-black px-6 py-4`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `Badge`                                | —                          | `inline-flex items-center gap-1 border-2 border-black px-2.5 py-0.5 text-xs font-black uppercase tracking-widest` · tones `accent/secondary/muted/white/black(text-white)` · `shape` `square`(default) / `pill` (`rounded-full`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `Sticker` (`sticker.tsx`)              | —                          | `inline-block border-4 border-black px-4 py-2 font-black uppercase tracking-widest shadow-neo-sm transition-transform duration-200 ease-out hover:rotate-6` · `tone` · `rotate` ∈ `-3,-2,-1,1,2,3` mapped to `-rotate-3 ... rotate-3` · `shape` `square`/`circle` (`rounded-full aspect-square grid place-items-center`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Dialog` (`dialog.tsx`)                | `Dialog`                   | overlay `fixed inset-0 z-50 bg-black/40 bg-halftone`; content `fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-none border-4 border-black bg-neo-canvas shadow-neo-xl data-[state=open]:animate-pop-in`; `DialogHeader` `border-b-4 border-black bg-neo-secondary px-6 py-4`; `DialogTitle` `text-2xl font-black uppercase tracking-tight`; `DialogBody` `p-6 space-y-6`; `DialogFooter` `flex flex-col-reverse gap-3 border-t-4 border-black px-6 py-4 sm:flex-row sm:justify-end`; close = `Button variant="outline" size="icon"` absolute `-right-4 -top-4` with `aria-label="Close"`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `AlertDialog`                          | `AlertDialog`              | Same as Dialog, header `bg-neo-accent`; confirm uses `Button variant="danger"`; optional `confirmText` prop requires typing an exact string (e.g. the database name) before confirm is enabled                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `Tabs` (`tabs.tsx`)                    | `Tabs`                     | list `inline-flex flex-wrap border-4 border-black bg-white shadow-neo-sm`; trigger `h-11 px-4 text-sm font-bold uppercase border-r-4 border-black last:border-r-0 transition-colors duration-100 hover:bg-neo-muted data-[state=active]:bg-neo-secondary data-[state=active]:font-black focus-visible:outline-none focus-visible:bg-neo-muted`; content `mt-6 focus-visible:outline-none`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `NavTabs` (`nav-tabs.tsx`)             | — (links)                  | container `flex gap-2 overflow-x-auto border-b-4 border-black`; link `-mb-1 flex h-12 shrink-0 items-center border-4 border-b-0 border-black px-5 font-black uppercase tracking-tight transition-transform duration-100`; inactive `translate-y-1 bg-white hover:translate-y-0 hover:bg-neo-secondary`; active (`aria-current="page"`) `bg-neo-accent`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `Switch`                               | `Switch`                   | root `inline-flex h-8 w-14 shrink-0 items-center rounded-none border-4 border-black bg-white p-0.5 transition-colors duration-100 data-[state=checked]:bg-neo-accent`; thumb `block size-5 bg-black transition-transform duration-100 ease-linear data-[state=checked]:translate-x-6`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Select`                               | `Select`                   | trigger = Input look (`h-14 ... flex items-center justify-between`) + `ChevronDown stroke-[3px]`; content `z-50 rounded-none border-4 border-black bg-white shadow-neo-md`; item `cursor-pointer px-4 py-3 font-bold uppercase outline-none data-[highlighted]:bg-neo-secondary data-[state=checked]:bg-neo-muted`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `DropdownMenu`                         | `DropdownMenu`             | content as Select; item as Select item; separator `my-1 h-1 bg-black`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Tooltip`                              | `Tooltip`                  | `z-50 border-2 border-black bg-black px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white`; arrow `fill-black`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `Accordion`                            | `Accordion`                | item `border-4 border-black bg-white shadow-neo-sm` (stack `space-y-4`); trigger `flex w-full items-center justify-between px-6 py-5 text-left text-lg md:text-xl font-black uppercase transition-colors duration-100 hover:bg-neo-secondary data-[state=open]:bg-neo-accent`; icon `Plus` with `transition-transform duration-200 [[data-state=open]_&]:rotate-45`; content `border-t-4 border-black bg-neo-muted px-6 py-5 text-lg font-bold`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Table` (`table.tsx`)                  | —                          | wrapper `overflow-x-auto border-4 border-black bg-white shadow-neo-md`; `th` `border-b-4 border-black bg-neo-secondary px-4 py-3 text-left text-xs font-black uppercase tracking-widest`; `td` `border-b-2 border-black px-4 py-3 font-bold`; last row `[&_tr:last-child_td]:border-b-0`; clickable row `cursor-pointer transition-colors duration-100 hover:bg-neo-canvas`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `CodeBlock` (`code-block.tsx`, server) | —                          | outer `rounded-none border-4 border-black bg-black shadow-neo-md`; header `flex h-12 items-center justify-between border-b-4 border-black bg-neo-secondary px-4 text-black` (filename `font-mono text-sm font-bold`, `CopyButton`); body `overflow-x-auto p-5 font-mono text-sm leading-relaxed text-white`. Highlighted on the server with Shiki using the custom theme in `lib/shiki.ts` (keywords `NEO.accent`, strings `NEO.secondary`, functions/types `NEO.muted`, everything else `NEO.white`, background `NEO.ink`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `CopyButton` (client)                  | —                          | `Button variant="outline" size="icon"` resized to `size-10 border-2`; `Copy` → `Check` for 1500 ms; `aria-label="Copy <label>"`; toast `COPIED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `SecretField` (client)                 | —                          | label + row: box `flex h-12 min-w-0 flex-1 items-center border-4 border-black bg-white px-3 font-mono text-sm` showing `••••••••••••••••` or the value; buttons reveal (`Eye`/`EyeOff`) and copy. Gets its value via an async `reveal()` prop (server action), so secrets aren't in the initial HTML                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `StatCard`                             | —                          | `border-4 border-black bg-white p-5 shadow-neo-sm`; icon box `grid size-12 place-items-center border-4 border-black bg-<tone>`; label `text-xs font-black uppercase tracking-widest`; value `mt-2 text-4xl font-black tracking-tighter`; hint `text-sm font-medium`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `ProgressBar`                          | —                          | track `h-8 w-full border-4 border-black bg-white`; fill `h-full border-r-4 border-black` (omit the border at 0%): `<70%` `bg-neo-secondary`, `70–90%` `bg-neo-accent`, `>90%` `bg-neo-accent bg-stripes`; `role="progressbar"` with aria values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `EmptyState`                           | —                          | `relative overflow-hidden border-4 border-dashed border-black bg-white p-10 md:p-16 text-center`; decorative `Star` `animate-spin-slow fill-neo-secondary` (aria-hidden); title `text-3xl font-black uppercase`; description `mt-3 text-lg`; action slot                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Skeleton`                             | —                          | `animate-pulse border-2 border-black bg-neo-muted`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Spinner`                              | —                          | `Star` icon `size-5 animate-spin fill-black stroke-[3px]` with `role="status"` and an sr-only `Loading`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `Kbd`                                  | —                          | `inline-flex h-6 min-w-6 items-center justify-center border-2 border-black bg-white px-1.5 font-mono text-xs font-bold shadow-neo-xs`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `Separator`                            | —                          | `h-1 w-full bg-black` (vertical: `w-1 self-stretch`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Texture`                              | —                          | `<div aria-hidden className="pointer-events-none absolute inset-0 opacity-20 bg-<variant>" />`; variants `halftone/grid/dots/noise/stripes`; `opacity` prop ∈ `10/20/30`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `Marquee` (client)                     | wraps `react-fast-marquee` | `border-y-4 border-black bg-black py-3 text-white`; item `mx-6 text-lg font-black uppercase tracking-widest`; separator `Star size-5 fill-neo-secondary stroke-black`; pauses when `prefers-reduced-motion` (`play={!reduced}`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Toaster` (`toaster.tsx`)              | sonner                     | `unstyled: true`; toast `flex w-[356px] items-center gap-3 rounded-none border-4 border-black bg-white p-4 font-bold uppercase shadow-neo-md`; success `bg-neo-secondary`; error `bg-neo-accent`; position `bottom-right`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Layout primitives** (`components/ui/layout.tsx`): `Container` (`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8`), `Section` (`relative overflow-hidden border-b-4 border-black` + `tone` canvas/secondary/muted/accent/black/white + optional `texture`), `PageHeader` (eyebrow `Badge`, title, description, actions; title `text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none`).

**Brand** (`components/brand/*`):

- `LogoMark`: `grid size-10 place-items-center border-4 border-black bg-neo-accent shadow-neo-xs` containing lucide `ArrowDownToLine` (`size-5 stroke-[3px]`).
- `Logo`: `LogoMark` + wordmark `DOWNSTASH` in `inline-block -rotate-2 border-4 border-black bg-neo-secondary px-2 py-0.5 text-xl font-black uppercase tracking-tighter shadow-neo-sm`. As a home link it gets `aria-label="Downstash home"`.
- `app/icon.svg` (favicon):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect x="6" y="6" width="56" height="56" fill="#000"/><rect x="2" y="2" width="54" height="54" fill="#FF6B6B" stroke="#000" stroke-width="4"/><path d="M29 14v20m-9-9 9 9 9-9M17 42h24" fill="none" stroke="#000" stroke-width="6" stroke-linecap="square"/></svg>
```

**Data type colors** (data browser, docs, badges; use the `TypeBadge` component everywhere):

| Type   | Badge tone           |
| ------ | -------------------- |
| STRING | `secondary` (yellow) |
| HASH   | `muted` (violet)     |
| LIST   | `accent` (red)       |
| SET    | `white`              |
| ZSET   | `black` (white text) |

### 11.5 Charts (Recharts)

`components/console/chart-card.tsx` wraps every chart in a `Card` (header tone `secondary`, title, optional range note).

- Bars: `fill={NEO.accent | NEO.secondary | NEO.muted}`, `stroke={NEO.ink}`, `strokeWidth={2}`, `radius={0}`, `isAnimationActive={false}`.
- Lines: `stroke={NEO.ink}`, `strokeWidth={3}`, `dot={{ r: 4, fill: NEO.secondary, stroke: NEO.ink, strokeWidth: 2 }}`, `type="linear"`.
- Axes: `stroke={NEO.ink}`, `strokeWidth={2}`, tick `{ fill: NEO.ink, fontWeight: 700, fontSize: 12 }`. Grid: `CartesianGrid stroke={NEO.ink} strokeOpacity={0.1} vertical={false}`.
- Tooltip: custom `content` component with classes `border-4 border-black bg-white p-3 font-bold shadow-neo-sm`. Labels uppercase.
- Legend: custom, using `Badge` per series.
- Series colors: reads `secondary`, writes `accent`, L1 hits `muted`, errors `black` (fill `NEO.ink`), bytes in `secondary`, bytes out `muted`.

### 11.6 Clerk appearance (`lib/clerk-appearance.ts`)

Pass to `<ClerkProvider appearance={clerkAppearance}>`. Check every key against `@clerk/types` for the pinned version (G1). Clerk has renamed variables between majors, so adjust names and keep the intent.

```ts
import type { Appearance } from '@clerk/types';
import { NEO } from './tokens';

export const clerkAppearance: Appearance = {
  cssLayerName: 'clerk',
  variables: {
    colorPrimary: NEO.accent,
    colorText: NEO.ink,
    colorTextOnPrimaryBackground: NEO.ink,
    colorBackground: NEO.canvas,
    colorInputBackground: NEO.white,
    colorInputText: NEO.ink,
    colorDanger: NEO.ink,
    borderRadius: '0rem',
    fontFamily: 'var(--font-space-grotesk)',
    fontWeight: { normal: 700, medium: 700, bold: 900 }
  },
  elements: {
    rootBox: 'w-full',
    card: 'rounded-none border-4 border-black bg-neo-canvas shadow-neo-lg',
    headerTitle: 'text-2xl font-black uppercase tracking-tight',
    headerSubtitle: 'font-bold',
    socialButtonsBlockButton:
      'h-12 rounded-none border-4 border-black bg-white font-bold uppercase shadow-neo-sm hover:bg-neo-secondary',
    dividerLine: 'h-1 bg-black',
    formFieldLabel: 'text-xs font-black uppercase tracking-widest',
    formFieldInput:
      'h-12 rounded-none border-4 border-black bg-white font-bold focus:bg-neo-secondary focus:shadow-neo-sm',
    formButtonPrimary:
      'h-12 rounded-none border-4 border-black bg-neo-accent font-bold uppercase tracking-wide text-black shadow-neo-sm hover:bg-neo-accent active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    footerActionLink: 'font-black text-black underline decoration-4 underline-offset-4',
    userButtonAvatarBox: 'size-10 rounded-none border-4 border-black',
    userButtonPopoverCard: 'rounded-none border-4 border-black shadow-neo-md',
    organizationSwitcherTrigger:
      'h-12 rounded-none border-4 border-black bg-white px-3 font-bold uppercase shadow-neo-sm',
    organizationSwitcherPopoverCard: 'rounded-none border-4 border-black shadow-neo-md'
  }
};
```

### 11.7 `scripts/check-design.ts` (root script `design:check`, runs in CI)

Scan `apps/web/{app,components,features,lib}/**/*.{ts,tsx}`. **Allowlist:** `lib/tokens.ts`, `lib/shiki.ts`, `lib/clerk-appearance.ts`. Fail with file:line on:

| Rule                | Regex                                                         |
| ------------------- | ------------------------------------------------------------- |
| mid radius          | `\brounded-(xs\|sm\|md\|lg\|xl\|2xl\|3xl\|4xl)\b`             |
| raw hex             | `#[0-9a-fA-F]{3,8}\b`                                         |
| blur                | `\b(backdrop-)?blur(-[a-z0-9]+)?\b`                           |
| gradients           | `\bbg-(gradient\|linear\|radial\|conic)-`                     |
| grays               | `\b(gray\|slate\|zinc\|neutral\|stone)-\d{2,3}\b`             |
| soft easing         | `\bease-in-out\b`, `\bease-in\b`                              |
| light weights       | `\bfont-(thin\|extralight\|light\|normal)\b`                  |
| slow motion         | `\bduration-(500\|700\|1000)\b`                               |
| default shadows     | `\bshadow-(sm\|md\|lg\|xl\|2xl\|inner)\b`                     |
| inline color styles | `style=\{\{[^}]*(color\|background\|boxShadow\|borderRadius)` |

---

## 12. Web app specification (console + landing)

### 12.1 UX reference map (Upstash → Downstash)

| Upstash console         | Downstash route                                         | Notes                                                                                                       |
| ----------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Redis database list     | `/redis`                                                | Same: list + "Create Database" button top-right + empty state                                               |
| Create database modal   | Dialog on `/redis`                                      | Same order: name → region → options → plan → Create                                                         |
| Database → Details tab  | `/redis/[dbId]`                                         | "Connect to your database" with code tabs, REST URL/token with reveal & copy, usage summary, database facts |
| Database → Usage tab    | `/redis/[dbId]/usage`                                   | Range selector + charts                                                                                     |
| Database → Data Browser | `/redis/[dbId]/browser`                                 | Key list (search, type filter, add key) + key detail editor                                                 |
| Database → CLI          | `/redis/[dbId]/cli`                                     | Web terminal                                                                                                |
| Database → Settings     | `/redis/[dbId]/settings`                                | Rename, L1 cache, reset credentials, flush, delete                                                          |
| Account / team switcher | Clerk `OrganizationSwitcher` + `UserButton`, `/account` |                                                                                                             |
| Billing / usage limits  | `/quotas`                                               | Free-tier quotas (Cloudflare, Supabase), cron health                                                        |

### 12.2 Route tree (App Router)

```text
apps/web/app/
├── layout.tsx                     # html/body, fonts, ClerkProvider(appearance), Toaster
├── globals.css
├── icon.svg
├── not-found.tsx                  # brutalist 404
├── error.tsx                      # brutalist error boundary ('use client')
├── (marketing)/
│   ├── layout.tsx                 # MarketingNav + MarketingFooter
│   └── page.tsx                   # Landing (§12.11)
├── (auth)/
│   ├── layout.tsx                 # 60/40 split: brand panel + form panel
│   ├── sign-in/[[...sign-in]]/page.tsx
│   └── sign-up/[[...sign-up]]/page.tsx
└── (console)/
    ├── layout.tsx                 # ConsoleTopBar + bg-grid canvas + Container
    ├── redis/
    │   ├── page.tsx               # Database list
    │   ├── loading.tsx
    │   └── [dbId]/
    │       ├── layout.tsx         # requireDatabase, DatabaseHeader, NavTabs
    │       ├── page.tsx           # Details
    │       ├── usage/page.tsx
    │       ├── browser/page.tsx
    │       ├── cli/page.tsx
    │       ├── settings/page.tsx
    │       └── not-found.tsx
    ├── quotas/page.tsx
    └── account/[[...rest]]/page.tsx   # <UserProfile routing="path" path="/account" />
```

`middleware.ts`:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
const isProtected = createRouteMatcher(['/redis(.*)', '/quotas(.*)', '/account(.*)']);
export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});
export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
```

### 12.3 Environment (`apps/web/lib/env.ts`, validated with zod at import)

| Var                                                                                  | Side   | Required                     | Example / default                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                                                       | server | yes                          | `postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:6543/postgres` (local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`) |
| `TOKEN_ENCRYPTION_KEY`                                                               | server | yes                          | base64 of 32 random bytes (`pnpm gen:enc-key`)                                                                                                         |
| `MAX_DATABASES_PER_WORKSPACE`                                                        | server | no                           | `25`                                                                                                                                                   |
| `CLERK_SECRET_KEY`                                                                   | server | yes in prod (keyless in dev) |                                                                                                                                                        |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`                                                  | client | yes in prod                  |                                                                                                                                                        |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `_SIGN_UP_URL`                                     | client | yes                          | `/sign-in`, `/sign-up`                                                                                                                                 |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` / `_SIGN_UP_FALLBACK_REDIRECT_URL` | client | yes                          | `/redis`                                                                                                                                               |
| `NEXT_PUBLIC_GATEWAY_URL`                                                            | client | yes                          | `https://downstash.<sub>.workers.dev` (local `http://127.0.0.1:8787`)                                                                                  |
| `NEXT_PUBLIC_SUPABASE_URL`                                                           | client | yes                          | used only in connect snippets for failover                                                                                                             |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`                                               | client | yes                          | used only in connect snippets                                                                                                                          |
| `NEXT_PUBLIC_STORAGE_REGION_LABEL`                                                   | client | no                           | `Supabase · ap-south-1`                                                                                                                                |
| `NEXT_PUBLIC_APP_URL`                                                                | client | yes                          | `http://localhost:3000`                                                                                                                                |

### 12.4 Server data layer (`apps/web/lib/*`, all `import 'server-only'`)

| File               | Exports                                                                                                                                                             | Notes                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db.ts`            | `sql`                                                                                                                                                               | `postgres(env.DATABASE_URL, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 })`, cached on `globalThis` in dev. `prepare: false` is **required** with the transaction pooler. |
| `crypto.ts`        | `encryptToken(plain)`, `decryptToken(enc)`                                                                                                                          | AES-256-GCM (`node:crypto`), 12-byte random IV, format `v1:<iv_b64>:<ct+tag_b64>`. Throws on a bad format.                                                                                    |
| `tokens.ts`        | `issueTokenPair()` → `{ standard, readonly }`, each `{ token, hash: Buffer, enc, hint }`                                                                            | Uses `generateToken`, `sha256` (node), `encryptToken`, `tokenHint`.                                                                                                                           |
| `auth.ts`          | `getWorkspace()` → `{ userId, workspaceId } \| null`; `requireWorkspace()` (redirects to `/sign-in`); `requireDatabase(dbId)` → `DatabaseRow` or `notFound()`       | `workspaceId = orgId ?? userId`. `requireDatabase` validates the uuid format, then `where id = $1 and workspace_id = $2`. **Every query and action that takes `dbId` calls it first.**        |
| `engine.ts`        | `runCommands(dbId, commands: string[][]): Promise<ResultEnvelope[]>`; `runCommand(dbId, argv)`                                                                      | `select downstash.console_run(${dbId}, ${json}::jsonb) as r`. Callers must have called `requireDatabase`.                                                                                     |
| `action-result.ts` | `ActionResult<T>`, `ok(data)`, `fail(code, message, fieldErrors?)`                                                                                                  | Codes: `UNAUTHENTICATED`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `LIMIT`, `INTERNAL`.                                                                                                         |
| `format.ts`        | `formatBytes`, `formatNumber` (en-US, compact above 10k), `formatTtl` (`-1`→`NO TTL`, `-2`→`EXPIRED`, `90`→`1M 30S`), `formatDate` (`7 OCT 2026`), `formatRelative` | Uppercase output where it's displayed as a label.                                                                                                                                             |
| `utils.ts`         | `cn(...inputs)`                                                                                                                                                     | `twMerge(clsx(inputs))` (not server-only).                                                                                                                                                    |
| `shiki.ts`         | `highlight(code, lang)`                                                                                                                                             | Singleton highlighter, custom neo theme, langs `ts tsx js bash python dotenv json`.                                                                                                           |

### 12.5 Feature module layout (identical for every feature)

```text
features/<feature>/
├── queries.ts      # server-only reads (Server Components call these)
├── actions.ts      # 'use server' mutations returning ActionResult
├── schemas.ts      # zod schemas shared by forms + actions
├── components/     # feature components (client ones marked 'use client')
└── README.md       # purpose, files, data flow (documentation rule §13)
```

### 12.6 Server action rules

```ts
'use server';
export async function renameDatabase(
  input: unknown
): Promise<ActionResult<{ name: string }>> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success)
    return fail(
      'VALIDATION',
      'Check the highlighted fields.',
      fieldErrors(parsed.error)
    );
  const ws = await getWorkspace();
  if (!ws) return fail('UNAUTHENTICATED', 'Sign in again.');
  const db = await findDatabase(parsed.data.dbId, ws.workspaceId);
  if (!db) return fail('NOT_FOUND', 'Database not found.');
  try {
    /* sql */
  } catch (e) {
    if (isUniqueViolation(e))
      return fail('CONFLICT', 'A database with this name already exists.');
    console.error('[settings] rename failed', { dbId: db.id });
    return fail('INTERNAL', 'Something broke. Try again.');
  }
  revalidatePath(`/redis/${db.id}`);
  return ok({ name: parsed.data.name });
}
```

Client forms call actions inside `useTransition`, show `Button loading`, map `fieldErrors` onto `Field error`, and toast `message` on failure. Success toasts use the copy in §12.12.

### 12.7 Console shell

- `ConsoleTopBar` (`components/console/top-bar.tsx`): `sticky top-0 z-40 border-b-4 border-black bg-white`, height `h-20`. Left: `Logo` → `/redis`. Nav links `REDIS` (`/redis`), `QUOTAS` (`/quotas`), `DOCS` (GitHub docs URL, external icon). Link classes: `px-3 py-2 font-bold uppercase border-2 border-transparent transition-all duration-100 hover:border-black hover:bg-neo-accent hover:shadow-neo-sm`; active: `border-black bg-neo-secondary shadow-neo-sm`. Right: `OrganizationSwitcher` (`afterSelectOrganizationUrl="/redis"`, `afterCreateOrganizationUrl="/redis"`, `hidePersonal={false}`) and `UserButton`. Mobile (`<md`): a hamburger `Button variant="outline" size="icon"` opens a full-width drawer (`Dialog` variant) with stacked bordered link buttons.
- Canvas: `min-h-dvh bg-neo-canvas` with a `bg-grid` layer. Content in `Container` with `py-8 md:py-10`.
- Footer: `border-t-4 border-black bg-neo-secondary py-4 text-sm font-bold uppercase` → `DOWNSTASH v1.0.0 · $0.00/MONTH · MIT`.

### 12.8 Pages

#### 12.8.1 `/redis` — Database list

- `PageHeader`: eyebrow badge `REDIS`; title `DATABASES`; description `Serverless Redis on your own free tier. Drop-in for @upstash/redis.`; action `Button primary` with `Plus` → `CREATE DATABASE` (opens the create dialog).
- Data: `listDatabases(workspaceId)` returns id, name, l1_ttl_ms, created_at, keys and bytes (latest `db_stats_daily`), commands today (sum of `usage_hourly` since 00:00 UTC).
- Desktop (`md+`): `Table` with columns `NAME` (font-black, link), `KEYS`, `STORAGE`, `COMMANDS TODAY`, `L1 CACHE` (`Badge` `OFF` white / `5S` muted), `CREATED`, and a row action `DropdownMenu` (`OPEN`, `SETTINGS`, `DELETE`). Clicking a row navigates.
- Mobile: a stack of `Card interactive` items with the same data.
- Empty state: `EmptyState` with title `NO DATABASES. YET.`, description `Create your first database. It costs exactly $0.00.`, and action `CREATE DATABASE`. A rotated `Sticker` `FREE FOREVER` sits at the top-right of the empty state (`absolute -right-4 -top-4 rotate-3`).
- Workspace limit reached: the create button is disabled, with a `Tooltip` `LIMIT: {n} DATABASES PER WORKSPACE`.

#### 12.8.2 Create database dialog (`features/databases/components/create-database-dialog.tsx`)

Upstash order, our look. Header `CREATE DATABASE`.

1. `Field` **NAME**: `Input` (placeholder `my-cache`), hint `Lowercase letters, numbers and dashes. 3–40 characters.` zod: `/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/`. Input is auto-lowercased as you type.
2. **REGION** (read-only info block, `border-4 border-black bg-neo-muted p-4`): two rows with icons, `GATEWAY: GLOBAL EDGE · CLOUDFLARE 300+ CITIES` and `STORAGE: {NEXT_PUBLIC_STORAGE_REGION_LABEL}`.
3. **L1 EDGE CACHE**: a `Switch` (default off) plus a description `Serve hot reads from Worker memory. Reads may be up to the TTL stale.` When on, a `Select` TTL with `1 SECOND`, `5 SECONDS` (default), `10 SECONDS`.
4. **PLAN**: a single selected card (`border-4 border-black bg-neo-secondary p-4 shadow-neo-sm`) with `FREE FOREVER`, `$0.00 / month`, and bullets `100K gateway requests/day`, `500 MB storage`, `Unlimited failover via Supabase`. A `Sticker` `ONLY PLAN` rotated -3 overlaps its corner.

- Footer: `CANCEL` (outline) and `CREATE` (primary, loading).
- Action `createDatabase({ name, l1TtlMs })`: check the limit → `issueTokenPair()` → one SQL transaction inserting the database and both tokens → `revalidatePath('/redis')` → return `{ id }`. The client then `router.push('/redis/' + id)` and toasts `DATABASE CREATED`.

#### 12.8.3 `/redis/[dbId]` layout — Database header

- Breadcrumb `REDIS / {name}` (small, uppercase).
- Title: database name in `text-4xl md:text-6xl font-black uppercase tracking-tighter`, wrapped in an inline `bg-neo-secondary border-4 border-black px-3 -rotate-1 shadow-neo-sm` highlight box.
- Badges: `FREE`, `GLOBAL EDGE`, `L1: OFF|5S`, `CREATED {date}`.
- `NavTabs`: `DETAILS`, `USAGE`, `DATA BROWSER`, `CLI`, `SETTINGS`.

#### 12.8.4 Details tab

Grid `lg:grid-cols-[3fr_2fr] gap-6`.

Left: `Card` header `CONNECT` (tone secondary), with a header-right `Switch` labelled `SHOW SECRETS`.

- Row `Tabs` for token kind: `STANDARD` / `READ-ONLY`. It switches which token the snippets and `SecretField` use.
- `Field` `UPSTASH_REDIS_REST_URL`: a non-secret box + `CopyButton`, value `NEXT_PUBLIC_GATEWAY_URL`.
- `SecretField` `UPSTASH_REDIS_REST_TOKEN` (reveal via `revealToken({dbId, kind})`).
- Code `Tabs`: `@upstash/redis`, `@upstash/ratelimit`, `@downstash/client`, `.env`, `cURL`, `Python`. Each renders `CodeBlock` with the snippet from §17.3. While secrets are hidden, `{TOKEN}` shows `********`. Highlighting runs on the server. The client swaps in revealed tokens by re-requesting the snippet HTML through the `getConnectSnippets({dbId, kind, reveal:true})` server action, which returns pre-highlighted HTML.

Right column:

- 2×2 `StatCard`s: `COMMANDS TODAY` (Activity, accent), `KEYS` (KeyRound, secondary), `STORAGE` (Database, muted), `L1 HIT RATE` (Zap, white; `—` when L1 is off).
- `Card` `DATABASE FACTS` (tone muted) as a definition list: `ID` (mono + copy), `ENDPOINT`, `STORAGE`, `EVICTION: NONE`, `MAX REQUEST: 1 MB`, `MAX PIPELINE: 1000 COMMANDS`, `DURABILITY: UNLOGGED (cache-grade)` with an info tooltip linking `docs/ops/durability.md`, `CREATED`.

#### 12.8.5 Usage tab

- Header row: `Tabs` range `24H` / `7D` / `30D` (search param `?range=24h|7d|30d`, default `24h`; server-rendered, changing it navigates with `router.replace`).
- Summary `StatCard`s for the range: `REQUESTS`, `COMMANDS`, `ERRORS`, `FAILOVER REQUESTS`.
- Grid `md:grid-cols-2 gap-6` of `ChartCard`s:
  1. `COMMANDS` — stacked bars reads/writes.
  2. `REQUESTS` — bars requests, with failover as an overlay series.
  3. `L1 CACHE HITS` — bars.
  4. `ERRORS` — bars.
  5. `BANDWIDTH` — bars bytes in/out (formatted).
  6. `STORAGE` — line of `db_stats_daily.bytes` (always 30d), with keys as a second line.
- Buckets: 24h → hourly (24 bars, zero-filled); 7d/30d → daily (zero-filled). Zero-fill in SQL with `generate_series`.
- Footnote (small): `Counters are approximate: L1 hits and bandwidth are batched per edge isolate.`

#### 12.8.6 Data browser tab

Layout `lg:grid-cols-[2fr_3fr] gap-6`, stacking on mobile (selecting a key on mobile scrolls to the detail panel).

**Left panel — `KeyList` card** (header tone `black`, title `KEYS`, header actions: `RefreshCw` icon button, `ADD KEY` secondary small):

- Controls: `Input` search (placeholder `user:*`, glob, debounced 300 ms; empty = `*`) and `Select` type `ALL TYPES/STRING/HASH/LIST/SET/ZSET`.
- List: SCAN-driven (`SCAN cursor MATCH p COUNT 100 [TYPE t]`), loading pages until it collects 50 keys or the cursor is `0`. Each row: `TypeBadge`, key (`font-mono text-sm truncate`), TTL (`formatTtl`) on the right. Selected row `bg-neo-secondary`. Rows are `button`s with `aria-pressed`.
- `LOAD MORE` outline button while the cursor ≠ 0. Show the `DBSIZE` count at the bottom: `{n} KEYS TOTAL`.
- Selected key in the URL: `?key=<encoded>` (deep-linkable).

**Right panel — `KeyDetail` card**:

- Header (tone secondary): key in `font-mono` (break-all), `TypeBadge`, and actions `TTL` (opens a popover: seconds `Input` + `SET TTL` + `PERSIST`) and `DELETE` (AlertDialog `DELETE KEY?`).
- Meta row: `TTL {formatted}` · `{n} ITEMS` / `{bytes}`.
- Body per type (all mutations go through `runCommands` in one pipeline per user action; after a mutation, re-fetch the key):

| Type   | Fetch                                                          | View & edit                                                                                                                                                                              |
| ------ | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| string | `GET`                                                          | `Textarea` mono; a `FORMAT JSON` toggle when the value parses as JSON; `SAVE` → `SET k v KEEPTTL`                                                                                        |
| hash   | `HLEN`, `HGETALL` (cap the view at 1000 fields, with a notice) | `Table` FIELD / VALUE / actions; inline edit → `HSET`; delete → `HDEL`; add row form (field, value) → `HSET`                                                                             |
| list   | `LLEN`, `LRANGE 0 499`                                         | `Table` INDEX / VALUE; edit → `LSET`; delete → pipeline `LSET k i __downstash_tombstone__` then `LREM k 1 __downstash_tombstone__`; add form with `HEAD`/`TAIL` select → `LPUSH`/`RPUSH` |
| set    | `SCARD`, `SMEMBERS` (cap 1000)                                 | list of members; remove → `SREM`; add → `SADD`                                                                                                                                           |
| zset   | `ZCARD`, `ZRANGE k 0 499 WITHSCORES`                           | `Table` MEMBER / SCORE; edit score → `ZADD k score member`; remove → `ZREM`; add form → `ZADD`                                                                                           |

- Empty selection: `EmptyState` `PICK A KEY` / `Select a key on the left or add a new one.`
- Missing key (deleted elsewhere): `EmptyState` `KEY GONE` with a refresh button.

**Add key dialog**: `TYPE` select, `KEY` input (mono), `TTL (SECONDS, OPTIONAL)`, and value inputs per type: string → textarea; hash → first field + value; list/set → first element; zset → member + score. Submit runs `EXISTS` and fails with `CONFLICT` `Key already exists.` if it exists. Then the type-specific command, plus `EXPIRE` if a TTL was given, in one pipeline.

Actions (`features/browser/actions.ts`): `scanKeys`, `getKey`, `saveString`, `hashSet`, `hashDelete`, `listSet`, `listDelete`, `listPush`, `setAdd`, `setRemove`, `zsetAdd`, `zsetRemove`, `setTtl`, `persistKey`, `deleteKey`, `createKey`. Each validates with zod, calls `requireDatabase` and returns `ActionResult`.

#### 12.8.7 CLI tab

- `Card` whose body is a terminal: `bg-black text-white font-mono text-sm p-4 h-[60vh] overflow-y-auto` with `bg-noise` texture at `opacity-10`. The header (tone accent) is titled `CLI`, with a `CLEAR` outline small button and a `HELP` ghost.
- Welcome lines on mount (yellow `text-neo-secondary`): `DOWNSTASH CLI — connected to {name}` and `Type HELP for commands. ↑/↓ for history.`
- Prompt: `{name}>` in `text-neo-accent` with an `<input>` (`bg-transparent text-white caret-neo-secondary outline-none w-full font-mono`, `aria-label="Command"`, autofocus, `autoComplete="off"`, `spellCheck={false}`).
- Each submitted line echoes `{name}> {line}`, then output (`formatCli`) in white. Errors in `text-neo-accent`.
- Built-ins (client-side, case-insensitive): `HELP` (lists families and links to the docs commands page), `CLEAR`, `HISTORY`.
- `FLUSHDB`/`FLUSHALL` ask `Type the database name to confirm:`. The next line must equal the name or it prints `(aborted)`.
- History: last 100 lines in `localStorage` key `downstash:cli:{dbId}`, navigated with ↑/↓.
- Execution: server action `execCli({ dbId, line })` → `tokenizeCli` → `runCommands(db, [argv])` → returns the envelope. The client formats it.

#### 12.8.8 Settings tab

A stack of cards (`space-y-6`, `max-w-3xl`):

1. `RENAME DATABASE` (tone muted): `Field` NAME + `SAVE`. Hint: `Clients don't use the name. Tokens stay the same.`
2. `L1 EDGE CACHE` (tone muted): `Switch` + TTL `Select` + `SAVE`. Copy: `Off by default. When on, GET/HGET/HGETALL/LRANGE/SMEMBERS/ZSCORE/MGET/HMGET/SISMEMBER replies may be cached per edge isolate for up to the TTL.`
3. `RESET CREDENTIALS` (tone secondary): two rows, `STANDARD TOKEN` (hint) + `ROTATE`, `READ-ONLY TOKEN` (hint) + `ROTATE`. Each opens an `AlertDialog` `ROTATE TOKEN?` with the text `The old token stops working within 60 seconds. Update your apps right after.` Rotation runs in one transaction: set the old row's `revoked_at = now()`, insert the new token. Afterwards a `Dialog` shows the new token once in a `SecretField` (revealed) + copy.
4. `DANGER ZONE` (Card with header tone accent and a `bg-stripes` texture strip at the top):
   - `FLUSH DATABASE`: deletes all keys. `AlertDialog` with `confirmText={name}` → `console_run [['FLUSHDB']]`.
   - `DELETE DATABASE`: `AlertDialog` with `confirmText={name}` → `downstash.delete_database` → `redirect('/redis')` and toast `DATABASE DELETED`.

#### 12.8.9 `/quotas`

- `PageHeader` with title `QUOTAS` and description `Everything here is free. These are the ceilings.`
- Cards with `ProgressBar`:
  - `GATEWAY REQUESTS TODAY`: `sum(requests)` across **all** databases since 00:00 UTC / `100,000` (Cloudflare Workers Free). Sub-label `Resets in {hh:mm} (00:00 UTC). Over the limit? @downstash/client fails over to Supabase.`
  - `DATABASE SIZE`: `pg_database_size(current_database())` / `500 MB` (Supabase Free).
  - `KEYS (ALL DATABASES)`: count only, no bar.
- `Card` `BACKGROUND JOBS`: `Table` of `cron.job` joined with the latest `cron.job_run_details` (JOB, SCHEDULE, LAST RUN, STATUS badge `SUCCEEDED` secondary / `FAILED` accent).
- Note card (tone black, white text): `Supabase pauses free projects after 7 days of inactivity. The gateway pings the database every 6 hours to prevent it.`

#### 12.8.10 `/account`

`PageHeader` with title `ACCOUNT`, then `<UserProfile routing="path" path="/account" />` styled with `clerkAppearance`.

### 12.9 Auth pages

`(auth)/layout.tsx`: `grid min-h-dvh lg:grid-cols-[3fr_2fr]`.

- Left (hidden below `lg`): `Section tone="secondary"` with a `halftone` texture. `Logo` top-left. Headline over three lines: `STASH` (solid), `KEYS` (`text-stroke`), `FOR $0.` (inside a `bg-neo-accent border-4 border-black px-3 rotate-1 shadow-neo-md` box), each `text-8xl font-black leading-[0.85]`. Floating stickers: `NO CARD NEEDED` (rotate-3, white), `UPSTASH-COMPATIBLE` (-rotate-2, muted), and a spinning `Star` (`animate-spin-slow size-16 fill-black`).
- Right: canvas background with a `grid` texture, centered `<SignIn />` / `<SignUp />`. On mobile, `Logo` sits above the form.

### 12.10 404 and error pages

- `not-found.tsx`: giant `404` in `text-[10rem] md:text-[16rem] font-black text-stroke leading-none`, a solid overlay copy offset by 8px in `text-neo-accent`, sticker `KEY NOT FOUND (nil)`, and a `Button` `BACK TO DATABASES`.
- `error.tsx`: `(error) SOMETHING BROKE` plus a `TRY AGAIN` button calling `reset()`. Show the error digest in mono.

### 12.11 Landing page (`(marketing)/page.tsx`) — exact sections and copy

Compose from `components/marketing/*`. One component per section, named as below.

1. **`MarketingNav`**: `border-b-4 border-black bg-neo-canvas h-20`; `Logo`; links `HOW IT WORKS` (#how), `COMPARE` (#compare), `FAQ` (#faq), `GITHUB` (external); right: signed out → `SIGN IN` (ghost) + `START FREE` (primary) → `/sign-up`; signed in → `OPEN CONSOLE` (primary) → `/redis` (use Clerk `<SignedIn>`/`<SignedOut>`). Mobile hamburger.
2. **`TrustMarquee`**: `Marquee` items `$0.00 / MONTH FOREVER`, `100K REQUESTS / DAY`, `500 MB STORAGE`, `DROP-IN @UPSTASH/REDIS`, `@UPSTASH/RATELIMIT READY`, `AUTO FAILOVER`, `NO CREDIT CARD`, `MIT LICENSED`.
3. **`Hero`** (`Section tone="canvas"` + `grid` texture, `lg:grid-cols-[3fr_2fr]`, `py-16 md:py-24`):
   - Left: `Badge` pill `SELF-HOSTED SERVERLESS REDIS`; H1 on three lines: `REDIS` (solid), `FOR` (`text-stroke`), `$0.00` (`inline-block bg-neo-secondary border-4 border-black px-4 -rotate-2 shadow-neo-md`); paragraph `text-xl md:text-2xl`: `Downstash speaks the Upstash REST protocol on Cloudflare Workers and Supabase Postgres. Keep your code. Lose the bill.`; buttons `START FREE` (primary lg, `ArrowRight`) and `READ THE DOCS` (outline lg); a micro-row of three `Star` icons + `ZERO SURPRISE BILLS. EVER.`
   - Right "chaos zone" (`relative min-h-[420px]`): a `CodeBlock` (`index.ts`) rotated `rotate-1` showing the `@upstash/redis` snippet with the Downstash URL; a `Sticker` circle `NO CODE CHANGES` (accent, `absolute -left-6 -top-6 -rotate-12`, `animate-bounce` disabled for reduced motion); a `Sticker` `<1MS L1 READS` (muted, `absolute -bottom-6 right-4 rotate-3`); a spinning `Star` (`absolute right-0 top-0 size-20 animate-spin-slow fill-neo-secondary stroke-black stroke-[3px]`); a black square (`absolute -bottom-10 -left-4 size-16 border-4 border-black bg-black`); background number `00` (`absolute -right-6 top-1/3 text-[12rem] font-black text-stroke opacity-30 select-none`, aria-hidden).
4. **`HowItWorks`** (`id="how"`, `Section tone="secondary"` + halftone texture): H2 `HOW IT WORKS`; three `Card interactive` steps with numbers in black boxes (`size-16 bg-black text-white text-3xl font-black grid place-items-center border-4 border-black`), staggered `md:translate-y-6` on the middle card:
   - `01 DEPLOY THE GATEWAY` — `One wrangler deploy puts the Hono gateway on Cloudflare's free edge in 300+ cities.`
   - `02 POINT IT AT SUPABASE` — `Commands run as atomic PL/pgSQL inside your free Supabase Postgres. No Redis server to babysit.`
   - `03 SWAP TWO ENV VARS` — `Set UPSTASH_REDIS_REST_URL and _TOKEN. Your @upstash/redis code just works.`
5. **`Comparison`** (`id="compare"`, `Section tone="canvas"`): H2 `THE MATH`; `Table` with columns `FREE TIER`, `UPSTASH`, `DOWNSTASH` (header cell `bg-neo-accent`). Rows: `Daily requests` · `10,000 commands` · `100,000 gateway requests + failover`; `Storage` · `256 MB` · `500 MB`; `Over the limit` · `HTTP 429` · `Automatic Supabase failover`; `Surprise bill risk` · `With pay-as-you-go` · `None. No card on file.`; `Wire protocol` · `Upstash REST` · `Upstash REST (same)`; `Hosting` · `Managed` · `Your Cloudflare + Supabase`. Below it, a rotated sticker `NUMBERS FROM OUR PRD. CHECK YOUR PROVIDER'S CURRENT LIMITS.` (small, white, -rotate-1). This is honest disclosure; keep it.
6. **`Features`** (`Section tone="muted"` + dots texture): H2 `WHAT YOU GET`; a 3-column grid of 6 `Card interactive`s, each with an icon box (alternating accent/secondary/white):
   - `Zap` `L1 EDGE CACHE` — `Opt-in hot reads served from Worker memory in under a millisecond.`
   - `Lock` `ATOMIC EVERYTHING` — `Every command and pipeline runs in one Postgres transaction.`
   - `ShieldCheck` `HASHED TOKENS` — `Tokens are SHA-256 hashed. Read-only tokens can't write. Ever.`
   - `LifeBuoy` `DIRECT-RPC FAILOVER` — `Hit the Cloudflare daily cap? @downstash/client reroutes to Supabase automatically.`
   - `Timer` `TTL ON AUTOPILOT` — `pg_cron sweeps expired keys every minute and keeps your project awake.`
   - `Gauge` `RATELIMIT READY` — `Fixed window, sliding window and token bucket from @upstash/ratelimit work as-is.`
7. **`DropIn`** (`Section tone="canvas"`, `lg:grid-cols-2`): H2 `CHANGE NOTHING`; left `CodeBlock` `before.env` (Upstash URL/token), right `CodeBlock` `after.env` (Downstash URL/token). A thick arrow (`ArrowRight size-16 stroke-[4px]`) sits between them on desktop (`ArrowDown` on mobile). Caption `Same SDK. Same commands. Different bill: $0.00.`
8. **`RatelimitShowcase`** (`Section tone="black"`, white text): H2 in `text-neo-secondary`: `RATE LIMIT ANYTHING`; a `CodeBlock` with the ratelimit snippet, wrapped in `shadow-neo-white-xl`; a column of three stats, each `border-4 border-white p-6`: `5 / 10S` `SLIDING WINDOW`, `1 RPC` `PER LIMIT CHECK`, `0 LUA` `NATIVE PL/pgSQL PORTS`.
9. **`Faq`** (`id="faq"`, `Section tone="secondary"`): H2 `QUESTIONS`; `Accordion` (single, collapsible):
   - `Is it really free?` — `Yes. It runs entirely inside the Cloudflare Workers free plan and the Supabase free plan. You bring the accounts; we bring the code.`
   - `Do I need to change my code?` — `No. Point @upstash/redis at your gateway URL and token. For automatic failover, wrap it with @downstash/client.`
   - `Is my data durable?` — `Keys live in an UNLOGGED Postgres table for speed. A database crash can wipe them, which is fine for caches and rate limits. Need durability? Run pnpm db:durable.`
   - `What isn't supported?` — `Raw TCP (redis-cli, ioredis), Pub/Sub, Streams and arbitrary Lua. Known @upstash/ratelimit scripts run as native ports.`
   - `What happens at 100,000 requests?` — `Cloudflare starts returning 429s. @downstash/client switches to Supabase's REST endpoint until the gateway recovers.`
   - `Can my team use it?` — `Yes. Create a Clerk organization and every member can manage its databases.`
10. **`FinalCta`** (`Section tone="accent"` + noise texture): H2 `text-black` `STOP PAYING FOR CACHE.` with `CACHE.` in `text-stroke`; `Button dark lg` `DEPLOY DOWNSTASH`; sticker `TAKES ~10 MINUTES` rotated 2.
11. **`MarketingFooter`** (`border-t-4 border-black bg-neo-secondary py-12`): `Logo`; columns `PRODUCT` (Console, Quotas, Docs), `PROJECT` (GitHub, License: MIT, Changelog), `BUILT ON` (Cloudflare Workers, Supabase, Clerk); bottom row `© 2026 DOWNSTASH · $0.00 / MONTH · NOT AFFILIATED WITH UPSTASH`.

Metadata: title `Downstash — Serverless Redis for $0.00`; description `Self-hosted, Upstash-compatible serverless Redis and rate limiting on Cloudflare Workers + Supabase. Free forever.`; Open Graph image `app/opengraph-image.tsx` (`ImageResponse`: yellow background, black 16px border, `REDIS FOR $0.00` headline, logo mark).

### 12.12 UI copy rules (also in `docs/design/copy.md`)

- Headings, buttons, labels, badges, tabs and toasts: **UPPERCASE**, short, punchy (≤ 4 words for buttons).
- Body copy: sentence case, plain, second person ("you"), max ~20 words per sentence, no exclamation marks, no emojis.
- Numbers: `$0.00`, `100,000`, `500 MB`, `1 MB`, `60 S` (labels) / `60 seconds` (body).
- Standard toasts: `DATABASE CREATED`, `DATABASE RENAMED`, `SETTINGS SAVED`, `TOKEN ROTATED`, `KEY CREATED`, `KEY SAVED`, `KEY DELETED`, `TTL UPDATED`, `DATABASE FLUSHED`, `DATABASE DELETED`, `COPIED`. Errors: the `ActionResult.message`.
- Never say "Upstash" in the console UI except in connect snippets (package names, env var names). The landing page may compare.
- Redis replies are shown verbatim in mono (`(nil)`, `(integer) 1`).

---

## 13. Documentation system (mandatory)

**Purpose:** any future agent can find any piece of code, understand why it exists and change it safely **without reading the whole repo**. Documentation ships with every task (G7). `pnpm docs:check` enforces the mechanical parts in CI.

### 13.1 Structure

```text
docs/
├── README.md                     # Index: what's where, reading order for new agents
├── codemap.md                    # EVERY source file → one-line purpose (grouped by package)
├── progress.md                   # Task tracker (status per task ID, notes, deviations)
├── glossary.md                   # Copy of §0.3, kept current
├── architecture/
│   ├── overview.md               # System diagram, components, boundaries
│   ├── data-flow.md              # Request lifecycles: gateway, failover, console
│   └── security-model.md         # Tokens, roles, grants, RLS, threat model, secrets
├── conventions/
│   ├── writing-style.md          # How to write docs, comments, commit messages, UI copy pointers
│   ├── documentation.md          # Doc templates, frontmatter, update matrix (13.5), docs:check rules
│   ├── code-style-typescript.md
│   ├── code-style-sql.md
│   ├── code-style-react.md
│   ├── testing.md
│   └── git.md
├── engine/
│   ├── schema.md                 # Tables, columns, indexes, why UNLOGGED, collation "C"
│   ├── value-encoding.md         # §7.3 + §7.4
│   ├── commands.md               # GENERATED (pnpm docs:commands)
│   ├── adding-a-command.md       # §7.10, step by step with a worked example
│   ├── scripts.md                # Script registry, capture procedure, porting rules
│   ├── concurrency.md            # lock_live / lock_or_create / ordering / retries
│   └── errors.md                 # Error catalog (§17.2)
├── gateway/
│   ├── request-lifecycle.md
│   ├── protocol.md               # Upstash REST wire format as we implement it
│   ├── auth.md
│   ├── l1-cache.md
│   └── configuration.md          # vars, secrets, limits
├── client/
│   ├── usage.md
│   └── failover.md
├── web/
│   ├── routes.md                 # Route tree → files → data sources
│   ├── data-access.md            # db.ts, engine.ts, auth.ts, action rules
│   ├── auth.md                   # Clerk setup, workspaces, middleware
│   └── features.md               # One section per features/* module
├── design/
│   ├── system.md                 # Full Neo-brutalism brief (verbatim) + Downstash deviations
│   ├── tokens.md                 # Every token, its utility class and usage
│   ├── components.md             # Every components/ui item: props, variants, do/don't
│   ├── patterns.md               # Page patterns: PageHeader, chaos zone, stickers, color blocking
│   └── copy.md                   # §12.12
├── ops/
│   ├── local-dev.md              # Zero to running in N commands
│   ├── deploy.md                 # Supabase, Cloudflare, Vercel, Clerk prod
│   ├── env-vars.md               # Every env var in every app (§17.1)
│   ├── durability.md             # UNLOGGED caveat + db:durable
│   ├── quotas.md                 # Free-tier ceilings and what happens at each
│   └── runbook.md                # Symptoms → diagnosis → fix
└── adr/
    ├── 0000-template.md
    └── 0001 … 0013 (from §2 and §11.1)
```

Every package and app also has a `README.md` (purpose, how to run, test, where to look), and every `features/*` folder has its own `README.md`.

### 13.2 Doc template and frontmatter (all files in `docs/` except `codemap.md`, `progress.md` and generated files)

```markdown
---
title: Request lifecycle
status: stable # draft | stable | deprecated
last_updated: 2026-10-07
updated_by: P3-T2 # task ID of the most recent change
code_paths: # files this doc describes; docs:check verifies they exist
  - apps/gateway/src/app.ts
  - apps/gateway/src/routes/commands.ts
---

# Request lifecycle

> One-paragraph summary: what this is and when you'd read it.

## Where the code lives

| Concern            | File                                                       |
| ------------------ | ---------------------------------------------------------- |
| Route registration | [`apps/gateway/src/app.ts`](../../apps/gateway/src/app.ts) |

## How it works

…numbered steps, diagrams (mermaid), examples…

## Gotchas

- …

## Related

- [Auth](./auth.md) · ADR [0004](../adr/0004-token-format-and-auth.md)
```

ADR template (`docs/adr/0000-template.md`): `# NNNN. Title` · **Status** (Proposed/Accepted/Superseded by NNNN) · **Date** · **Context** · **Decision** · **Consequences** (positive/negative) · **Alternatives considered**.

### 13.3 Writing style guide (content of `docs/conventions/writing-style.md`)

**Docs voice**

- Audience: a competent engineer or agent new to this repo. Assume TypeScript/SQL literacy, not Downstash knowledge.
- Second person, present tense, active voice: "The gateway hashes the token", not "The token will be hashed".
- Lead with the answer. Background comes after.
- One idea per paragraph, ≤ 4 sentences. Prefer tables and numbered steps over prose.
- Use the glossary terms exactly (§0.3). Code identifiers go in backticks. File references are relative markdown links.
- Every claim about behavior points to code (`file#Lx-Ly` or a symbol name) or a test.
- Examples must be copy-paste runnable. Placeholders: `<ANGLE_BRACKETS>` in commands, `your-…` in prose.
- Headings: sentence case in docs (`## How it works`). (UI copy is uppercase; docs aren't.)
- No marketing language in docs ("blazing", "seamless", "simply", "just").
- Dates: ISO `2026-10-07`. Sizes: `500 MB`. Durations: `60 s`, `10 ms`.
- Alerts: GitHub style (`> [!NOTE]`, `> [!WARNING]`) at most twice per doc.

**Code comments**

- `@file` header on every file (§5.2). TSDoc on every export. SQL doc block on every function (Command / Syntax / Returns / Errors, or Purpose / Params / Returns).
- Comment why, invariants and gotchas. Don't narrate code.
- `TODO(P7-T4): …` must reference a task ID or issue. No bare TODOs.

**Commit messages:** §5.7. Body (optional) explains why and lists doc updates.

**Progress notes** (`docs/progress.md`): each entry has `### P3-T2 — <title>` then `Status`, `Date`, `Summary` (2–4 bullets), `Files`, `Deviations`, `Follow-ups`, `Verification` (commands + results).

### 13.4 Required docs per change type (the "update matrix")

| If you…                                         | You must update                                                                         |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| add/rename/delete any source file               | `docs/codemap.md` (+ the package README if it changes structure)                        |
| add/change a SQL table, column or index         | `docs/engine/schema.md`                                                                 |
| add/change a command                            | `docs/engine/commands.md` (regenerate), tests, differential corpus                      |
| touch concurrency/locking                       | `docs/engine/concurrency.md`                                                            |
| add/port a script                               | `docs/engine/scripts.md`, `tests/capture/scripts.json`                                  |
| add an error string                             | `docs/engine/errors.md` and `packages/protocol/src/errors.ts`                           |
| change gateway routing/headers/status codes     | `docs/gateway/protocol.md`, `docs/gateway/request-lifecycle.md`                         |
| add an env var/secret                           | `docs/ops/env-vars.md`, the relevant `.env.example` / `.dev.vars.example`, `lib/env.ts` |
| add a route/page                                | `docs/web/routes.md`                                                                    |
| add a feature module                            | `features/<x>/README.md`, `docs/web/features.md`                                        |
| add/change a UI component or token              | `docs/design/components.md` / `docs/design/tokens.md`                                   |
| make an architectural decision not in this plan | new ADR in `docs/adr/`                                                                  |
| finish a task                                   | `docs/progress.md`                                                                      |

### 13.5 `scripts/check-docs.ts` (root `docs:check`, runs in CI)

Fails when any of these is false:

1. Every `*.ts`, `*.tsx`, `*.sql`, `*.mjs` under `apps/`, `packages/`, `supabase/migrations/`, `scripts/` and `tests/` (excluding `node_modules`, `dist`, `.next`, `*.d.ts`, generated files) starts with a `@file` header within its first 5 lines.
2. Every such file path appears in `docs/codemap.md` (as `` `path` ``).
3. Every path in `docs/codemap.md` exists.
4. Every doc with frontmatter has `title`, `status`, `last_updated`, `updated_by`, and all `code_paths` exist.
5. Relative markdown links in `docs/**` and `README.md` resolve.
6. `docs/engine/commands.md` is up to date (regenerate and diff).

### 13.6 `AGENTS.md` (root, written in P0-T1; keep it ≤ 80 lines)

Contents, in order:

1. One-paragraph project summary + links to `PRD.md`, `plan.md`, `docs/README.md`.
2. **Reading order**: AGENTS.md → docs/README.md → docs/codemap.md → docs/progress.md → your task in plan.md §16.
3. The golden rules (§0.2) as a numbered list.
4. Command cheat sheet: `pnpm i`, `pnpm db:start`, `pnpm db:reset`, `pnpm dev`, `pnpm test`, `pnpm test:sql`, `pnpm test:compat`, `pnpm test:e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm docs:check`, `pnpm design:check`.
5. "Where things live" table (package → purpose → main doc).
6. Definition of Done checklist (§16.0).

---

## 14. Testing strategy

| Layer          | Tool                                             | Location                 | Runs against                                       | Command                                  |
| -------------- | ------------------------------------------------ | ------------------------ | -------------------------------------------------- | ---------------------------------------- |
| Protocol unit  | vitest                                           | `packages/protocol/test` | pure TS                                            | `pnpm --filter @downstash/protocol test` |
| Gateway unit   | vitest (node)                                    | `apps/gateway/test`      | `FakeStorage`                                      | `pnpm --filter @downstash/gateway test`  |
| Client unit    | vitest                                           | `packages/client/test`   | mocked fetch                                       | `pnpm --filter @downstash/client test`   |
| Storage engine | vitest + `postgres`                              | `tests/sql`              | local Supabase DB (`127.0.0.1:54322`)              | `pnpm test:sql`                          |
| Compatibility  | vitest + `@upstash/redis` + `@upstash/ratelimit` | `tests/compat`           | `wrangler dev` gateway on `:8787` → local Supabase | `pnpm test:compat`                       |
| Differential   | vitest                                           | `tests/differential`     | Downstash gateway vs SRH (`:8079`) → Redis 7       | `pnpm test:diff`                         |
| Web unit       | vitest + Testing Library (jsdom)                 | `apps/web/test`          | components, schemas, format, crypto                | `pnpm --filter @downstash/web test`      |
| E2E + a11y     | Playwright + `@clerk/testing` + axe              | `apps/web/e2e`           | `next dev` + gateway + local Supabase              | `pnpm test:e2e`                          |

### 14.1 Helpers (`tests/helpers`)

- `sql.ts`: a shared `postgres` client (`TEST_DATABASE_URL`, default local) and `exec(db, ...argv)` → `downstash.console_run` envelope, plus `rawRun(dbId, readonly, commands)`.
- `fixtures.ts`: `createTestDatabase(): Promise<{ id, standard, readonly, cleanup }>` inserts a database with random tokens (hash via node crypto) in workspace `test`. **Every test file creates its own database** for isolation, and `afterAll(cleanup)`.
- `gateway.ts`: `GATEWAY_URL` (default `http://127.0.0.1:8787`) and `waitForHealth()`.
- `srh.ts`: `SRH_URL` (default `http://127.0.0.1:8079`), `SRH_TOKEN` = `example_token`, plus `flushSrh()`.
- `tests/docker-compose.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine
    ports: ['6379:6379']
  srh:
    image: hiett/serverless-redis-http:latest
    environment:
      SRH_MODE: env
      SRH_TOKEN: example_token
      SRH_CONNECTION_STRING: redis://redis:6379
    ports: ['8079:80']
    depends_on: [redis]
```

### 14.2 Required SQL test cases per command family

For each command: happy path; missing key; wrong type → WRONGTYPE; arity errors; every option; TTL interaction (expired keys behave as missing); readonly token → NOPERM for writes; and **concurrency** for INCR, HSET, LPUSH, SADD and ZADD (fire 50 parallel `INCR`s on separate connections and expect a final value of 50; same idea for the others).

Engine-level tests: `run` with 1000 commands; 1001 → error; a pipeline with a mid-pipeline error continues; deadlock retry surfaced as 40P01 (simulate with two transactions locking in opposite order); `gw_run` with bad hash, revoked token or readonly token; the failover RPC granted to anon (connect as the `anon` role via `set role anon` and call `public.downstash_exec`); **anon cannot** call `downstash_gw_run` or `select` from `downstash.kv` (expect permission denied); usage counters increment correctly per source; `sweep_expired` removes expired rows; SCAN completeness (insert 1000 keys, scan with COUNT 37 while deleting and adding keys; every key that existed throughout appears ≥ 1 time).

### 14.3 Compatibility acceptance (PRD §10, mandatory)

1. `@upstash/redis` against the gateway: `get/set/incr/del/expire/ttl/mget/mset/hset/hgetall/lpush/lrange/sadd/smembers/zadd/zrange/scan/pipeline/multi/exists/type`, with `responseEncoding` default (base64) **and** `false`. Includes JSON auto-(de)serialization of objects.
2. `@upstash/ratelimit`: for each algorithm (`fixedWindow(5,'10 s')`, `slidingWindow(5,'10 s')`, `tokenBucket(5,'10 s',5)`, `cachedFixedWindow(5,'10 s')`), 5 calls succeed and the 6th has `success: false`; `remaining` and `reset` match an SRH run within ±1 s; `getRemaining` and `resetUsedTokens` work.
3. Failover: `@downstash/client` with an unreachable gateway URL and with a stub server returning 429 → commands succeed via the local Supabase RPC; `onFailover` fires.
4. pg_cron: a key with a 5 s TTL is gone (row deleted, not only hidden) within 70 s. Mark it `test.slow`; it runs in CI nightly and locally on demand (`pnpm test:compat -- --grep cron`).

### 14.4 Differential corpus

`tests/differential/corpus/<family>.json`: arrays of steps `{ "cmd": [...], "normalize"?: "sort" | "float" | "scanCursor" | "ttlRange" }`. The runner flushes both targets, executes the steps against SRH and the Downstash gateway with raw `fetch`, and compares normalized envelopes. Error messages are compared by **prefix** (first word, e.g. `WRONGTYPE`, `ERR`). ≥ 300 steps total, ≥ 20 per family.

### 14.5 E2E (Playwright)

Use `@clerk/testing` (`clerkSetup()` in global setup, test user via `CLERK_TEST_USER_EMAIL`/`_PASSWORD`, or keyless dev instance). Specs:

- `landing.spec.ts`: sections render, nav anchors, CTA → sign-up, axe has no serious/critical violations.
- `databases.spec.ts`: create → redirected to details → appears in the list; duplicate name shows an error.
- `connect.spec.ts`: reveal token → a curl via `request.post(GATEWAY_URL)` with that token returns `PONG`.
- `browser.spec.ts`: add a string/hash/list/set/zset key, edit, TTL, delete.
- `cli.spec.ts`: `SET a 1`, `GET a` shows `"1"`, `INCR a` shows `(integer) 2`, history ↑.
- `settings.spec.ts`: rename, rotate token (the old one fails after cache TTL, so set the gateway `AUTH_CACHE_TTL_MS=1000` in the e2e env), flush, delete.
- `a11y.spec.ts`: axe on `/`, `/redis`, details, usage, browser, cli, settings, quotas. Zero serious/critical.
- Viewports: run `databases` and `landing` at 390×844 and 1440×900.

---

## 15. Deployment, operations & CI

### 15.1 Local development (`docs/ops/local-dev.md`)

```bash
nvm use                        # Node 22
corepack enable && pnpm i
pnpm db:start                  # Supabase in Docker; prints API URL + keys
pnpm db:reset                  # applies migrations + seed
cp apps/gateway/.dev.vars.example apps/gateway/.dev.vars   # paste the local secret/service_role key
cp apps/web/.env.example apps/web/.env.local               # set TOKEN_ENCRYPTION_KEY via pnpm gen:enc-key
pnpm dev                       # gateway :8787, web :3000 (Clerk keyless mode works without keys)
curl -s -X POST http://127.0.0.1:8787/ \
  -H "Authorization: Bearer dsk_local0standard0token0for0development0only0x" \
  -d '["PING"]'                # → {"result":"PONG"}
```

### 15.2 Production deploy (`docs/ops/deploy.md`)

1. **Supabase**: create a free project, pick the region and save the DB password. `pnpm supabase login && pnpm supabase link --project-ref <ref> && pnpm db:push`. Verify pg_cron jobs exist (`select jobname from cron.job`). Copy: project URL, **secret key** (for the gateway), **publishable key** (for client failover snippets), and the transaction pooler connection string (for web).
2. **Cloudflare**: `pnpm --filter @downstash/gateway exec wrangler login`, then `wrangler secret put SUPABASE_URL` and `wrangler secret put SUPABASE_SECRET_KEY`, then `pnpm --filter @downstash/gateway run deploy`. Verify `GET https://<worker>/health`.
3. **Clerk**: create an application (email + Google), optionally enable Organizations. For production, create a production instance and set domains. Copy the keys.
4. **Vercel**: import the repo with root `apps/web`. Framework Next.js, install command `pnpm i --frozen-lockfile` (Vercel detects the pnpm workspace), and every env var from §12.3. Deploy.
5. **Smoke test**: sign up → create a database → copy the token → `curl` PING → run the ratelimit snippet locally.
6. **Alternative web hosting (free, commercial-friendly)**: Cloudflare Workers via `@opennextjs/cloudflare`. Documented as an appendix in `deploy.md`, not implemented in v1.

### 15.3 CI (`.github/workflows/ci.yml`)

Triggered on push and pull_request. Jobs:

1. `static`: checkout → pnpm setup (`pnpm/action-setup`) → Node 22 with pnpm cache → `pnpm i --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm format:check` → `pnpm docs:check` → `pnpm design:check`.
2. `unit`: `pnpm --filter @downstash/protocol --filter @downstash/gateway --filter @downstash/client --filter @downstash/web test`.
3. `engine` (needs Docker): `supabase/setup-cli@v1` → `supabase start -x studio,imgproxy,inbucket,edge-runtime,logflare,vector,supavisor` (exclude unneeded services; check current flag names) → `supabase db reset` → `pnpm test:sql`.
4. `compat`: same Supabase setup + `docker compose -f tests/docker-compose.yml up -d` → write `.dev.vars` from `supabase status -o env` → `pnpm --filter @downstash/gateway dev &` → `wait-on http://127.0.0.1:8787/health` → `pnpm test:compat` → `pnpm test:diff`.
5. `e2e` (on main + label `e2e`): full stack + Playwright browsers → `pnpm test:e2e`. Upload the Playwright report as an artifact.

`.github/workflows/deploy-gateway.yml`: on push to `main` touching `apps/gateway/**` or `packages/protocol/**` → `cloudflare/wrangler-action@v3` with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets. Database migrations are **not** auto-applied; `db:push` stays manual (documented).

### 15.4 Runbook topics (`docs/ops/runbook.md`)

Gateway returns 503 (Supabase paused? keys rotated?) · 401 for a valid token (revoked? cache TTL?) · Cloudflare 429 (daily cap; check quotas page; failover working?) · DB near 500 MB (find big databases on the quotas page; flush; TTLs) · pg_cron failures (`cron.job_run_details`) · all keys vanished (UNLOGGED crash truncation; see durability) · deadlock errors (retry exhausted; investigate pipeline key order).

---

## 16. Phased task breakdown

### 16.0 Definition of Done (applies to every task)

- [ ] All deliverables exist at the exact paths listed.
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm format:check` pass.
- [ ] The task's acceptance commands pass, and their output is summarized in `docs/progress.md`.
- [ ] New and changed behavior has tests.
- [ ] `pnpm docs:check` passes (headers, codemap, frontmatter, links). For web tasks, `pnpm design:check` passes.
- [ ] Docs from the task's **Docs** list and the update matrix (§13.4) are updated.
- [ ] No secrets committed. No paid dependency added.
- [ ] Commit(s) follow §5.7 and include the task ID.

### 16.1 Dependency graph

```mermaid
flowchart LR
  P0T1["P0-T1 scaffold"] --> P0T2["P0-T2 docs"] --> P0T3["P0-T3 tooling+CI"]
  P0T3 --> P1T1["P1-T1 schema"] --> P1T2["P1-T2 engine core"]
  P1T2 --> P1T3["P1-T3 server"] & P1T4["P1-T4 strings"] & P1T5["P1-T5 keyspace"] & P1T6["P1-T6 hashes"] & P1T7["P1-T7 lists"] & P1T8["P1-T8 sets"] & P1T9["P1-T9 zsets"] & P1T10["P1-T10 ops"]
  P0T3 --> P2T1["P2-T1 protocol core"] --> P2T2["P2-T2 CLI fmt"] & P2T3["P2-T3 docs gen"]
  P2T1 --> P3T1["P3-T1 gw scaffold"] --> P3T2["P3-T2 routes+storage"] --> P3T3["P3-T3 auth"] --> P3T4["P3-T4 encoding/CORS"] --> P3T5["P3-T5 L1"] --> P3T6["P3-T6 cron+deploy"]
  P1T4 & P1T5 & P1T6 & P3T4 --> P4T1["P4-T1 scripts"] --> P4T3["P4-T3 ratelimit compat"]
  P1T3 & P1T4 & P1T5 & P1T6 & P1T7 & P1T8 & P1T9 & P3T4 --> P4T2["P4-T2 redis compat"] --> P4T4["P4-T4 differential"]
  P2T1 & P1T2 --> P5T1["P5-T1 client"] --> P5T2["P5-T2 client tests"]
  P0T3 --> P6T1["P6-T1 web scaffold+tokens"] --> P6T2["P6-T2 ui primitives"] --> P6T3["P6-T3 brand+shells"]
  P6T1 --> P6T4["P6-T4 clerk"]
  P1T2 & P2T1 & P6T4 --> P6T5["P6-T5 data layer"]
  P6T3 & P6T5 --> P7T1["P7-T1 list+create"] --> P7T2["P7-T2 details"] & P7T3["P7-T3 usage"] & P7T4["P7-T4 browser"] & P7T5["P7-T5 cli"] & P7T6["P7-T6 settings"] & P7T7["P7-T7 quotas+account"]
  P6T3 --> P8T1["P8-T1 landing"]
  P7T2 & P7T3 & P7T4 & P7T5 & P7T6 & P7T7 & P8T1 & P4T3 & P5T2 --> P9T1["P9-T1 e2e+a11y"] --> P9T2["P9-T2 CI+deploy"] --> P9T3["P9-T3 release"]
```

Tasks on the same level with satisfied dependencies **can run in parallel** on separate branches. P1-T3…T10 each touch only their own migration file. Parity entries in `packages/protocol/src/commands.ts` are added in P2-T1 for the **whole** matrix up front, so command tasks don't conflict on that file.

---

### Phase 0 — Foundation

#### P0-T1 · Monorepo scaffold

- **Depends on:** —
- **Refs:** §3, §4, §5.1, §5.7, §5.8, §13.6
- **Deliverables:** `package.json`, `pnpm-workspace.yaml` (`apps/*`, `packages/*`, `tests`), `turbo.json`, `tsconfig.base.json`, `eslint.config.mjs`, `prettier.config.mjs` (`singleQuote: true`, `semi: true`, `printWidth: 110`, `trailingComma: 'all'`, tailwind plugin), `.editorconfig`, `.nvmrc`, `.gitignore` (node_modules, dist, .next, .turbo, .wrangler, .env*, !.env.example, .dev.vars, supabase/.temp, playwright-report, test-results), `.gitattributes` (`* text=auto eol=lf`), `LICENSE`(MIT, "Downstash contributors", 2026),`CHANGELOG.md`(Keep a Changelog,`## [Unreleased]`), `AGENTS.md`, placeholder `README.md`, empty package folders, each with a minimal `package.json` (`@downstash/protocol`, `@downstash/client`, `@downstash/gateway`, `@downstash/web`, `@downstash/tests`) and `README.md`.
- **Steps:** `git init`; create the files; `pnpm i`; make sure `pnpm lint` and `pnpm typecheck` succeed on an empty workspace (packages may have a `src/index.ts` exporting nothing, with a header).
- **Acceptance:** `pnpm i && pnpm lint && pnpm typecheck && pnpm format:check` exit 0.
- **Docs:** `AGENTS.md` (§13.6), package READMEs (purpose stub).

#### P0-T2 · Documentation skeleton, conventions and ADRs

- **Depends on:** P0-T1
- **Refs:** §2, §11, §12.12, §13
- **Deliverables:** every file in §13.1 created with frontmatter (`status: draft` where content comes later). Full content now for: `docs/README.md`, `glossary.md`, `conventions/*` (all 7, using §5 and §13.3), `design/system.md` (paste the complete Neo-brutalism brief from the original request **verbatim**, then a "Downstash deviations" section: D-UI1 mono font; synthesized 900 weight; dialog scrim/disabled alpha exceptions; console scale §11.3), `design/copy.md`, `adr/0000-template.md` and ADRs `0001`–`0013` (Context/Decision/Consequences from §2 and §11.1), `progress.md` (table of all task IDs from §16 with status `TODO`), `codemap.md` (lists current files).
- **Acceptance:** all files exist; ADR count = 14 including the template; `progress.md` lists all 44 tasks.
- **Docs:** this task _is_ docs.

#### P0-T3 · Tooling scripts and static CI

- **Depends on:** P0-T2
- **Refs:** §11.7, §13.5, §15.3 (job `static`)
- **Deliverables:** `scripts/check-docs.ts`, `scripts/check-design.ts` (root script `"design:check": "tsx scripts/check-design.ts"`), `scripts/gen-token.ts` (prints a standard + readonly token with hex hashes), `scripts/gen-enc-key.ts`, `.github/workflows/ci.yml` with the `static` job only. Add `tsx` as a root devDependency. Tests for both checkers in `scripts/__tests__/*.test.ts` using fixture folders.
- **Acceptance:** `pnpm docs:check` and `pnpm design:check` pass on the repo; each fails on a crafted fixture (missing header, a `rounded-lg`, a `#123456`).
- **Docs:** `conventions/documentation.md` (describe checks), `codemap.md`.

---

### Phase 1 — Storage engine

> All Phase 1 tasks: run `pnpm db:reset` after editing migrations; tests live in `tests/sql/<area>.test.ts`; follow §7.6 exactly.

#### P1-T1 · Supabase project, core schema, tests package

- **Depends on:** P0-T3
- **Refs:** §7.1, §7.2, §7.12, §14.1
- **Deliverables:** `supabase/config.toml` (`supabase init`; project_id `downstash`; leave defaults otherwise), migration `20261007000100_core_schema.sql` (exactly §7.2), `supabase/seed.sql` (§7.12, runs after all migrations; uses `extensions.digest`), the `tests` package (`package.json` with scripts `test:sql`, `test:compat`, `test:diff`; `vitest.config.ts` with `test.include` per script, `fileParallelism: false` for sql), `tests/helpers/{sql.ts,fixtures.ts}`, `tests/docker-compose.yml`, `tests/sql/schema.test.ts`.
- **Tests:** tables exist; `kv` is unlogged (`relpersistence = 'u'`); `kv.key` collation is `C`; the anon role can't `select` from `downstash.kv`; the seed database exists with 2 tokens.
- **Acceptance:** `pnpm db:start && pnpm db:reset && pnpm test:sql` pass.
- **Docs:** `engine/schema.md`, `ops/local-dev.md` (first version), `codemap.md`.

#### P1-T2 · Engine core, entrypoints, usage

- **Depends on:** P1-T1
- **Refs:** §7.5 (all), §7.6, §17.2
- **Deliverables:** migration `20261007000200_core_engine.sql` with every function in the §7.5 table, the grants block, and `notify pgrst`. Temporarily register `PING` only (handler `downstash.cmd_ping`, moved into the server migration in P1-T3 via `create or replace`, so the core migration doesn't break) so `run` can be tested. Tests: `tests/sql/engine.test.ts`, `tests/sql/entrypoints.test.ts`, `tests/sql/helpers.test.ts` (to_int/to_float/glob_to_regex/glob_prefix: ≥ 40 table cases).
- **Acceptance:** `pnpm test:sql` passes, including the §14.2 engine-level cases that apply (PING-based), the permission tests and the usage counters. `curl -X POST http://127.0.0.1:54321/rest/v1/rpc/downstash_exec -H "apikey: <local anon/publishable key>" -H "Content-Type: application/json" -d '{"p_token":"dsk_local0standard0token0for0development0only0x","p_cmd":"PING"}'` returns `{"result": "PONG"}`.
- **Docs:** `engine/concurrency.md`, `engine/errors.md`, `architecture/security-model.md` (roles and grants), `architecture/data-flow.md` (failover + console paths).

#### P1-T3 · Server commands

- **Depends on:** P1-T2 · **Refs:** §7.8 Server · **Deliverables:** `20261007000300_cmd_server.sql`, `tests/sql/server.test.ts` · **Acceptance:** `pnpm test:sql` · **Docs:** `engine/commands.md` (regenerated in P2-T3; until then add a TODO with a task ref).

#### P1-T4 · String commands

- **Depends on:** P1-T2 · **Refs:** §7.3, §7.4, §7.6, §7.8 Strings · **Deliverables:** `20261007000400_cmd_strings.sql`, `tests/sql/strings.test.ts` (including 50-way parallel INCR and SET option matrix) · **Acceptance:** `pnpm test:sql` · **Docs:** `engine/value-encoding.md`.

#### P1-T5 · Keyspace and expiry commands

- **Depends on:** P1-T2 · **Refs:** §7.8 Keyspace, SCAN rules · **Deliverables:** `20261007000500_cmd_keyspace.sql`, `tests/sql/keyspace.test.ts` (SCAN completeness test from §14.2, KEYS cap, glob edge cases `h?llo`, `h[ae]llo`, `h[^e]llo`, `h\*llo`) · **Acceptance:** `pnpm test:sql` · **Docs:** `engine/schema.md` (cursor table section).

#### P1-T6 · Hash commands

- **Depends on:** P1-T2 · **Deliverables:** `20261007000600_cmd_hashes.sql`, `tests/sql/hashes.test.ts` · **Acceptance:** `pnpm test:sql`.

#### P1-T7 · List commands

- **Depends on:** P1-T2 · **Deliverables:** `20261007000700_cmd_lists.sql`, `tests/sql/lists.test.ts` (negative indices, LREM directions, LPOS options) · **Acceptance:** `pnpm test:sql`.

#### P1-T8 · Set commands

- **Depends on:** P1-T2 · **Deliverables:** `20261007000800_cmd_sets.sql`, `tests/sql/sets.test.ts` · **Acceptance:** `pnpm test:sql`.

#### P1-T9 · Sorted set commands

- **Depends on:** P1-T2 · **Deliverables:** `20261007000900_cmd_zsets.sql`, `tests/sql/zsets.test.ts` (score ordering ties by member, exclusive ranges, ZADD flag combinations incl. invalid `NX GT` → `ERR GT, LT, and/or NX options at the same time are not compatible`) · **Acceptance:** `pnpm test:sql`.

#### P1-T10 · Ops: cron, stats, retention, durability script

- **Depends on:** P1-T2 · **Refs:** §7.11, §2 warning · **Deliverables:** `20261007001000_ops_cron_stats.sql`, `scripts/make-durable.ts` (writes `supabase/migrations/<timestamp>_kv_logged.sql` containing `alter table downstash.kv set logged;` and a header comment; prints next steps), `tests/sql/ops.test.ts` (call the functions directly; assert cron jobs are registered) · **Acceptance:** `pnpm test:sql`; `select jobname from cron.job` lists 3 jobs. · **Docs:** `ops/durability.md`, `ops/quotas.md`.

---

### Phase 2 — Protocol package

#### P2-T1 · Protocol core + registry parity

- **Depends on:** P0-T3 (the parity test also needs P1-T3…T9 to pass; write it now and mark it `it.todo` for families not merged yet. The family tasks flip theirs on)
- **Refs:** §8.1–§8.6, §17.2
- **Deliverables:** `packages/protocol/src/{index,types,commands,argv,encoding,errors,token}.ts`; tests `packages/protocol/test/{argv,encoding,token,commands}.test.ts`; `tests/sql/registry-parity.test.ts`. `COMMANDS` covers the **entire** §7.8 matrix.
- **Acceptance:** `pnpm --filter @downstash/protocol test` (≥ 95% coverage); encoding round-trips unicode (`"héllo ✓ 🚀"`); `generateToken` matches `TOKEN_REGEX` 1000/1000 times.
- **Docs:** `packages/protocol/README.md`, `gateway/protocol.md` (encoding section).

#### P2-T2 · CLI tokenizer and formatter

- **Depends on:** P2-T1 · **Refs:** §8.7 · **Deliverables:** `src/tokenize-cli.ts`, `src/format-cli.ts`, tests (≥ 25 cases each, including nested arrays such as `SCAN` replies and `ZRANGE WITHSCORES`) · **Acceptance:** package tests pass.

#### P2-T3 · Command docs generator

- **Depends on:** P2-T1 · **Refs:** §8.8, §13.5 rule 6 · **Deliverables:** `packages/protocol/scripts/gen-commands-doc.ts`, generated `docs/engine/commands.md`; wire rule 6 into `check-docs.ts` · **Acceptance:** `pnpm docs:commands && pnpm docs:check`.

---

### Phase 3 — Gateway

#### P3-T1 · Gateway scaffold

- **Depends on:** P2-T1 · **Refs:** §9.1, §9.2
- **Deliverables:** `apps/gateway/{package.json,wrangler.jsonc,.dev.vars.example,tsconfig.json,vitest.config.ts}`, `src/{index,app,env}.ts`, `src/routes/health.ts`, `src/storage/storage.ts` (interface only), `test/health.test.ts`, `test/helpers/fake-storage.ts`. Scripts: `dev` (`wrangler dev --port 8787`), `deploy` (`wrangler deploy`), `test`, `typecheck` (`tsc --noEmit` with `@cloudflare/workers-types`), `lint`.
- **Acceptance:** `pnpm --filter @downstash/gateway test`; `pnpm --filter @downstash/gateway dev` then `curl :8787/health` → `{"status":"healthy","service":"downstash","version":"1.0.0"}`.
- **Docs:** `apps/gateway/README.md`, `gateway/configuration.md`.

#### P3-T2 · Storage adapter, parsing, command routes

- **Depends on:** P3-T1, P1-T2 · **Refs:** §9.4, §9.6, §9.8
- **Deliverables:** `src/storage/postgrest-storage.ts`, `src/core/{request-parse,respond}.ts`, `src/routes/commands.ts`, tests `test/{request-parse,commands,postgrest-storage}.test.ts`. Auth is minimal in this task: regex + hash, passing the hash to storage (caching comes in P3-T3).
- **Acceptance:** unit tests pass; with local Supabase running: `curl -X POST :8787/ -H "Authorization: Bearer dsk_local0standard0token0for0development0only0x" -d '["PING"]'` → `{"result":"PONG"}`; `/pipeline` with 3 commands returns 3 envelopes; `GET /ping` works.
- **Docs:** `gateway/request-lifecycle.md`, `gateway/protocol.md`.

#### P3-T3 · Auth and auth caches

- **Depends on:** P3-T2 · **Refs:** §9.3 · **Deliverables:** `src/core/{auth,auth-cache}.ts`, `test/auth.test.ts` · **Acceptance:** every auth path in §9.10 is tested; a revoked token is rejected after the TTL (fake clock). · **Docs:** `gateway/auth.md`.

#### P3-T4 · Encoding, CORS, limits, error handling

- **Depends on:** P3-T3 · **Refs:** §9.5, §9.6 · **Deliverables:** `src/core/encoding.ts`, `src/middleware/{cors,body-limit,errors}.ts`, tests · **Acceptance:** tests pass; `curl -H "Upstash-Encoding: base64"` on `GET` returns base64. · **Docs:** `gateway/protocol.md`.

#### P3-T5 · L1 cache and usage piggyback

- **Depends on:** P3-T4 · **Refs:** §9.7, §9.9 · **Deliverables:** `src/core/{l1-cache,usage-buffer}.ts`, wiring, tests · **Acceptance:** tests pass; coverage ≥ 90% (`src/core`, `src/routes`). · **Docs:** `gateway/l1-cache.md`.

#### P3-T6 · Scheduled keep-alive and deploy workflow

- **Depends on:** P3-T5 · **Refs:** §9.1 `scheduled.ts`, §15.3 · **Deliverables:** `src/scheduled.ts`, test, `.github/workflows/deploy-gateway.yml` · **Acceptance:** `wrangler dev --test-scheduled` then `curl ":8787/__scheduled?cron=0+*/6+*+*+*"` logs `keepalive ok:true`. · **Docs:** ADR 0010 updated with the verification result, `ops/deploy.md` (gateway section).

---

### Phase 4 — Compatibility

#### P4-T1 · Script capture and native ports

- **Depends on:** P1-T4, P1-T5, P1-T6, P3-T4 · **Refs:** §7.8 Scripting, §7.9
- **Deliverables:** `tests/capture/capture-scripts.ts`, `tests/capture/scripts.json`, migration `20261007001100_scripts_ratelimit.sql` (EVAL/EVALSHA/SCRIPT handlers + one `downstash.script_*` per captured script + registry rows), `tests/differential/scripts.test.ts`.
- **Acceptance:** each captured script gives identical replies on SRH and Downstash for ≥ 10 sequences; `EVALSHA <unknown>` → `NOSCRIPT ...`.
- **Docs:** `engine/scripts.md` (table: sha1, name, origin, handler, write?).

#### P4-T2 · `@upstash/redis` compatibility suite

- **Depends on:** P1-T3…T9, P3-T4 · **Refs:** §14.3 (1) · **Deliverables:** `tests/compat/redis.test.ts`, `tests/helpers/gateway.ts` · **Acceptance:** `pnpm test:compat` passes with both encodings.

#### P4-T3 · `@upstash/ratelimit` compatibility suite

- **Depends on:** P4-T1 · **Refs:** §14.3 (2) · **Deliverables:** `tests/compat/ratelimit.test.ts` · **Acceptance:** all 4 algorithms pass the 5-then-reject check and SRH parity.

#### P4-T4 · Differential suite

- **Depends on:** P4-T2 · **Refs:** §14.4 · **Deliverables:** `tests/differential/{runner.ts,differential.test.ts,corpus/*.json}`, `tests/helpers/srh.ts` · **Acceptance:** `pnpm test:diff` passes with ≥ 300 steps. Any intentional difference goes in `docs/engine/commands.md` under "Known differences".

---

### Phase 5 — Client SDK

#### P5-T1 · `@downstash/client` implementation

- **Depends on:** P2-T1, P1-T2 · **Refs:** §10 · **Deliverables:** `packages/client/src/{index,downstash,requester,transport,errors,types}.ts`, `tsup.config.ts` (entry `src/index.ts`, formats `esm`,`cjs`, `dts: true`, `noExternal: ['@downstash/protocol']`, target `es2022`), `package.json` (`exports` with `import`/`require`/`types`, `files: ["dist"]`, `sideEffects: false`) · **Acceptance:** `pnpm --filter @downstash/client build` produces `dist/index.{js,cjs,d.ts}`.

#### P5-T2 · Client tests, README, failover integration

- **Depends on:** P5-T1, P3-T4 · **Refs:** §10.5, §14.3 (3) · **Deliverables:** `packages/client/test/*.test.ts`, `tests/compat/failover.test.ts`, `packages/client/README.md` · **Acceptance:** unit tests (≥ 90% coverage) and the failover compat test pass. · **Docs:** `client/usage.md`, `client/failover.md`.

---

### Phase 6 — Web foundation

#### P6-T1 · Next.js scaffold, tokens, fonts

- **Depends on:** P0-T3 · **Refs:** §11.1–§11.3, §12.2 (root files), §12.3
- **Deliverables:** `apps/web` (`next.config.ts` with `transpilePackages: ['@downstash/protocol']`, `typedRoutes: true`), `postcss.config.mjs` (`@tailwindcss/postcss`), `app/{layout.tsx,globals.css,icon.svg}`, `lib/{tokens,utils,env}.ts`, `.env.example`, `vitest.config.ts`, a placeholder `(marketing)/page.tsx` showing a token swatch grid.
- **Acceptance:** `pnpm --filter @downstash/web build`; `pnpm design:check`; `bg-gray-500` does **not** generate CSS (theme reset works). Verify by grepping the built CSS.
- **Docs:** `design/tokens.md` (every token → class → usage), `apps/web/README.md`.

#### P6-T2 · UI primitives + style guide page

- **Depends on:** P6-T1 · **Refs:** §11.4, §11.5
- **Deliverables:** every component in the §11.4 table under `components/ui/`, `components/console/chart-card.tsx`, `lib/shiki.ts`, and `app/(dev)/styleguide/page.tsx`, which renders every component in every variant and state (calls `notFound()` when `NODE_ENV === 'production'`). Component tests in `apps/web/test/ui/*.test.tsx` (variants render classes, AlertDialog confirmText gating, CopyButton, SecretField reveal, Field aria wiring).
- **Acceptance:** tests pass; axe has no serious violations on `/styleguide` (Playwright smoke, can run locally); visual check: every element has a black border and a hard shadow.
- **Docs:** `design/components.md` (props table + do/don't per component), `design/patterns.md`.

#### P6-T3 · Brand, shells, 404/error

- **Depends on:** P6-T2 · **Refs:** §11.4 Brand, §12.7, §12.9 layout, §12.10, §12.11 (nav + footer only)
- **Deliverables:** `components/brand/{logo,logo-mark}.tsx`, `components/console/{top-bar,mobile-nav,console-footer}.tsx`, `components/marketing/{marketing-nav,marketing-footer}.tsx`, `(console)/layout.tsx`, `(marketing)/layout.tsx`, `(auth)/layout.tsx`, `not-found.tsx`, `error.tsx`.
- **Acceptance:** build passes; the mobile nav works at 390 px; keyboard tab order is logical.
- **Docs:** `web/routes.md` (first version).

#### P6-T4 · Clerk integration

- **Depends on:** P6-T1 · **Refs:** §11.6, §12.2 middleware, §12.9
- **Deliverables:** `middleware.ts`, `ClerkProvider` in the root layout, `lib/clerk-appearance.ts`, sign-in/up pages, `(console)/account/[[...rest]]/page.tsx`, `lib/auth.ts` (`getWorkspace`, `requireWorkspace`; `requireDatabase` arrives in P6-T5).
- **Acceptance:** keyless dev: `/redis` redirects to `/sign-in`; after sign-in, `/redis` renders (placeholder); the org switcher changes `workspaceId` (log in dev only).
- **Docs:** `web/auth.md`.

#### P6-T5 · Server data layer

- **Depends on:** P1-T2, P2-T1, P6-T4 · **Refs:** §12.4, §12.6
- **Deliverables:** `lib/{db,crypto,tokens,engine,action-result,format}.ts`, `requireDatabase` in `lib/auth.ts`, tests `test/{crypto,tokens,format}.test.ts` and an integration test `test/engine.int.test.ts` (local DB).
- **Acceptance:** tests pass; encrypt→decrypt round trip; a tampered ciphertext throws.
- **Docs:** `web/data-access.md`.

---

### Phase 7 — Console features

Each task: `features/<name>/{queries,actions,schemas}.ts`, `components/`, `README.md`, a route page, unit tests for schemas/actions (actions tested against the local DB with Clerk `auth()` mocked), and `docs/web/features.md` section.

| Task                             | Depends on   | Refs                    | Route(s)                   | Acceptance (in addition to DoD)                                                                                                                                     |
| -------------------------------- | ------------ | ----------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **P7-T1** Database list + create | P6-T3, P6-T5 | §12.8.1, §12.8.2        | `/redis`                   | Create → redirect to details; duplicate → CONFLICT field error; limit → disabled button; empty state renders                                                        |
| **P7-T2** Details / connect      | P7-T1        | §12.8.3, §12.8.4, §17.3 | `/redis/[dbId]` (+ layout) | Tokens absent from initial HTML (`curl` the page, grep `dsk_` → none); reveal works; snippets match §17.3 byte-for-byte after substitution                          |
| **P7-T3** Usage                  | P7-T1        | §12.8.5, §11.5          | `/redis/[dbId]/usage`      | Zero-filled buckets (24 or 7/30); range switch; charts use only NEO colors                                                                                          |
| **P7-T4** Data browser           | P7-T1, P2-T2 | §12.8.6                 | `/redis/[dbId]/browser`    | CRUD for all 5 types; `?key=` deep link; LOAD MORE pagination with 500 seeded keys                                                                                  |
| **P7-T5** CLI                    | P7-T1, P2-T2 | §12.8.7                 | `/redis/[dbId]/cli`        | Output matches `formatCli`; FLUSHDB confirmation; history persists across reloads                                                                                   |
| **P7-T6** Settings               | P7-T1        | §12.8.8                 | `/redis/[dbId]/settings`   | Rename; L1 toggle reflected in the gateway within 60 s; rotate shows the new token once and the old token returns 401 after the cache TTL; flush; delete → redirect |
| **P7-T7** Quotas + account       | P7-T1        | §12.8.9, §12.8.10       | `/quotas`, `/account`      | Progress colors per thresholds; cron table shows 3 jobs                                                                                                             |

---

### Phase 8 — Landing

#### P8-T1 · Landing page

- **Depends on:** P6-T3 · **Refs:** §12.11, §12.12, §11
- **Deliverables:** `components/marketing/{trust-marquee,hero,how-it-works,comparison,features,drop-in,ratelimit-showcase,faq,final-cta}.tsx`, `(marketing)/page.tsx`, metadata, `app/opengraph-image.tsx`.
- **Acceptance:** copy matches §12.11 exactly; Lighthouse (local, mobile) accessibility ≥ 95 and performance ≥ 85; no horizontal scroll at 360 px; marquee pauses with reduced motion.
- **Docs:** `design/patterns.md` (hero chaos zone, color-blocked sections).

---

### Phase 9 — Hardening and release

#### P9-T1 · E2E and accessibility suite

- **Depends on:** all of P7, P8-T1, P4-T3, P5-T2 · **Refs:** §14.5 · **Deliverables:** `apps/web/playwright.config.ts` (webServer entries for gateway + web), `apps/web/e2e/*.spec.ts`, global setup · **Acceptance:** `pnpm test:e2e` green locally, twice in a row (no flakes).

#### P9-T2 · Full CI and deploy docs

- **Depends on:** P9-T1 · **Refs:** §15 · **Deliverables:** complete `ci.yml` (all 5 jobs), `docs/ops/{deploy,env-vars,runbook}.md` final · **Acceptance:** CI green on a PR; a fresh-clone dry run of `docs/ops/local-dev.md` works verbatim.

#### P9-T3 · Release v1.0.0

- **Depends on:** P9-T2 · **Deliverables:** root `README.md` (hero line, a brutalist ASCII banner, a features list, a 60-second quickstart, links to docs, the compatibility table, limitations), `CHANGELOG.md` `## [1.0.0] - <date>`, every doc's `status: stable`, a final `docs:check`, git tag `v1.0.0`.
- **Acceptance:** all PRD §10 acceptance criteria are demonstrably met (links to the passing tests in `progress.md`).

---

## 17. Appendices

### 17.1 Environment variables (master list → `docs/ops/env-vars.md`)

| Var                                                                                                                                                       | App            | Kind   | Purpose                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ | ------------------------------------------------ |
| `SUPABASE_URL`                                                                                                                                            | gateway        | secret | Supabase project URL                             |
| `SUPABASE_SECRET_KEY`                                                                                                                                     | gateway        | secret | Secret (service_role) key for `downstash_gw_run` |
| `DOWNSTASH_VERSION`, `ALLOWED_ORIGINS`, `MAX_REQUEST_BYTES`, `MAX_PIPELINE_COMMANDS`, `AUTH_CACHE_TTL_MS`, `NEGATIVE_AUTH_CACHE_TTL_MS`, `RPC_TIMEOUT_MS` | gateway        | var    | §9.2                                             |
| all of §12.3                                                                                                                                              | web            | mixed  | §12.3                                            |
| `TEST_DATABASE_URL`, `GATEWAY_URL`, `SRH_URL`, `SRH_TOKEN`, `SUPABASE_ANON_KEY` (test)                                                                    | tests          | local  | §14.1                                            |
| `CLERK_TEST_USER_EMAIL`, `CLERK_TEST_USER_PASSWORD`                                                                                                       | e2e            | secret | §14.5                                            |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`                                                                                                           | GitHub Actions | secret | gateway deploy                                   |

### 17.2 Error catalog (exact strings; `ERRORS` key in parentheses)

| Key                   | Message                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
| `WRONG_ARGS`          | `ERR wrong number of arguments for '%s' command`                                   |
| `UNKNOWN_COMMAND`     | `ERR unknown command '%s', with args beginning with: %s`                           |
| `WRONGTYPE`           | `WRONGTYPE Operation against a key holding the wrong kind of value`                |
| `NOT_INTEGER`         | `ERR value is not an integer or out of range`                                      |
| `NOT_FLOAT`           | `ERR value is not a valid float`                                                   |
| `OVERFLOW`            | `ERR increment or decrement would overflow`                                        |
| `SYNTAX`              | `ERR syntax error`                                                                 |
| `NO_SUCH_KEY`         | `ERR no such key`                                                                  |
| `INDEX_RANGE`         | `ERR index out of range`                                                           |
| `INVALID_EXPIRE`      | `ERR invalid expire time in '%s' command`                                          |
| `HASH_NOT_INTEGER`    | `ERR hash value is not an integer`                                                 |
| `HASH_NOT_FLOAT`      | `ERR hash value is not a float`                                                    |
| `MIN_MAX_FLOAT`       | `ERR min or max is not a float`                                                    |
| `ZADD_FLAGS`          | `ERR GT, LT, and/or NX options at the same time are not compatible`                |
| `ZADD_XX_NX`          | `ERR XX and NX options at the same time are not compatible`                        |
| `ZADD_INCR_PAIR`      | `ERR INCR option supports a single increment-element pair`                         |
| `NOSCRIPT`            | `NOSCRIPT No matching script. Please use EVAL.`                                    |
| `RO_SCRIPT`           | `ERR Write commands are not allowed from read-only scripts`                        |
| `NOPERM`              | `NOPERM this token has no permissions to run the '%s' command`                     |
| `EMPTY_COMMAND`       | `ERR empty command`                                                                |
| `UNAUTHORIZED`        | `Unauthorized`                                                                     |
| `COMMAND_SHAPE`       | `ERR Downstash: each command must be a JSON array of strings`                      |
| `PIPELINE_SIZE`       | `ERR Downstash: pipeline must contain 1..1000 commands`                            |
| `NULL_BYTES`          | `ERR Downstash: null bytes are not supported`                                      |
| `KEY_TOO_LONG`        | `ERR Downstash: key exceeds 2000 bytes`                                            |
| `INF_SCORE`           | `ERR Downstash: infinite scores are not supported`                                 |
| `BYLEX`               | `ERR Downstash: BYLEX is not supported`                                            |
| `KEYS_CAP`            | `ERR Downstash: KEYS matched more than 10000 keys, use SCAN`                       |
| `LUA_UNSUPPORTED`     | `ERR Downstash: arbitrary Lua is not supported (script %s is not in the registry)` |
| `INVALID_JSON`        | `ERR Downstash: invalid JSON body`                                                 |
| `BODY_TOO_LARGE`      | `ERR Downstash: request body exceeds %s bytes`                                     |
| `NOT_FOUND`           | `ERR Downstash: not found`                                                         |
| `STORAGE_UNAVAILABLE` | `ERR Downstash: storage unavailable`                                               |
| `INTERNAL`            | `ERR Downstash: internal error`                                                    |
| `INVALID_MODE`        | `ERR Downstash: invalid mode`                                                      |
| `CLI_ARGS`            | `ERR Invalid argument(s)`                                                          |

### 17.3 Connect snippets (exact text; `{URL}`, `{TOKEN}`, `{SUPABASE_URL}` and `{SUPABASE_PUBLISHABLE_KEY}` are substituted)

**`@upstash/redis`** (filename `index.ts`)

```ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: '{URL}',
  token: '{TOKEN}'
});

await redis.set('foo', 'bar');
const value = await redis.get('foo');
```

**`@upstash/ratelimit`** (filename `ratelimit.ts`)

```ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: new Redis({ url: '{URL}', token: '{TOKEN}' }),
  limiter: Ratelimit.slidingWindow(10, '10 s')
});

const { success, remaining } = await ratelimit.limit('user:42');
```

**`@downstash/client`** (filename `redis.ts`)

```ts
import { Redis } from '@upstash/redis';
import { createDownstashRequester } from '@downstash/client';

export const redis = new Redis(
  createDownstashRequester({
    url: '{URL}',
    token: '{TOKEN}',
    fallback: {
      supabaseUrl: '{SUPABASE_URL}',
      supabaseKey: '{SUPABASE_PUBLISHABLE_KEY}'
    }
  })
);
```

**`.env`** (filename `.env`)

```dotenv
UPSTASH_REDIS_REST_URL="{URL}"
UPSTASH_REDIS_REST_TOKEN="{TOKEN}"

# Optional: automatic failover with @downstash/client
SUPABASE_URL="{SUPABASE_URL}"
SUPABASE_PUBLISHABLE_KEY="{SUPABASE_PUBLISHABLE_KEY}"
```

**`cURL`** (filename `terminal`)

```bash
curl {URL}/set/foo/bar -H "Authorization: Bearer {TOKEN}"
curl {URL}/get/foo -H "Authorization: Bearer {TOKEN}"
curl -X POST {URL}/pipeline -H "Authorization: Bearer {TOKEN}" \
  -d '[["INCR","hits"],["GET","hits"]]'
```

**`Python`** (filename `main.py`; the tab shows a small badge `SAME REST PROTOCOL`)

```python
from upstash_redis import Redis

redis = Redis(url="{URL}", token="{TOKEN}")
redis.set("foo", "bar")
print(redis.get("foo"))
```

### 17.4 Risks and mitigations

| Risk                                                           | Mitigation                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Free-tier limits change (Cloudflare, Supabase, Clerk, Vercel)  | Limits live in one place (`lib/quotas.ts` constants + `docs/ops/quotas.md`); the landing page includes a "check current limits" disclaimer |
| `@upstash/*` changes wire behavior or scripts                  | Exact pins (§3.2); the capture harness (P4-T1); compat + differential suites in CI                                                         |
| 10 ms Worker CPU limit on big pipelines                        | 1 MB body cap, 1000-command cap; JSON work is O(n); measure with `wrangler tail` in P9-T2 and document                                     |
| UNLOGGED data loss                                             | Documented on the landing page, details facts and docs; `pnpm db:durable`                                                                  |
| Hot-row contention on `usage_hourly`                           | Single short upsert per request; revisit with per-minute sharding if `pg_stat_activity` shows lock waits (ADR if changed)                  |
| Supabase key format changes (publishable/secret vs legacy JWT) | Header rule (`eyJ` prefix check) isolated in one helper per package; documented in `gateway/configuration.md`                              |
| Clerk appearance API renames                                   | G1: verify against installed types; keep the intent in §11.6                                                                               |

### 17.5 Final checklist before calling v1.0.0 done

- [ ] PRD §10 criteria 1–4 pass (links in `docs/progress.md`).
- [ ] `@upstash/redis` and `@upstash/ratelimit` work unchanged against the deployed gateway.
- [ ] Failover verified against the deployed Supabase with a forced gateway outage.
- [ ] Console: every Upstash-equivalent flow in §12.1 works on mobile and desktop.
- [ ] `pnpm design:check`, `pnpm docs:check` and axe are clean.
- [ ] Every doc is `status: stable`; `codemap.md` is complete; ADRs 0001–0013 are Accepted.
- [ ] Total monthly cost: **$0.00**.
