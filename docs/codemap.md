# Codemap

Every source file → one line. Grouped by package. `docs:check` verifies that
each path here exists and each source file appears here.

## Root tooling (`tooling/`)

- `tooling/check-design/src/index.ts` — CLI entry: enforce Neo-brutalism design rules over `apps/web` tokens/CSS.
- `tooling/check-design/src/rules.ts` — Pure design-rule checks (token naming, forbidden values).
- `tooling/check-docs/src/index.ts` — CLI entry: `@file` headers + docs index coverage.
- `tooling/check-docs/src/checks.ts` — Pure documentation checks (headers, unreferenced docs, design tokens).
- `tooling/gen-token/src/index.ts` — CLI entry: print a fresh Downstash token (`dsk_…`/`dsr_…`).
- `tooling/gen-token/src/generator.ts` — Token generation + SHA-256 hashing helpers.
- `tooling/gen-enc-key/src/index.ts` — CLI entry: generate a value-encryption key.
- `tooling/gen-enc-key/src/crypto.ts` — Key derivation helpers.

## `packages/protocol`

- `packages/protocol/src/index.ts` — Public barrel of `@downstash/protocol`.
- `packages/protocol/src/types.ts` — Shared protocol types (`CommandSpec`, `RedisValue`, …).
- `packages/protocol/src/errors.ts` — Error catalog mirroring §17.2 + `formatError`.
- `packages/protocol/src/commands.ts` — Aggregates per-family specs into `COMMANDS`; `precheck`, `isWrite`, `isCacheable`.
- `packages/protocol/src/registry/strings.ts` — String command specs.
- `packages/protocol/src/registry/keyspace.ts` — Keyspace & expiry command specs.
- `packages/protocol/src/registry/hashes.ts` — Hash command specs.
- `packages/protocol/src/registry/lists.ts` — List command specs.
- `packages/protocol/src/registry/sets.ts` — Set command specs.
- `packages/protocol/src/registry/zsets.ts` — Sorted-set command specs.
- `packages/protocol/src/registry/server.ts` — Server + scripting command specs.
- `packages/protocol/src/argv.ts` — JSON body → argv arrays (`normalizeCommand`, `normalizePipeline`).
- `packages/protocol/src/encoding.ts` — base64 (en/de)coding of reply values.
- `packages/protocol/src/token.ts` — Token format, generation, hashing, hints.
- `packages/protocol/src/tokenize-cli.ts` — redis-cli-style line tokenizer for the terminal/CLI.
- `packages/protocol/src/format-cli.ts` — Render a reply envelope the way redis-cli prints it.
- `packages/protocol/scripts/gen-commands-doc.ts` — Generate `docs/engine/commands.md` from `COMMANDS`.

## `packages/client`

- `packages/client/src/index.ts` — Public barrel of `@downstash/client`.
- `packages/client/src/types.ts` — Client + config types.
- `packages/client/src/downstash.ts` — `Downstash` class: typed command methods, pipeline/multi.
- `packages/client/src/transport.ts` — Gateway-first transport with Supabase RPC failover (§10.2).
- `packages/client/src/requester.ts` — Builds request bodies and decodes replies.
- `packages/client/src/error.ts` — `DownstashError` (command/source/status context).

## `apps/gateway`

- `apps/gateway/src/index.ts` — Cloudflare Worker entry (fetch handler export).
- `apps/gateway/src/env.ts` — Env/secret schema + parsing (`lib/env`).
- `apps/gateway/src/app.ts` — Hono app: routing + middleware wiring.
- `apps/gateway/src/middleware/cors.ts` — CORS handling.
- `apps/gateway/src/routes/commands.ts` — `POST /`, `/pipeline`, `/multi-exec` handlers.
- `apps/gateway/src/routes/health.ts` — `GET /health` liveness.
- `apps/gateway/src/core/request-parse.ts` — Parse + normalize request bodies.
- `apps/gateway/src/core/auth.ts` — Bearer token extraction + validation.
- `apps/gateway/src/core/auth-cache.ts` — Cached auth lookups (TTL, negative cache).
- `apps/gateway/src/core/l1-cache.ts` — In-isolate cache for cacheable reads.
- `apps/gateway/src/core/usage-buffer.ts` — Batched usage counter flushes.
- `apps/gateway/src/core/respond.ts` — Reply → JSON envelopes (`respondOne`, `respondMany`).
- `apps/gateway/src/core/encoding.ts` — base64 encode replies.
- `apps/gateway/src/storage/storage.ts` — `Storage` interface (+ `StorageUnavailableError`).
- `apps/gateway/src/storage/postgrest-storage.ts` — `Storage` over Supabase RPC (`downstash_gw_run`).

## `supabase/migrations`

- `supabase/migrations/20261007000100_core_schema.sql` — Tables, extensions, roles.
- `supabase/migrations/20261007000200_core_engine.sql` — Engine primitives (`dispatch`, `run`, helpers).
- `supabase/migrations/20261007000300_cmd_server.sql` — Server commands (PING, TIME, …).
- `supabase/migrations/20261007000400_cmd_strings.sql` — String commands.
- `supabase/migrations/20261007000500_cmd_keyspace.sql` — Keyspace & expiry commands.
- `supabase/migrations/20261007000600_cmd_hashes.sql` — Hash commands.
- `supabase/migrations/20261007000700_cmd_lists.sql` — List commands.
- `supabase/migrations/20261007000800_cmd_sets.sql` — Set commands.
- `supabase/migrations/20261007000900_cmd_zsets.sql` — Sorted-set commands.
- `supabase/migrations/20261007001000_cmd_scripts.sql` — EVAL/SCRIPT + known-script registry.
- `supabase/migrations/20261007001100_users_billing.sql` — Users, workspaces, billing tables.
- `supabase/migrations/20261007001200_ops_cron_stats.sql` — Ops: sweeper, stats, cron jobs.
- `supabase/migrations/20261007001300_seed.sql` — Seed data.

## Supabase scripts

- `supabase/scripts/pg-local-reset.sh` — Recreate scratch DB and load migrations in order.
