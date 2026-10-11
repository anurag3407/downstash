---
title: Gateway configuration
status: stable
last_updated: 2026-10-11
updated_by: P3-T1
code_paths:
  - apps/gateway/wrangler.jsonc
  - apps/gateway/src/env.ts
---

# Gateway configuration

> Every knob the Worker reads, and where it comes from.

## Vars (`wrangler.jsonc`)

| Var                          | Default   | Meaning                                 |
| ---------------------------- | --------- | --------------------------------------- |
| `DOWNSTASH_VERSION`          | `1.0.0`   | Reported by `GET /health`.              |
| `ALLOWED_ORIGINS`            | `*`       | `*` or a comma list of allowed origins. |
| `MAX_REQUEST_BYTES`          | `1048576` | 413 above this.                         |
| `MAX_PIPELINE_COMMANDS`      | `1000`    | Pipeline size cap.                      |
| `AUTH_CACHE_TTL_MS`          | `60000`   | Positive auth cache TTL.                |
| `NEGATIVE_AUTH_CACHE_TTL_MS` | `30000`   | Negative auth cache TTL.                |
| `RPC_TIMEOUT_MS`             | `8000`    | Per storage call.                       |

`env.ts` parses the numeric ones with defaults and requires `SUPABASE_URL` to be
an `http(s)` URL. A config error becomes a 500 with no detail — the worker never
echoes the environment.

## Secrets

| Secret                | Where                                         |
| --------------------- | --------------------------------------------- |
| `SUPABASE_URL`        | `wrangler secret put`, or `.dev.vars` locally |
| `SUPABASE_SECRET_KEY` | same — the secret (service_role) key          |

`.dev.vars` is gitignored. The test stack (`tests/helpers/stack.ts`) writes a
temporary one and deletes it on exit, so a local secret never lands in git.

## Why a secret key

`public.downstash_gw_run` is `service_role` only and takes a pre-hashed token. A
publishable key cannot call it. That is the point: even if the worker is
compromised, the key it holds is not enough to list databases unless an attacker
also has a token hash, and hashes only come from a real token.

## Supabase key formats

The adapter sends `apikey: <key>` always, and additionally
`Authorization: Bearer <key>` **only when the key starts with `eyJ`** (legacy
JWT keys). Current `sb_secret_…` keys go in `apikey` alone. The rule is one
helper (`src/storage/postgrest-storage.ts#headers`) so a format change is a
one-line edit plus this paragraph.

## Local development

```bash
cp apps/gateway/.dev.vars.example apps/gateway/.dev.vars
# SUPABASE_URL=http://127.0.0.1:54321
# SUPABASE_SECRET_KEY=<the key supabase start printed>

pnpm --filter @downstash/gateway dev        # :8787
curl :8787/health
```

The `compatibility_date` is pinned to `2026-10-01`. Wrangler falls back to the
newest date the installed runtime supports, with a warning; upgrade wrangler to
silence it. `wrangler.jsonc` also declares `"triggers": { "crons": ["0 */6 * * *"] }`
for the keep-alive handler in `src/scheduled.ts`.

## Related

- [../ops/env-vars.md](../ops/env-vars.md) ·
  [../ops/deploy.md](../ops/deploy.md)
