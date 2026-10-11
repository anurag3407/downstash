# Downstash vs Upstash — user flow comparison

| Attribute    | Value                                                                                                                                                                                                           |
| :----------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status       | stable                                                                                                                                                                                                          |
| Last updated | 2026-10-11                                                                                                                                                                                                      |
| Code paths   | `PRD.md` §1.1, `plan.md` §12, `apps/gateway`, `packages/client`                                                                                                                                                 |
| Sources      | upstash.com/docs/redis/overall/getstarted, `.../features/restapi`, `.../howto/connect-client`, `.../overall/billing`, `.../troubleshooting/readonly_connection`, upstash.com/pricing/redis (fetched 2026-10-11) |

---

## 1. Upstash flow (verified today)

1. **Sign up** at `console.upstash.com` (social/email, no credit card). Docs state
   "every account starts with a free database" — the account is usable the moment
   you confirm your email; you do not have to create anything first.
2. **Create a database** (optional): Redis tab → `+ Create Database` → dialog asks
   **Name**, **Primary Region**, **Read Regions** → `Next` → pick a plan → Create.
3. **Connect**: open the database → the page shows a **Connect** section with
   **Endpoint**, **Port**, **Token** (and a read-only token). The token _is the
   password_; checking "Read-Only Token" switches the connection string to the
   `default_ro` user. Copy buttons appear on hover; a `.env` block exposes
   `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`; tabs cover REST, TCP
   (`redis-cli --tls -a $TOKEN -h $ENDPOINT -p $PORT`), SDKs, cURL and Python.
   TLS is mandatory and cannot be disabled.
4. **Use**: same REST shape Downstash implements (`POST /`, `POST /pipeline`,
   `GET /get/:key`, `_token` query param, `Authorization: Bearer`).
5. **Operate**: metrics/charts on the database page (refreshed ~10 s), billing
   with spend budgets, integrations (Grafana, Datadog, New Relic, Prometheus),
   ACL users, global read regions, backups, Prod Pack (HA/SLA/SOC-2), MCP
   servers, a DevOps API, the `upstash` CLI, and `POST https://upstash.com/start-redis`
   — a no-signup, one-HTTP-request database bootstrap aimed at agents.

**Current free tier (2026):** $0, 256 MB, **500K commands/month**, 10 GB
bandwidth, **1 database**, 10K commands/s, 10 MB max request, 100 MB max record.

## 2. Downstash flow — as built today (P0–P3)

There is **no console yet** (`apps/web` is empty, P5 is `TODO`), so the flow is
operator-only:

1. `pnpm i` → start Postgres (`supabase start` or `supabase/scripts/pg-local-reset.sh`) → 14 migrations apply.
2. Define databases + tokens in `databases.toml` → `pnpm gen:token` writes hash-only `supabase/seed.sql`.
3. Put `SUPABASE_URL` + `SUPABASE_SECRET_KEY` in `apps/gateway/.dev.vars`.
4. `pnpm gateway:dev` → Worker on `127.0.0.1:8787`.
5. Point `@upstash/redis` (or `@downstash/client`, adding the Supabase RPC failover) at that URL + token.

A single seeded "test-db" with a known standard + read-only token pair is what
you actually connect to; creating a second database means editing TOML or
writing SQL against `downstash.databases`.

## 3. Downstash flow — as planned (§12.1–§12.9, P5)

Clerk sign-in/sign-up → `/redis` list (Upstash order, neo-brutalist look) →
create dialog (name → region info → L1 cache switch → free-plan card) → lands on
`/redis/[dbId]` **Details** (connect snippets, standard/read-only token tabs,
reveal + copy) → **Usage**, **Data Browser**, **CLI**, **Settings** (rename, L1,
rotate tokens, flush, delete) → `/quotas` → `/account`.

## 4. Stage-by-stage comparison

| Stage           | Upstash                                                                    | Downstash today                          | Downstash planned (P5)                                   |
| :-------------- | :------------------------------------------------------------------------- | :--------------------------------------- | :------------------------------------------------------- |
| Identity        | Built-in accounts + teams, SSO on paid                                     | none                                     | Clerk, org = workspace                                   |
| First database  | Auto-provisioned on signup                                                 | seeded by SQL                            | empty state → "CREATE DATABASE"                          |
| Create database | Dialog: name, primary region, read regions                                 | TOML + `gen:token`                       | Dialog: name, region info, L1 switch, plan card          |
| Credentials     | Endpoint + Port + Token (token = password), read-only token (`default_ro`) | hashed row in `downstash.tokens`         | per-db standard + read-only token, reveal + copy, rotate |
| Connect UX      | Tabs REST/TCP/SDKs/cURL/Python, `.env` block, hover-to-copy                | README/SQL                               | same tabs, secrets hidden behind a switch                |
| Regions         | Choose primary + read regions                                              | fixed (global edge + one storage region) | read-only info block                                     |
| Data browsing   | Data browser                                                               | none                                     | SCAN-driven browser, full CRUD per type                  |
| CLI             | `upstash` CLI (separate tool)                                              | none                                     | in-console web CLI                                       |
| Metrics         | ~10 s refresh charts, budgets, Datadog/Grafana                             | `usage_hourly` counters only             | 24H/7D/30D charts + `/quotas`                            |
| Teardown        | Delete database                                                            | SQL                                      | Settings → delete (typed confirm)                        |

## 5. Gaps the comparison exposes

1. **PRD §1.1 is stale and is the weakest link in the pitch.** Upstash's free tier
   is **500K commands/month** (not "10,000/day"), 256 MB, 1 database. The honest
   Downstash advantages are: many databases per workspace (planned cap 25 vs 1),
   500 MB vs 256 MB, no daily ceiling on the failover path, no card, no 429
   billing risk. Rewrite the landing/FAQ copy around those, and add what is lost:
   no TCP/RESP, no replicas, no HA/SLA, no backups, `UNLOGGED` durability.
2. **No self-serve first run.** Upstash is "signup → working credentials in 60 s".
   Downstash's honest equivalent today is "clone → migrate → seed → dev server".
   P5 closes this, but until it ships the README should state the CLI path
   explicitly as a first-class flow, not an appendix.
3. **Request-size cap is a silent compatibility break.** Gateway default
   `MAX_REQUEST_BYTES = 1 MB` (`apps/gateway/src/env.ts`); Upstash allows 10 MB on
   free and PAYG. A 2 MB `SET` works on Upstash and 400s on Downstash. Raise the
   default to 10 MB (or document the difference next to it).
4. **`@upstash/redis` expects a TCP story somewhere.** Upstash's getting-started
   leads with `redis-cli`. Downstash's non-goal is fine, but the connect page and
   README should lead with the REST/SDK tabs and mention the web CLI as the
   redis-cli substitute, so users do not go looking for a port.
5. **Read-only tokens are parity-equivalent, rotation is not (yet).** Upstash:
   one token + read-only token, both non-rotatable from the console. Downstash:
   same shape (`kind in ('standard','readonly')`, one active per kind) plus a
   planned rotate action — keep it, it is a genuine edge, but ship it with the
   60-second propagation warning from §12.8.8.
6. **Missing Upstash surface, ranked by user-flow impact:** real-time-ish metrics
   (Downstash's hourly buckets are a day late for "what just happened"), an
   agent/bootstrap endpoint equivalent to `/start-redis`, and a programmatic
   DevOps API. Nice-to-have: Grafana/Datadog exporters, spend/budget guardrails
   (moot at $0), MCP server for the console.

## 6. Recommendation

Ship P5 §12 in the Upstash order (it already matches), fix the request-size
default and the stale free-tier claims before launch, and add a
`GET /bootstrap` style quickstart so a new user reaches a working token without
touching a TOML file.
