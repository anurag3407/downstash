---
title: Command matrix
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0006. Command matrix

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P1-T3 … P1-T9

## Context

The PRD's coverage matrix does not include some commands the dependencies
actually need. `@upstash/ratelimit` issues `EVALSHA` scripts calling `PEXPIRE`,
`HMGET`, `INCRBY` and `HGETALL`. The console's data browser needs `SCAN` and
`TYPE`.

## Decision

The matrix in plan §7.8 is the contract, and it is wider than the PRD's:

| Added                                | Why                                          |
| ------------------------------------ | -------------------------------------------- |
| `PX`, `PEXPIRE`, `PEXPIREAT`, `PTTL` | ratelimit works in milliseconds              |
| `HMGET`                              | `tokenBucket` scripts                        |
| `SCAN` with `MATCH`/`COUNT`/`TYPE`   | the data browser; `KEYS` is capped at 10 000 |
| `TYPE`                               | the data browser                             |
| `EVAL` / `EVALSHA` / `SCRIPT`        | see ADR [0007](./0007-script-registry.md)    |
| Sorted sets                          | `slidingWindow` ordering and the CLI         |
| `HRANDFIELD`, `SRANDMEMBER`, `SPOP`  | common client helpers                        |

## Consequences

**Positive**

- The official clients work unchanged.
- The console can browse any type without a second code path.

**Negative**

- More surface to maintain and test: 95 commands, each with arity, flags and a
  registry row.
- The differential corpus has to cover them, or the gap is invisible.

## Alternatives considered

| Alternative                             | Why not                                  |
| --------------------------------------- | ---------------------------------------- |
| Ship the PRD matrix and ratelimit fails | The PRD requires ratelimit compatibility |
| Implement only what the SDK calls today | The next SDK release breaks it           |
