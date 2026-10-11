---
title: Client usage
status: stable
last_updated: 2026-10-11
updated_by: P5-T1
code_paths:
  - packages/client/src/downstash.ts
  - packages/client/src/requester.ts
---

# Client usage

> How to call a Downstash gateway from an application.

## Constructing a client

```ts
import { Downstash } from '@downstash/client';

const redis = new Downstash({
  url: process.env.DOWNSTASH_URL!, // https://<worker>.workers.dev
  token: process.env.DOWNSTASH_TOKEN!, // dsk_… or dsr_…
  timeoutMs: 5000
});
```

`timeoutMs` is per attempt and defaults to 5000.

## Commands

```ts
await redis.ping(); // 'PONG'
await redis.set('foo', 'bar', { ex: 60 }); // 'OK' | null (with nx)
await redis.get('foo'); // string | null
await redis.incr('hits'); // number
await redis.del('foo', 'bar'); // number
await redis.expire('foo', 30); // 0 | 1
await redis.ttl('foo'); // number
```

Anything else goes through `execute`, which takes the same argv shape as the
REST body:

```ts
const rank = await redis.execute<number>(['ZRANK', 'lb', 'alice']);
```

`pipeline` and `multi` return the raw envelopes, in order, including the error
ones — a mid-pipeline failure does not throw:

```ts
const out = await redis.pipeline([
  ['SET', 'a', '1'],
  ['INCR', 'a']
]);
// [{ result: 'OK' }, { result: 2 }]
const bad = await redis.pipeline([['INCR', 'str-key']]);
// [{ error: 'WRONGTYPE …' }]
```

A single command that comes back as an error envelope throws `DownstashError`.

## With `@upstash/redis`

`createDownstashRequester` implements the `Requester` interface, so nothing
about `@upstash/redis` changes:

```ts
import { Redis } from '@upstash/redis';
import { createDownstashRequester } from '@downstash/client';

const redis = new Redis(
  createDownstashRequester({
    url: process.env.DOWNSTASH_URL!,
    token: process.env.DOWNSTASH_TOKEN!,
    fallback: {
      supabaseUrl: process.env.SUPABASE_URL!,
      supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY!
    }
  })
);
```

`req.path` maps to single / pipeline / multi; any other path goes to the gateway
only, without failover. The requester never sends `Upstash-Encoding`, so
`@upstash/redis` decodes plain JSON.

## Errors

```ts
try {
  await redis.get('k');
} catch (e) {
  if (e instanceof DownstashError) {
    e.command; // 'GET'
    e.source; // 'gateway' | 'rpc'
    e.status; // 401, 429, … or undefined
  }
}
```

## Gotchas

- The client does **not** base64-decode replies, because it never asks the
  gateway to base64-encode them. An early version decoded unconditionally and
  corrupted any value that happened to be valid base64. See
  [failover.md](./failover.md).
- `@downstash/client` has no runtime dependencies; `@upstash/redis` is an
  optional peer, needed only for `createDownstashRequester`.
- The protocol helpers are bundled in, so a published package does not pull the
  private `@downstash/protocol`.

## Related

- [failover.md](./failover.md) ·
  [`packages/client/README.md`](../../packages/client/README.md) ·
  [../gateway/protocol.md](../gateway/protocol.md)
