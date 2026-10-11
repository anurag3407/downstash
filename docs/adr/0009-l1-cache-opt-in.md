---
title: L1 cache opt-in
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0009. L1 cache opt-in

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P3-T5

## Context

The PRD has the L1 cache always on. Cloudflare isolates are not coherent with
each other: a `GET` cached in isolate A does not know isolate B just wrote the
key. For a session, a lock or a counter that is a correctness bug.

## Decision

L1 is **per database and off by default**. `downstash.databases.l1_ttl_ms` is
0–10 000 ms, default 0, and it is toggled in Settings with a TTL select. Only an
allow-list of read commands is cacheable (`GET`, `HGET`, `HMGET`, `HGETALL`,
`LRANGE`, `SMEMBERS`, `SISMEMBER`, `MGET`, `ZSCORE`), and any write in the batch
invalidates the whole database.

## Consequences

**Positive**

- No silent stale reads unless a developer opts in and picks a TTL with their
  eyes open.
- `X-Downstash-L1: BYPASS` makes it obvious when the cache is not in play.
- `usage_hourly.l1_hits` gives an honest hit count.

**Negative**

- The value is smaller than "always on" would suggest, and only for read-heavy
  keys.
- The hit rate on the Usage page is approximate: counts are buffered per isolate
  and piggybacked on the next call.

## Alternatives considered

| Alternative                                 | Why not                                    |
| ------------------------------------------- | ------------------------------------------ |
| Always on with a 1 s TTL                    | A stale lock for a second is a stalled job |
| Cross-isolate coherence via Durable Objects | A different product and a different bill   |
