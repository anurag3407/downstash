# @downstash/client

Failover-aware client for a Downstash gateway, plus a drop-in `Requester` for
`@upstash/redis`.

- Gateway first, direct Supabase PostgREST RPC on 429/5xx/network errors.
- Sticky failover window so a struggling gateway does not get retried per call.
- No runtime dependencies (the protocol helpers are bundled in).

## Install

```bash
pnpm add @downstash/client
```

`@upstash/redis` is an optional peer dependency — only needed for
`createDownstashRequester`.

## Usage

```ts
import { Downstash } from '@downstash/client';

const redis = new Downstash({
  url: process.env.DOWNSTASH_URL!,
  token: process.env.DOWNSTASH_TOKEN!,
  fallback: {
    supabaseUrl: process.env.SUPABASE_URL!,
    // The publishable (anon) key is enough: the Downstash token is checked
    // inside Postgres.
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY!
  }
});

await redis.set('foo', 'bar');
const value = await redis.get('foo');
```

### Commands

| Method                                                                         | Reply                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------- |
| `execute(['SET', 'k', 'v'])`                                                   | the command result, `DownstashError` on an error envelope |
| `pipeline([['INCR', 'c'], ['GET', 'c']])`                                      | `ResultEnvelope[]`, in order                              |
| `multi([...])`                                                                 | identical to `pipeline` (Downstash pipelines are atomic)  |
| `ping()`, `get()`, `set()`, `incr()`, `incrby()`, `del()`, `expire()`, `ttl()` | thin wrappers over `execute`                              |

## Failover

Failover triggers on:

| Gateway reply      | Reason                                                   |
| ------------------ | -------------------------------------------------------- |
| `429`              | `rate_limited`                                           |
| `>= 500`           | `server_error`                                           |
| network error      | `network_error`                                          |
| timeout            | `timeout` (only when `failoverOnTimeout` is not `false`) |
| sticky window open | (no event; goes straight to RPC)                         |

`400`, `401`, `403`, `404` and `413` are **not** failover conditions: they mean
your request was wrong, and re-running it through the RPC would hide the bug.

After a failover the client calls the RPC directly for `stickyFailoverMs`
(default 60 000 ms). `onFailover` fires once per transition.

```ts
const redis = new Downstash({
  url: process.env.DOWNSTASH_URL!,
  token: process.env.DOWNSTASH_TOKEN!,
  fallback: { supabaseUrl, supabaseKey },
  timeoutMs: 5000,
  failoverOnTimeout: true,
  stickyFailoverMs: 60_000,
  onFailover: (e) => console.warn('downstash failover', e.reason, e.status)
});
```

> [!IMPORTANT]
> A timed-out gateway request may still have been applied. Failing over then
> runs the command twice. For a rate limiter that only makes the limit slightly
> stricter. For non-idempotent business writes, set `failoverOnTimeout: false`.

## `@upstash/redis` integration

```ts
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
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

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '10 s')
});

const { success, remaining } = await ratelimit.limit('user:42');
```

The requester maps `req.path` to single / pipeline / multi, never sends
`Upstash-Encoding` (so results come back plain) and returns the same envelope
shapes `@upstash/redis` expects. Any other `req.path` is sent to the gateway
only, without failover.

## Errors

Every failure throws `DownstashError`:

```ts
class DownstashError extends Error {
  readonly command: string | undefined; // 'SET', 'GET', ...
  readonly source: 'gateway' | 'rpc';
  readonly status: number | undefined;
}
```

## Related

- [docs/client/usage.md](../../docs/client/usage.md)
- [docs/client/failover.md](../../docs/client/failover.md)
- [plan.md §10](../../plan.md) — the specification this package implements
