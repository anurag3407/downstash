---
title: L1 cache
status: stable
last_updated: 2026-10-11
updated_by: P3-T5
code_paths:
  - apps/gateway/src/core/l1-cache.ts
---

# L1 cache

> An opt-in, per-database, in-isolate read cache. It is the one feature that can
> return a stale value, so it is off by default.

## Why opt-in

Isolates are not coherent with each other. A cached `GET` in isolate A does not
know that isolate B just wrote the key. For a counter or a lock that is a
correctness bug, so each database carries its own `l1_ttl_ms` (0–10 000 ms) and
the default is 0. The Settings page explains the trade-off in the same words.

## Shape

```ts
new L1Cache({ maxEntries: 1000, maxValueBytes: 65536, now: () => number });
```

- **Key**: `dbId + '\u0000' + [argv[0].toUpperCase(), ...argv.slice(1)].join('\u0000')`.
  Null bytes are banned in argv, so two commands cannot collide.
- **Eviction**: LRU via `Map` re-insertion; the oldest entry is dropped at
  `maxEntries`.
- **Value size**: skipped when `JSON.stringify(value)` exceeds
  `maxValueBytes`.

## Read path

A read is cacheable only when all of these hold:

1. one command (`POST /` or a path command),
2. the principal came from the positive cache,
3. `principal.l1TtlMs > 0`,
4. `isCacheable(argv[0])` — the command's spec has the `cacheable` flag.

`cacheable` is a deliberate allow-list (`GET`, `HGET`, `HMGET`, `HGETALL`,
`LRANGE`, `SMEMBERS`, `SISMEMBER`, `MGET`, `ZSCORE`). Everything else — even
`SCAN`, which is cheap but unbounded — bypasses.

A hit responds `X-Downstash-L1: HIT` and adds one to the usage buffer. A miss
runs the DB call, then stores the value when the envelope has a `result`.

## Write path

After any DB call whose commands include one where `isWrite()` is true, the
whole database is invalidated: `invalidateDb(dbId)`. There is no per-key
invalidation, because a write's blast radius is unknown to the gateway (a Lua
script can touch any key).

## Observability

- `X-Downstash-L1` on every command response: `HIT`, `MISS` or `BYPASS`.
- `usage_hourly.l1_hits`, shown as a bar chart on the Usage page and as an
  `L1 HIT RATE` stat on Details (a dash when the cache is off).

## Gotchas

- Counts are **approximate**: `l1Hits` is buffered per isolate and piggybacked on
  the next call for that database, so an isolate that dies loses its count.
- A `MISS` that ends in an error envelope stores nothing.
- `BYPASS` is not a failure. It is the normal answer for writes, pipelines, and
  databases that never enabled the cache.

## Related

- [request-lifecycle.md](./request-lifecycle.md) ·
  [`src/core/l1-cache.ts`](../../apps/gateway/src/core/l1-cache.ts)
