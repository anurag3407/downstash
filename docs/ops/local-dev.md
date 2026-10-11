---
title: Local development
status: stable
last_updated: 2026-10-11
updated_by: P1-T1
code_paths:
  - supabase/scripts/pg-local-reset.sh
  - tests/helpers/stack.ts
---

# Local development

> Zero to a running gateway, a console and green tests, without Docker.

## What you need

- Node 22 (`.nvmrc`).
- pnpm 10.
- Postgres 15 reachable on `127.0.0.1:55432` as your OS user, with an
  `extensions` schema you can write to. On macOS: `brew install postgresql@15`
  and start it with the port set.
- No Docker and no Supabase CLI. `supabase/scripts/pg-local-reset.sh` is the
  local substitute for `supabase db reset` — it drops and recreates
  `downstash_test`, creates the `extensions` schema and the
  `anon`/`authenticated`/`service_role` roles, then loads every migration in
  order.

If you do have Docker, `pnpm db:start && pnpm db:reset` gives you the real
Supabase stack; the suites read `TEST_DATABASE_URL` either way.

## Setup

```bash
nvm use
corepack enable && pnpm i

# 1. Load migrations into the scratch database
PGBIN=/opt/homebrew/opt/postgresql@15/bin ./supabase/scripts/pg-local-reset.sh

# 2. Gateway secrets (gitignored, never committed)
cp apps/gateway/.dev.vars.example apps/gateway/.dev.vars
# SUPABASE_URL=http://127.0.0.1:54321
# SUPABASE_SECRET_KEY=replace-me

# 3. Install and build
pnpm i
pnpm --filter @downstash/client build
```

## Running

```bash
pnpm dev                    # gateway :8787 + web :3000

curl -s -X POST http://127.0.0.1:8787/ \
  -H 'Authorization: Bearer dsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
  -d '["PING"]'
# → {"result":"PONG"}
```

The seed database (`supabase/migrations/…001300_seed.sql`) carries two fixed
tokens for local use only:

| Kind      | Token                                             |
| --------- | ------------------------------------------------- |
| standard  | `dsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` |
| read-only | `dsr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` |

## Running the test suites

The compat and differential suites boot their own services: a PostgREST shim on
:54321 and `wrangler dev` on :8787, both pointing at the scratch database
(`tests/helpers/stack.ts`). You only need to tell them where the database is.

```bash
export TEST_DATABASE_URL="postgres://$USER@127.0.0.1:55432/downstash_test"

pnpm test:sql        # engine, direct SQL
pnpm test:compat     # @upstash/redis + @upstash/ratelimit + failover
pnpm test:diff       # Downstash vs SRH (needs Docker for SRH; skips otherwise)
pnpm test            # package unit tests
pnpm lint && pnpm typecheck && pnpm format:check
pnpm check:docs && pnpm check:design
```

`SHIM_PORT` and `GATEWAY_PORT` override the defaults when something already
holds those ports.

## What the shim is

`tests/helpers/postgrest-shim.ts` implements `POST /rest/v1/rpc/<fn>` where the
JSON body supplies the function's named arguments, against a real Postgres. It
exists so the compat and differential suites can run without the Supabase stack.
It has no auth, no schema introspection and no support for anything but
`rpc/<function-name>`. Do not expose it.

## Seeded vs generated tokens

Seeded tokens have `token_enc is null`, so the console shows
"Seed token, see supabase/seed.sql". Tokens created by the console are
AES-256-GCM encrypted and revealed once. Generate a pair by hand with
`pnpm gen:token`.

## Related

- [deploy.md](./deploy.md) · [env-vars.md](./env-vars.md) ·
  [../conventions/testing.md](../conventions/testing.md)
