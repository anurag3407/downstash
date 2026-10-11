---
title: Scripts
status: stable
last_updated: 2026-10-11
updated_by: P4-T1
code_paths:
  - supabase/migrations/20261007001100_scripts_ratelimit.sql
  - tests/capture/capture-scripts.ts
---

# Scripts

> `EVAL` runs a registry of known scripts, not a Lua VM. This is how
> `@upstash/ratelimit` works on Downstash.

## Why a registry

The Worker has a 10 ms CPU budget per request. Shipping a Lua interpreter into
that is not viable, and the scripts in question are a closed, well-known set.
So each script is ported to PL/pgSQL, keyed by its SHA-1, and everything else is
refused (ADR [0007](../adr/0007-script-registry.md)).

## Capture

`tests/capture/capture-scripts.ts` reads the installed
`@upstash/ratelimit` bundle and pulls each script body out of its `SCRIPTS` map.
Two details matter:

1. **It resolves `${…}` interpolation.** The bundle contains template literals
   such as `` `return {effectiveLimit, ${tokenBucketIdentifierNotFound}, effectiveLimit}` ``.
   The literal text and the interpolated text have different SHA-1s, and the SDK
   computes its hash from the interpolated one. Reading the literal silently
   produced a hash the client never sends.
2. **It verifies every computed SHA-1 against the SDK's own map.** A mismatch
   throws. That is the guard that caught bug 1.

Output is `tests/capture/scripts.json`, which is committed and is the input to
the port migration.

```bash
pnpm --filter @downstash/tests capture:scripts
```

## Porting

Each script becomes `downstash.script_<snake_name>(p_db uuid, p_keys text[],
p_argv text[]) returns jsonb` (§7.9 of the plan):

| Lua                                    | PL/pgSQL                                                                            |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| numbers are doubles                    | integral doubles print without a decimal point (`script_num`, `script_numstr`)      |
| `redis.call("GET", k)` returning false | a `null` jsonb reply → SQL NULL (`script_tonum`)                                    |
| a Lua table                            | a JSON array                                                                        |
| `redis.call`                           | `downstash.dispatch(p_db, false, …)` — permission was already checked by `cmd_eval` |

## The registry

| SHA-1       | Handler                                | Write | Origin                                        |
| ----------- | -------------------------------------- | ----- | --------------------------------------------- |
| `b2efc027…` | `script_fixed_window_limit`            | yes   | `singleRegion.fixedWindow.limit`              |
| `823cb2a5…` | `script_fixed_window_remaining`        | no    | `singleRegion.fixedWindow.getRemaining`       |
| `74740bb3…` | `script_sliding_window_limit`          | yes   | `singleRegion.slidingWindow.limit`            |
| `7ca36169…` | `script_sliding_window_remaining`      | no    | `singleRegion.slidingWindow.getRemaining`     |
| `d60be5bd…` | `script_token_bucket_limit`            | yes   | `singleRegion.tokenBucket.limit`              |
| `40daf4a4…` | `script_token_bucket_remaining`        | no    | `singleRegion.tokenBucket.getRemaining`       |
| `1861a700…` | `script_cached_fixed_window_limit`     | yes   | `singleRegion.cachedFixedWindow.limit`        |
| `eb82f0e8…` | `script_cached_fixed_window_remaining` | no    | `singleRegion.cachedFixedWindow.getRemaining` |
| `54bd274d…` | `script_reset_used_tokens`             | yes   | `reset`                                       |

Multi-region scripts and the deny-list script are **not** registered: the plan
scopes v1.0 to single-region algorithms. `EVAL` with one of those bodies returns
`ERR Downstash: arbitrary Lua is not supported (script <sha1> is not in the
registry)`.

## Command surface

| Command                     | Behaviour                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| `EVAL body numkeys k… a…`   | SHA-1 the body, look it up, run the port                                                             |
| `EVALSHA sha numkeys k… a…` | unknown SHA → `NOSCRIPT No matching script. Please use EVAL.`                                        |
| `EVAL_RO`, `EVALSHA_RO`     | same, but a write script is refused with `ERR Write commands are not allowed from read-only scripts` |
| `SCRIPT LOAD body`          | the SHA-1 when known, otherwise the EVAL error                                                       |
| `SCRIPT EXISTS sha…`        | array of 1/0                                                                                         |
| `SCRIPT FLUSH`              | `OK` (the registry is static)                                                                        |

`@upstash/ratelimit` calls `EVALSHA` first and falls back to `EVAL` on
`NOSCRIPT`, so both paths must work. `tests/differential/scripts.test.ts` and
`tests/compat/ratelimit.test.ts` cover the pair.

## Changing the pinned SDK version

1. Bump the version in `tests/package.json` (exact pin, no caret).
2. `pnpm i`.
3. `pnpm --filter @downstash/tests capture:scripts` — a changed body or a new
   script throws or lands in `scripts.json`.
4. Regenerate the port migration's registry block from `scripts.json`, and port
   any new script.
5. Re-run `pnpm test:compat` and `pnpm test:diff` in full.
6. ADR if the behaviour changes.

## Related

- [commands.md](./commands.md) ·
  [`tests/capture/capture-scripts.ts`](../../tests/capture/capture-scripts.ts) ·
  [../adr/0007-script-registry.md](../adr/0007-script-registry.md)
