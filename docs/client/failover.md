---
title: Failover
status: stable
last_updated: 2026-10-11
updated_by: P5-T2
code_paths:
  - packages/client/src/transport.ts
---

# Failover

> The transport's algorithm, its triggers and its limits.

## Order of decision

```
if fallback && now < stickyUntil → RPC
try gateway
  2xx                                      → return the body
  400 / 401 / 403 / 404 / 413              → throw, no failover
  429                                      → failover (rate_limited)
  >= 500                                   → failover (server_error)
  other status                             → throw
catch AbortError                           → timeout: failover only if failoverOnTimeout
catch other (TypeError, network)           → failover (network_error)
```

On a failover with no `fallback` configured the client throws
`DownstashError(source: 'gateway')` — there is nowhere to go.

## Sticky window

The first failover sets `stickyUntil = now + stickyFailoverMs` (default 60 000
ms) and fires `onFailover` **once**. For the rest of the window the client goes
straight to the RPC. Without it, every call would pay a dead gateway timeout
before failing over.

`failoverArmed` resets as soon as a gateway call succeeds, so a recovered gateway
is picked up on the next call even inside the window.

## RPC endpoints

| Mode     | Call                                            | Body                       |
| -------- | ----------------------------------------------- | -------------------------- |
| single   | `POST {supabaseUrl}/rest/v1/rpc/downstash_exec` | `{p_token, p_cmd, p_args}` |
| pipeline | `…/downstash_pipeline`                          | `{p_token, p_commands}`    |
| multi    | `…/downstash_multi`                             | `{p_token, p_commands}`    |

Headers: `apikey: <supabaseKey>` always, plus `Authorization: Bearer` only when
the key starts with `eyJ`. The reply shape is identical to the gateway's, so the
caller cannot tell which path answered. `{"error":"Unauthorized"}` from the RPC
becomes `DownstashError(status: 401, source: 'rpc')`.

## The timeout caveat

A timed-out gateway request may still have been applied. Failing over then runs
the command twice. For a rate limiter that only makes the limit slightly
stricter. For non-idempotent business writes, set `failoverOnTimeout: false`.

## Encoding

The transport never sets `Upstash-Encoding`, so both paths return plain JSON and
the client does not decode. (An earlier version decoded unconditionally, which
corrupted any reply that happened to be valid base64.)

## Tests

`tests/compat/failover.test.ts` proves, against the local stack:

- a gateway on a closed port → commands still succeed through the RPC;
- `429` → `rate_limited`, `503` → `server_error`, network error → `network_error`;
- `400` and `401` never fail over;
- a read-only token still gets `NOPERM` through the RPC.

## Related

- [usage.md](./usage.md) ·
  [`packages/client/src/transport.ts`](../../packages/client/src/transport.ts) ·
  [../architecture/security-model.md](../architecture/security-model.md)
