---
title: Security model
status: stable
last_updated: 2026-10-11
updated_by: P1-T2
code_paths:
  - supabase/migrations/20261007001400_rpc_gateway.sql
  - supabase/migrations/20261007000100_core_schema.sql
  - packages/protocol/src/token.ts
---

# Security model

> Who can do what, and where the boundaries are. Read with
> [data-flow.md](./data-flow.md).

## Roles and exposure

| Object                                                                                                       | Schema      | PostgREST | Callable by                                                              |
| ------------------------------------------------------------------------------------------------------------ | ----------- | --------- | ------------------------------------------------------------------------ |
| `databases`, `tokens`, `kv`, `usage_hourly`, `db_stats_daily`, `scan_cursors`, `command_registry`, `scripts` | `downstash` | **No**    | `postgres` (console, migrations)                                         |
| `downstash.*` functions                                                                                      | `downstash` | No        | `postgres`                                                               |
| `public.downstash_gw_run`, `public.downstash_gw_ping`                                                        | `public`    | Yes       | **`service_role` only**                                                  |
| `public.downstash_exec`, `_pipeline`, `_multi`                                                               | `public`    | Yes       | `anon`, `authenticated`, `service_role` — Downstash token checked inside |

Row level security is enabled on every table in the `downstash` schema and no
policy grants access to `anon`/`authenticated`. That is the belt to the private
schema's braces: even if someone exposes the schema, the roles still cannot
read a row.

Every migration that creates a `public` function revokes from `public`,
`anon` and `authenticated` first, then grants to exactly the roles that need it,
then `notify pgrst, 'reload schema'`. Supabase grants new functions to those
roles by default, so the revoke is not optional.

## Tokens

| Property      | Value                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Format        | `dsk_…` (standard) / `dsr_…` (read-only) + 43 base64url chars               |
| Storage       | SHA-256 hash in `downstash.tokens.token_hash` (unique)                      |
| Reveal        | AES-256-GCM ciphertext in `token_enc`, so the console can show a token once |
| Seeded tokens | `token_enc is null` — local dev only, the console says so                   |
| Read-only     | Enforced in SQL: `dispatch` rejects write commands with `NOPERM`            |

A malformed token is rejected by the gateway before any DB call, and is not
cached. A well-formed but unknown hash is negatively cached for
`NEGATIVE_AUTH_CACHE_TTL_MS` (30 s by default).

The gateway hashes with `packages/protocol`'s `sha256Hex` and compares cache
entries with `crypto.subtle.timingSafeEqual` — defence in depth for the
constant-time comparison (ADR [0004](../adr/0004-token-format-and-auth.md)).

**Revocation and rotation take up to `AUTH_CACHE_TTL_MS` (60 s) to apply across
isolates.** The Settings page tells the user this when they rotate.

## Supabase keys

The gateway holds a **secret (service_role) key** because
`downstash_gw_run` is service-role-only and takes a pre-hashed token — a
publishable key could not reach it. The SDK failover path needs only the
**publishable (anon) key**, because `downstash_exec` checks the Downstash token
in SQL.

The header rule is one helper per package: `apikey: <key>` always, plus
`Authorization: Bearer <key>` only when the key starts with `eyJ` (legacy JWT
keys). Supabase has since moved to `sb_secret_…` / `sb_publishable_…`, which go
in `apikey` alone. Check
[`docs/gateway/configuration.md`](../gateway/configuration.md) when a key
format changes.

## Threats and mitigations

| Threat                                                | Mitigation                                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Someone with the publishable key reads every database | Token checked in SQL; the key alone yields `Unauthorized`                                   |
| A `public` function leaks internals                   | Only 5 vetted functions exist there, each with explicit grants                              |
| Token brute force                                     | Regex + hash + negative cache; unknown hashes never touch the keyspace                      |
| Read-only token writes                                | `dispatch` rejects any `write` flag while `p_readonly`                                      |
| Script abuse                                          | `EVAL` only accepts a registry of known SHA-1s (ADR [0007](../adr/0007-script-registry.md)) |
| Timing attack on token comparison                     | SHA-256 then `timingSafeEqual`                                                              |
| Key exhaustion (2000-byte btree limit)                | `downstash.check_key` rejects before the write                                              |

## Logging

The gateway logs 5xx and cron only, as one-line JSON. It never logs a token, a
token hash, a key or a value. The web app logs server-side only, with safe
fields, prefixed by module: `console.error('[settings] rename failed', { dbId })`.

## Related

- [overview.md](./overview.md) · [../adr/0003-token-checked-failover.md](../adr/0003-token-checked-failover.md)
