---
title: Gateway auth
status: stable
last_updated: 2026-10-11
updated_by: P3-T3
code_paths:
  - apps/gateway/src/core/auth.ts
  - apps/gateway/src/core/auth-cache.ts
---

# Gateway auth

> How a bearer token becomes a principal, and what the caches cost you.

## Flow

```
token → regex → sha256 → negative cache? → positive cache? → DB call
```

| Step           | File                               | Detail                                                                                                                                             |
| -------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Extract        | `src/core/auth.ts`                 | `Authorization: Bearer <t>` (scheme case-insensitive), else `?_token=<t>`. Neither → 401.                                                          |
| Shape          | same                               | `TOKEN_REGEX = /^ds[kr]_[A-Za-z0-9_-]{43}$/`; failure is a 401 with no DB call and nothing cached.                                                 |
| Hash           | `packages/protocol`                | `sha256Hex(token)` → 64 lowercase hex chars.                                                                                                       |
| Negative cache | `src/core/auth-cache.ts`           | A known-bad hash → 401 immediately.                                                                                                                |
| Positive cache | same                               | `{dbId, readonly, l1TtlMs}` per hash. Enough to serve L1 and to precheck read-only writes.                                                         |
| DB             | `src/storage/postgrest-storage.ts` | The hash goes to `downstash_gw_run`; the token never does. A `{ok:false,status:401}` reply negative-caches the hash; `ok:true` positive-caches it. |

## Positive-cache confirmation

On a cache hit the gateway re-checks with
`crypto.subtle.timingSafeEqual(hexToBytes(entry.hash), hexToBytes(hash))`. The
comparison is not load-bearing — the map key is the hash — but it keeps the
constant-time comparison in the path that the plan's ADR
[0004](../adr/0004-token-format-and-auth.md) promised. Tests in Node use the
Node fallback (a constant-time XOR loop) when `crypto.subtle.timingSafeEqual`
is missing.

## The 60-second window

Revocation and rotation apply within `AUTH_CACHE_TTL_MS` (60 s), because other
isolates keep serving their cached principal. The console's Settings page says
this in the rotation dialog, and the e2e suite sets
`AUTH_CACHE_TTL_MS=1000` so it can observe the change.

## What is never cached

- A token that fails the regex.
- A cache miss that the DB answered with `ok:false` for a non-401 reason.
- Anything containing a token, a hash, a key or a value in a log line.

## Related

- [request-lifecycle.md](./request-lifecycle.md) ·
  [../architecture/security-model.md](../architecture/security-model.md)
