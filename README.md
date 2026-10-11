[![CI](https://github.com/downstash/downstash/actions/workflows/ci.yml/badge.svg)](https://github.com/downstash/downstash/actions/workflows/ci.yml)

```
 ██████╗  ██████╗ ██╗    ██╗███╗   ██╗███████╗████████╗ █████╗ ███████╗██╗  ██╗
 ██╔══██╗██╔═══██╗██║    ██║████╗  ██║██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║  ██║
 ██║  ██║██║   ██║██║    ██║██╔██╗ ██║███████╗   ██║   ███████║███████╗███████║
 ██║  ██║██║   ██║██║    ██║██║╚██╗██║╚════██║   ██║   ██╔══██║╚════██║██╔══██║
 ██████╔╝╚██████╔╝███████╗██║ ╚████║███████║   ██║   ██║  ██║███████║██║  ██║
 ╚═════╝  ╚═════╝ ╚══════╝╚══════╝ ╚═════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝
```

# Downstash

**Self-hosted, $0.00/month, Upstash-wire-compatible serverless Redis and rate
limiting.**

Downstash speaks the Upstash REST protocol on Cloudflare Workers and Supabase
Postgres. Point `@upstash/redis` at it and your code keeps working — you lose the
bill, not the API.

## What you get

- **A Cloudflare Worker gateway** that implements `POST /`, `POST /pipeline`,
  `POST /multi-exec` and path commands, `Upstash-Encoding: base64`, `_token` query
  auth and CORS. 95 commands across strings, keyspace, expiry, hashes, lists,
  sets, sorted sets, server and scripting.
- **A Postgres storage engine.** An `UNLOGGED` JSONB keyspace plus PL/pgSQL that
  runs every command atomically — the same code for the gateway, the SDK's
  failover and the console.
- **Direct-RPC failover.** `@downstash/client` reroutes to Supabase's REST
  endpoint on 429, 5xx or a network error, and stays there for a sticky window.
- **`@upstash/ratelimit` compatibility** — fixed window, sliding window, token
  bucket and cached fixed window, plus `getRemaining` and `resetUsedTokens`.
- **A console** that copies the Upstash UX and replaces the UI with
  Neo-brutalism: database list, details/connect, usage charts, data browser, web
  CLI, settings, quotas.
- **Ops built in.** pg_cron sweeper, stats, retention, and a Worker Cron Trigger
  that keeps a free Supabase project awake.

## 60-second quickstart

```bash
nvm use
corepack enable && pnpm i

# 1. Load migrations into a scratch Postgres (no Docker needed)
./supabase/scripts/pg-local-reset.sh

# 2. Secrets for the local gateway
cp apps/gateway/.dev.vars.example apps/gateway/.dev.vars

# 3. Build the client and run
pnpm i
pnpm --filter @downstash/client build
pnpm dev        # gateway :8787, web :3000

# 4. Prove it
curl -s -X POST http://127.0.0.1:8787/ \
  -H 'Authorization: Bearer dsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' \
  -d '["PING"]'
# → {"result":"PONG"}
```

Detailed setup: [`docs/ops/local-dev.md`](./docs/ops/local-dev.md).

## Using it from your app

```ts
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!, // your gateway URL
  token: process.env.UPSTASH_REDIS_REST_TOKEN!
});

await redis.set('foo', 'bar');
const value = await redis.get('foo');
```

That is the whole migration: two environment variables.

## Compatibility

|                         | Status                                                                   |
| ----------------------- | ------------------------------------------------------------------------ |
| `@upstash/redis`        | ✅ both response encodings, JSON auto-(de)serialization, pipeline, multi |
| `@upstash/ratelimit`    | ✅ fixed window, sliding window, token bucket, cached fixed window       |
| Commands                | ✅ 95, listed in [`docs/engine/commands.md`](./docs/engine/commands.md)  |
| Differential vs Redis 7 | ✅ 301 corpus steps over SRH                                             |

## Limitations (v1.0)

- No raw TCP/RESP, so `redis-cli` and `ioredis` do not work — use the REST
  protocol or `@downstash/client`.
- No Pub/Sub, no Streams, no RedisJSON.
- No arbitrary Lua. `EVAL` runs a registry of nine known `@upstash/ratelimit`
  scripts, ported to PL/pgSQL.
- Keys live in an `UNLOGGED` table, so a Postgres crash can wipe them. Fine for a
  cache or a rate limiter; run `pnpm db:durable` if it is not.
- Multi-region replication is out of scope. Billing is out of scope.

## Repository layout

| Path                  | What                                                     |
| --------------------- | -------------------------------------------------------- |
| `apps/gateway`        | Cloudflare Worker: Upstash REST protocol, auth, L1 cache |
| `apps/web`            | Next.js 15 console and landing                           |
| `packages/protocol`   | Isomorphic protocol helpers (internal)                   |
| `packages/client`     | `@downstash/client` with failover                        |
| `supabase/migrations` | The storage engine — every command lives here            |
| `tests`               | SQL, compatibility and differential suites               |
| `docs`                | Documentation, ADRs, conventions                         |

## Docs

Start at [`docs/README.md`](./docs/README.md). If you are an agent, read
[`AGENTS.md`](./AGENTS.md) first.

## Cost

**$0.00 / month.** Cloudflare Workers free plan, Supabase free plan, Clerk free
plan. No credit card is involved at any point.

## Licence

MIT. See [LICENSE](./LICENSE).

Not affiliated with Upstash.
