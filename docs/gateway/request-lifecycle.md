---
title: Request lifecycle
status: stable
last_updated: 2026-10-11
updated_by: P3-T2
code_paths:
  - apps/gateway/src/routes/commands.ts
  - apps/gateway/src/core/auth.ts
  - apps/gateway/src/core/l1-cache.ts
---

# Request lifecycle

> One command, from `fetch` to response, through the Cloudflare Worker. Read
> this with [protocol.md](./protocol.md).

## Where the code lives

| Concern                              | File                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| App factory (pure, injectable)       | [`apps/gateway/src/app.ts`](../../apps/gateway/src/app.ts)                         |
| Worker entry (singleton per isolate) | [`apps/gateway/src/index.ts`](../../apps/gateway/src/index.ts)                     |
| Routes, the whole pipeline           | [`apps/gateway/src/routes/commands.ts`](../../apps/gateway/src/routes/commands.ts) |
| Token extraction + auth              | `src/core/auth.ts`, `src/core/auth-cache.ts`                                       |
| L1 cache                             | `src/core/l1-cache.ts`                                                             |
| Body and path parsing                | `src/core/request-parse.ts`                                                        |
| Reply encoding                       | `src/core/encoding.ts`                                                             |
| Storage adapter                      | `src/storage/postgrest-storage.ts`                                                 |

## Order of operations

1. **CORS.** `OPTIONS` returns a 204 preflight. Every response carries
   `Access-Control-Expose-Headers: X-Downstash-L1, Upstash-Sync-Token`.
2. **Body limit.** `Content-Length` over `MAX_REQUEST_BYTES` → 413 immediately;
   otherwise the bytes are read and re-checked.
3. **Parse.** JSON body → argv arrays (`normalizeCommand` / `normalizePipeline`),
   or a path command → argv. `POST /<cmd>/<a>/<b>` appends non-`_token` query
   params in order; an empty-valued param contributes just the name, so `?NX`
   becomes `NX`. A `POST` path command with a non-empty body appends the raw body
   as the last argument.
4. **Token.** `Authorization: Bearer <t>` (scheme case-insensitive), else
   `?_token=<t>`. Missing → 401.
5. **Shape check.** `!/^ds[kr]_[A-Za-z0-9_-]{43}$/` → 401, no DB call, nothing
   cached.
6. **Hash and caches.** `sha256Hex(token)`. Negative-cache hit → 401.
   Positive-cache hit gives `{dbId, readonly, l1TtlMs}`, which is enough to
   serve L1 and to reject read-only writes without a round trip.
7. **Arity precheck.** The protocol package's `precheck` produces the same
   unknown-command and wrong-arity messages as `downstash.dispatch`, so an
   obvious error never costs a DB call.
8. **L1 read.** Only for a single command, a cached principal,
   `l1TtlMs > 0`, and `isCacheable(argv[0])`. A hit responds `X-Downstash-L1:
HIT` and bumps the usage buffer.
9. **Storage.** `POST {supabaseUrl}/rest/v1/rpc/downstash_gw_run` with
   `{p_token_hash, p_mode, p_commands, p_l1_hits, p_bytes_in, p_bytes_out}`.
   Retried twice (15 ms, 60 ms) on a `40P01`/`40001` code or 502/503/504.
10. **Aftermath.** `ok:false,status:401` → negative-cache. `ok:true` →
    positive-cache. Any write in the batch → `invalidateDb(dbId)`.
11. **Respond.** Status, `Content-Type`, `X-Downstash-L1`, CORS, and base64
    encoding when the request asked for it. `p_commands.length > 1` or a
    non-single mode → an envelope array; single → one envelope.

## Single vs multi reply shape

`downstash.run` always returns an array of envelopes. The route unwraps
`results[0]` for `POST /`, `/pipeline` and `/multi-exec`:

| Route                                | Reply                             |
| ------------------------------------ | --------------------------------- |
| `POST /`                             | `{"result": …}` or `{"error": …}` |
| `POST /pipeline`, `POST /multi-exec` | `[{"result":…},{"error":…}]`      |
| `GET /<cmd>/<a>…`                    | single envelope                   |

## Gotchas

- **The isolate is the unit of caching.** Two isolates can disagree for up to
  `AUTH_CACHE_TTL_MS`. That is why token rotation is documented as "takes effect
  within 60 seconds".
- **L1 is opt-in and per database.** Isolates are not coherent with each other,
  so a stale read is possible for `l1_ttl_ms`. It is off by default.
- **A per-command error is not a request error.** A pipeline with one bad
  command still returns 200 with a mix of `result` and `error` envelopes.
- **`StorageUnavailableError` is the only throw.** Everything else becomes a
  JSON body with a status; `app.onError` handles the rest as 500.

## Related

- [protocol.md](./protocol.md) · [auth.md](./auth.md) · [l1-cache.md](./l1-cache.md)
