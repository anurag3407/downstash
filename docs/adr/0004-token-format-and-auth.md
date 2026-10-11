---
title: Token format and auth
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0004. Token format and auth

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P3-T3

## Context

The PRD compares a bearer token against one secret with `timingSafeEqual`. That
cannot work with multiple databases and two token kinds, and hash comparison
needs a lookup.

## Decision

Tokens are `dsk_…` / `dsr_…` plus 43 base64url characters. The gateway:

1. rejects anything not matching `/^ds[kr]_[A-Za-z0-9_-]{43}$/` with a 401 and no
   DB call,
2. computes the SHA-256 hex of the token,
3. checks a negative cache (30 s) and a positive cache (60 s),
4. sends the **hash** to Postgres — never the token,
5. on a positive-cache hit re-confirms the entry with
   `crypto.subtle.timingSafeEqual`.

Known-bad hashes are negatively cached so a replay loop costs nothing.

## Consequences

**Positive**

- Constant-time comparison is preserved for the final step (ADR 0004's promise).
- A malformed token is free to reject; a well-formed unknown one costs one cached
  lookup at worst.
- Revocation is a `revoked_at` write, effective within the cache TTL.

**Negative**

- Revocation and rotation take up to 60 s to reach every isolate. The Settings
  page says so, and the e2e suite sets `AUTH_CACHE_TTL_MS=1000` to observe it.
- Two caches to reason about, and a map size cap to enforce.

## Alternatives considered

| Alternative                                     | Why not                                             |
| ----------------------------------------------- | --------------------------------------------------- |
| Compare inside Postgres every time              | A DB round trip per request, plus no negative cache |
| Store tokens in plain text for a direct compare | A database read becomes a token leak                |
