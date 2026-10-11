---
title: Gateway protocol
status: stable
last_updated: 2026-10-11
updated_by: P3-T4
code_paths:
  - apps/gateway/src/routes/commands.ts
  - apps/gateway/src/core/encoding.ts
  - packages/protocol/src/encoding.ts
---

# Gateway protocol

> The Upstash REST wire format as Downstash implements it. Read after
> [request-lifecycle.md](./request-lifecycle.md).

## Routes

| Route                 | Body                     | argv                                                                                    |
| --------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `POST /`              | JSON array (one command) | `normalizeCommand(body)`                                                                |
| `POST /pipeline`      | JSON array of arrays     | `normalizePipeline(body, MAX_PIPELINE_COMMANDS)`, mode `pipeline`                       |
| `POST /multi-exec`    | same                     | mode `multi`                                                                            |
| `GET /<cmd>/<a>/<b>…` | —                        | `[cmd, decodeURIComponent(a), …]` then query params (minus `_token`) as `[name, value]` |
| `POST /<cmd>/<a>…`    | raw text                 | as GET, then the raw body appended as the last argument                                 |
| `GET /health`         | —                        | not a command                                                                           |
| `GET /`               | —                        | 404                                                                                     |

Reserved first segments that are not commands: `health`, `pipeline`,
`multi-exec`.

### Command array elements

A JSON array element may be a string, a finite number (`42` → `"42"`), a boolean
(`true`/`false`), or a plain object/array (stringified). Anything else — `null`,
`undefined`, `Infinity`, `NaN` — is
`ERR Downstash: each command must be a JSON array of strings`. A `\u0000`
anywhere is `ERR Downstash: null bytes are not supported`.

`@upstash/redis` serialises non-primitives with `JSON.stringify`, so a `null`
argument reaches the wire as the string `"null"`. That is what
`cachedFixedWindow.getRemaining` and `resetUsedTokens` send as `ARGV[1]`.

## Status codes

| Situation                                         | Status | Body                                            |
| ------------------------------------------------- | ------ | ----------------------------------------------- |
| Single command OK                                 | 200    | `{"result": …}`                                 |
| Single command Redis error                        | 400    | `{"error":"…"}`                                 |
| Pipeline OK, even with per-command errors         | 200    | `[{"result":…},{"error":"…}]`                   |
| Malformed body / bad pipeline size / null bytes   | 400    | `{"error":"…"}`                                 |
| Auth failure                                      | 401    | `{"error":"Unauthorized"}`                      |
| Body too large                                    | 413    | `ERR Downstash: request body exceeds <n> bytes` |
| Unknown route                                     | 404    | `ERR Downstash: not found`                      |
| Storage unreachable / timeout / 5xx after retries | 503    | `ERR Downstash: storage unavailable`            |
| Unexpected exception                              | 500    | `ERR Downstash: internal error`                 |

Every command response carries `Content-Type: application/json`,
`X-Downstash-L1: HIT|MISS|BYPASS` and the CORS headers.

## Encoding

`Upstash-Encoding: base64` (case-insensitive) base64-encodes **every string at
every depth** in each `result`. Numbers and nulls are unchanged, and an `error`
field is never encoded. That final detail is why `"OK"` survives a round trip
and is why `@upstash/redis` can decode everything except the literal `OK`.

Omitting the header — which `@downstash/client` always does — returns plain
JSON.

## CORS

`ALLOWED_ORIGINS="*"` → `Access-Control-Allow-Origin: *`. A comma list echoes the
request `Origin` when it is listed, otherwise no CORS headers at all.

Preflight → 204 with `Access-Control-Allow-Methods: GET, POST, OPTIONS`,
`Access-Control-Allow-Headers` echoing `Access-Control-Request-Headers` (else
`Authorization, Content-Type, Upstash-Encoding, Upstash-Sync-Token,
Upstash-Response-Format`), and `Access-Control-Max-Age: 86400`.

## Limits

| Var                          | Default   | Effect                                                        |
| ---------------------------- | --------- | ------------------------------------------------------------- |
| `MAX_REQUEST_BYTES`          | `1048576` | 413                                                           |
| `MAX_PIPELINE_COMMANDS`      | `1000`    | 400 (`ERR Downstash: pipeline must contain 1..1000 commands`) |
| `RPC_TIMEOUT_MS`             | `8000`    | `AbortSignal.timeout` on the storage call                     |
| `AUTH_CACHE_TTL_MS`          | `60000`   | positive cache                                                |
| `NEGATIVE_AUTH_CACHE_TTL_MS` | `30000`   | negative cache                                                |

## Related

- [configuration.md](./configuration.md) ·
  [`packages/protocol`](../../packages/protocol/README.md)
