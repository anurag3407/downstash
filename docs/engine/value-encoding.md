---
title: Value encoding
status: stable
last_updated: 2026-10-11
updated_by: P1-T4
code_paths:
  - supabase/migrations/20261007000200_core_engine.sql
  - packages/protocol/src/encoding.ts
---

# Value encoding

> How a Redis value becomes a JSONB row and back. Read with [schema.md](./schema.md).

## Redis type → JSONB

| Redis type | `type`   | `val`                            | Example                     |
| ---------- | -------- | -------------------------------- | --------------------------- |
| String     | `string` | a JSON **string**, always        | `"hello"`, `"42"`           |
| Hash       | `hash`   | object of field → string         | `{"name":"alex","age":"3"}` |
| List       | `list`   | array of strings, index 0 = head | `["c","b","a"]`             |
| Set        | `set`    | object of member → `1`           | `{"a":1,"b":1}`             |
| Sorted set | `zset`   | object of member → JSON number   | `{"alice":1.5,"bob":3}`     |

Strings are **always** strings, even numbers. `INCR` writes `"2"`, not `2`. The
PRD's own example (`GET` after `INCR` returns `"1"`) is the reason: Redis strings
are byte strings, so a JSON number would be a lie about the type
(ADR [0008](../adr/0008-value-encoding.md)).

## Rules

- **Empty collections are never stored.** The row is deleted instead, so `EXISTS`
  and `TYPE` see "no key".
- **No null bytes.** JSONB cannot hold `\u0000`. The gateway rejects them first
  (`packages/protocol`'s `normalizeCommand`), and `downstash.to_argv` rejects them
  as defence in depth:
  `ERR Downstash: null bytes are not supported`.
- **Keys are at most 2000 bytes**, because of the btree index entry limit:
  `ERR Downstash: key exceeds 2000 bytes`.
- **Infinite sorted-set scores** are accepted as range bounds only. Storing one
  is `ERR Downstash: infinite scores are not supported`.

## Reply shape (Redis RESP2 → JSON)

| RESP2                  | JSON                                     |
| ---------------------- | ---------------------------------------- |
| Simple string          | string (`"OK"`, `"PONG"`, `"string"`)    |
| Bulk string            | string                                   |
| Null bulk / null array | `null`                                   |
| Integer                | number                                   |
| Array                  | array, possibly nested                   |
| Error                  | `{"error": "…"}` — never inside `result` |

### Floats

`downstash.fmt_float(double precision)` uses Postgres' `float8::text`, which is
the shortest round-tripping representation, and maps `Infinity`/`-Infinity` to
`inf`/`-inf`. Integral values print without a decimal point (`10`, not `10.0`),
matching Redis. That is what `INCRBYFLOAT`, `HINCRBYFLOAT` and `ZSCORE` return.

## The base64 layer

`Upstash-Encoding: base64` base64-encodes every string at every depth in each
`result`. Numbers and nulls pass through; `error` is never encoded. See
[../gateway/protocol.md](../gateway/protocol.md).

That rule is why `"OK"` survives a round trip and why `@upstash/redis` can decode
everything except the literal `OK` — and why a client that never sends the header
must not decode. `@downstash/client` learned that the hard way; see
[../client/failover.md](../client/failover.md).

## Related

- [schema.md](./schema.md) · [errors.md](./errors.md) ·
  [../adr/0008-value-encoding.md](../adr/0008-value-encoding.md)
