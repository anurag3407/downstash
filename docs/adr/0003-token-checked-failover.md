---
title: Token-checked failover
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0003. Token-checked failover

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P1-T2

## Context

The PRD's failover signature is `downstash_exec(p_cmd, p_args)` called with the
Supabase key. Anyone holding the public anon key could then read and write every
database.

## Decision

The failover endpoints are `public.downstash_exec(p_token, p_cmd, p_args)`,
`public.downstash_pipeline(p_token, p_commands)` and
`public.downstash_multi(p_token, p_commands)`. The **Downstash token** is passed
in the body and hashed and checked inside Postgres. The Supabase anon key only
gets you to PostgREST.

A bad or unknown token returns `{"error":"Unauthorized"}`, which the client
surfaces as `DownstashError(status: 401, source: 'rpc')`.

## Consequences

**Positive**

- Failover is safe by construction, with no shared secret between the gateway
  and the RPC path.
- Read-only enforcement is the same code as the gateway's.
- Failover and the gateway cannot diverge in behaviour — both end in
  `downstash.run`.

**Negative**

- One extra hash per failover call, inside the same transaction.
- The token travels in a request body; TLS is mandatory, not optional.

## Alternatives considered

| Alternative                             | Why not                                |
| --------------------------------------- | -------------------------------------- |
| Service-role key in the client          | Ships a secret to every client install |
| A separate gateway-scoped token for RPC | Two token systems to rotate            |
