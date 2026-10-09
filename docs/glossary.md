---
title: Glossary
status: stable
last_updated: 2026-10-07
updated_by: P0-T1
code_paths:
  - packages/protocol/src/types.ts
---

# Glossary

- **Downstash** — The Redis-compatible store described in `plan.md`.
- **Gateway** — The Cloudflare Worker that speaks the Upstash REST protocol.
- **Engine** — The PL/pgSQL command dispatch layer inside Postgres.
- **SRH** — serverless-redis-http, the reference implementation used for differential testing.
- **Dispatch** — `downstash.dispatch(db, readonly, argv)`: resolve command, arity, permission, call handler.
- **Registry** — `downstash.command_registry`, the table of known commands (kept in parity with `COMMANDS`).
- **Token** — A `dsk_…` (standard) or `dsr_…` (read-only) credential. Stored hashed; never plaintext.
- **Failover** — Client switching from the gateway to direct Supabase RPC when the gateway is unavailable.
- **L1 cache** — The gateway's in-isolate cache for cacheable reads.
