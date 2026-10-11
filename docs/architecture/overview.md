---
title: Architecture overview
status: stable
last_updated: 2026-10-11
updated_by: P1-T2
code_paths:
  - apps/gateway/src/index.ts
  - supabase/migrations/20261007000200_core_engine.sql
  - packages/protocol/src/commands.ts
---

# Architecture overview

> Downstash is a serverless Redis that speaks the Upstash REST protocol, with
> Postgres as the storage engine and a Cloudflare Worker as the gateway. Read
> this before `docs/engine/schema.md` or `docs/gateway/request-lifecycle.md`.

## The one rule that shapes everything

**All command semantics live in PL/pgSQL, inside `downstash.dispatch` and
`downstash.cmd_*`.** The gateway, the SDK's failover RPC and the console's data
browser and CLI all call `downstash.run`. A new command is added in SQL first
([adding-a-command.md](../engine/adding-a-command.md)).

This exists because there are three paths into the same keyspace. If each had
its own implementation, a command would behave differently depending on which
client you used. One implementation means one set of tests.

```mermaid
flowchart TD
    subgraph Clients
      A["@upstash/redis / @upstash/ratelimit"]
      B["@downstash/client (with failover)"]
      C["curl / browser path commands"]
      W["Console (Server Actions)"]
    end
    subgraph GW["apps/gateway — Cloudflare Worker"]
      G1["CORS + body limit"]
      G2["token regex + SHA-256"]
      G3["auth cache"]
      G4["L1 cache (opt-in)"]
      G5["parse + arity precheck"]
      G6["PostgREST adapter"]
    end
    subgraph SB["Supabase Postgres"]
      R1["public.downstash_gw_run (service_role)"]
      R2["public.downstash_exec / _pipeline / _multi (anon, token checked)"]
      E["downstash.run → dispatch → cmd_*"]
      KV["downstash.kv (UNLOGGED)"]
    end
    A --> G1; B --> G1; C --> G1
    G1 --> G2 --> G3 --> G4 --> G5 --> G6 -->|"HTTPS RPC"| R1 --> E --> KV
    B -.->|"on 429/5xx/network error"| R2 --> E
    W -->|"SQL over the transaction pooler"| E
```

## Components

| Component         | Lives in                                                            | Job                                                                                                                                           |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway           | `apps/gateway`                                                      | Upstash REST wire protocol, auth, L1 cache, usage accounting. Holds **no** Redis semantics.                                                   |
| Storage engine    | `supabase/migrations`                                               | The keyspace and every command. Atomic by construction.                                                                                       |
| Protocol package  | `packages/protocol`                                                 | Isomorphic helpers (argv normalisation, base64, tokens, CLI tokenising) shared by the gateway, the web app and the client. Zero dependencies. |
| Client SDK        | `packages/client`                                                   | Gateway-first transport with direct-RPC failover, plus a `Requester` for `@upstash/redis`.                                                    |
| Console + landing | `apps/web`                                                          | Next.js 15. UX copies Upstash; UI is Neo-brutalism.                                                                                           |
| Control plane     | `downstash.databases`, `downstash.tokens`, `downstash.usage_hourly` | Databases, tokens and usage, colocated with the keyspace.                                                                                     |

## Boundaries

- **The gateway never interprets a command.** It validates shape and arity,
  caches, and encodes. Semantics are SQL.
- **`downstash` schema is private.** PostgREST does not expose it, so the anon
  key cannot reach the keyspace directly. Only five vetted functions live in
  `public` (ADR [0002](../adr/0002-private-schema.md)).
- **Tokens are checked inside Postgres.** The Downstash token is the credential;
  the Supabase key only gets you to PostgREST
  (ADR [0003](../adr/0003-token-checked-failover.md)).
- **Every request is one transaction.** pipelined commands run in
  subtransactions, so a mid-pipeline error leaves the earlier ones applied:
  Redis `MULTI` semantics.

## Related

- [data-flow.md](./data-flow.md) · [security-model.md](./security-model.md) ·
  [../engine/schema.md](../engine/schema.md)
