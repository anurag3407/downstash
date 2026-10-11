---
title: Environment variables
status: stable
last_updated: 2026-10-11
updated_by: P3-T1
code_paths:
  - apps/gateway/src/env.ts
  - .env.example
---

# Environment variables

> Every variable in every app. `.env.example` at the repo root is the committed
> master; each app also has its own example file.

## Gateway (`apps/gateway`)

Secrets, set with `wrangler secret put` and stored locally in the gitignored
`.dev.vars`.

| Var                   | Kind   | Required | Notes                                                  |
| --------------------- | ------ | -------- | ------------------------------------------------------ |
| `SUPABASE_URL`        | secret | yes      | e.g. `http://127.0.0.1:54321` locally                  |
| `SUPABASE_SECRET_KEY` | secret | yes      | secret (service*role) key; `sb_secret*…` or legacy JWT |

Vars, declared in `wrangler.jsonc`:

| Var                          | Default   |
| ---------------------------- | --------- |
| `DOWNSTASH_VERSION`          | `1.0.0`   |
| `ALLOWED_ORIGINS`            | `*`       |
| `MAX_REQUEST_BYTES`          | `1048576` |
| `MAX_PIPELINE_COMMANDS`      | `1000`    |
| `AUTH_CACHE_TTL_MS`          | `60000`   |
| `NEGATIVE_AUTH_CACHE_TTL_MS` | `30000`   |
| `RPC_TIMEOUT_MS`             | `8000`    |

## Web (`apps/web`)

| Var                                               | Side   | Required    | Notes                                                                                                                          |
| ------------------------------------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                    | server | yes         | transaction pooler, port 6543. `prepare: false` is mandatory. Local: `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| `TOKEN_ENCRYPTION_KEY`                            | server | yes         | base64 of 32 random bytes; `pnpm gen:enc-key`                                                                                  |
| `MAX_DATABASES_PER_WORKSPACE`                     | server | no          | default `25`                                                                                                                   |
| `CLERK_SECRET_KEY`                                | server | yes in prod | keyless mode works in dev                                                                                                      |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`               | client | yes in prod |                                                                                                                                |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                   | client | yes         | `/sign-in`                                                                                                                     |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`                   | client | yes         | `/sign-up`                                                                                                                     |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | client | yes         | `/redis`                                                                                                                       |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | client | yes         | `/redis`                                                                                                                       |
| `NEXT_PUBLIC_GATEWAY_URL`                         | client | yes         | `http://127.0.0.1:8787` locally                                                                                                |
| `NEXT_PUBLIC_SUPABASE_URL`                        | client | yes         | connect snippets only                                                                                                          |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`            | client | yes         | connect snippets only                                                                                                          |
| `NEXT_PUBLIC_STORAGE_REGION_LABEL`                | client | no          | `Supabase · ap-south-1`                                                                                                        |
| `NEXT_PUBLIC_APP_URL`                             | client | yes         | `http://localhost:3000`                                                                                                        |

## Tests (`@downstash/tests`)

| Var                 | Default                    |
| ------------------- | -------------------------- |
| `TEST_DATABASE_URL` | scratch Postgres on :55432 |
| `GATEWAY_URL`       | `http://127.0.0.1:8787`    |
| `SRH_URL`           | `http://127.0.0.1:8079`    |
| `SRH_TOKEN`         | `example_token`            |
| `SUPABASE_ANON_KEY` | used by the failover suite |
| `SHIM_PORT`         | `54321`                    |
| `GATEWAY_PORT`      | `8787`                     |

## E2E

| Var                        | Notes                |
| -------------------------- | -------------------- |
| `CLERK_TEST_USER_EMAIL`    | Playwright test user |
| `CLERK_TEST_USER_PASSWORD` |                      |

## CI

| Var                     | Where                                 |
| ----------------------- | ------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | GitHub Actions secret, gateway deploy |
| `CLOUDFLARE_ACCOUNT_ID` | same                                  |

## Rules

- Only `*.example` files are committed.
- `NEXT_PUBLIC_*` values ship to the browser: never point them at a secret.
- Adding a variable means updating this table, the app's `.env.example` and, for
  the gateway, `wrangler.jsonc`.

## Related

- [local-dev.md](./local-dev.md) · [deploy.md](./deploy.md) ·
  [../gateway/configuration.md](../gateway/configuration.md)
