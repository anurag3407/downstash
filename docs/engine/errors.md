---
title: Error catalog
status: stable
last_updated: 2026-10-11
updated_by: P1-T2
code_paths:
  - supabase/migrations/20261007000200_core_engine.sql
  - packages/protocol/src/errors.ts
---

# Error catalog

> The exact strings. Handlers must not invent new ones. `packages/protocol`'s
> `ERRORS` mirrors this table for the gateway's client-side prechecks.

## Command errors

| Key                | Message                                                             |
| ------------------ | ------------------------------------------------------------------- |
| `WRONG_ARGS`       | `ERR wrong number of arguments for '%s' command`                    |
| `UNKNOWN_COMMAND`  | `ERR unknown command '%s', with args beginning with: %s`            |
| `WRONGTYPE`        | `WRONGTYPE Operation against a key holding the wrong kind of value` |
| `NOT_INTEGER`      | `ERR value is not an integer or out of range`                       |
| `NOT_FLOAT`        | `ERR value is not a valid float`                                    |
| `OVERFLOW`         | `ERR increment or decrement would overflow`                         |
| `SYNTAX`           | `ERR syntax error`                                                  |
| `NO_SUCH_KEY`      | `ERR no such key`                                                   |
| `INDEX_RANGE`      | `ERR index out of range`                                            |
| `INVALID_EXPIRE`   | `ERR invalid expire time in '%s' command`                           |
| `HASH_NOT_INTEGER` | `ERR hash value is not an integer`                                  |
| `HASH_NOT_FLOAT`   | `ERR hash value is not a float`                                     |
| `MIN_MAX_FLOAT`    | `ERR min or max is not a float`                                     |
| `ZADD_FLAGS`       | `ERR GT, LT, and/or NX options at the same time are not compatible` |
| `ZADD_XX_NX`       | `ERR XX and NX options at the same time are not compatible`         |
| `ZADD_INCR_PAIR`   | `ERR INCR option supports a single increment-element pair`          |
| `NOSCRIPT`         | `NOSCRIPT No matching script. Please use EVAL.`                     |
| `RO_SCRIPT`        | `ERR Write commands are not allowed from read-only scripts`         |
| `NOPERM`           | `NOPERM this token has no permissions to run the '%s' command`      |
| `EMPTY_COMMAND`    | `ERR empty command`                                                 |
| `UNAUTHORIZED`     | `Unauthorized`                                                      |

## Downstash-specific

| Key                   | Message                                                                            |
| --------------------- | ---------------------------------------------------------------------------------- |
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

## How an error is raised and caught

- In SQL, a command error is `downstash.raise_err(text)`, which raises with
  SQLSTATE `DS000`. `run` catches that per command, appends
  `{"error": SQLERRM}` and continues.
- Any other SQLSTATE is wrapped: `'ERR ' || SQLERRM`. That is the escape hatch,
  not the norm — if you find a raw cast failure reaching a client, raise the
  friendly error in the handler instead.
- `downstash_gw_run` catches `DS000` at the top level and returns
  `{ok:false,status:400,error:SQLERRM}` for a body-level failure.
- The gateway maps 400 → `{"error": …}`, 401 → `Unauthorized`, and never a 500
  for a command error.

## Adding an error

1. Add it here, in the right table.
2. Add it to `packages/protocol/src/errors.ts` as `ERRORS`.
3. Use `formatError(ERRORS.X, ...)` in the handler or the protocol package.
4. Reference the key in a test so a typo fails.

## Related

- [value-encoding.md](./value-encoding.md) ·
  [`packages/protocol/src/errors.ts`](../../packages/protocol/src/errors.ts)
