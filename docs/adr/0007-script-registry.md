---
title: Script registry
status: stable
last_updated: 2026-10-11
updated_by: P4-T1
---

# 0007. Script registry

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P4-T1

## Context

The PRD does not mention `EVAL`. `@upstash/ratelimit` is built on it: it calls
`EVALSHA` with a hardcoded SHA-1 and falls back to `EVAL` on `NOSCRIPT`.

## Decision

`EVAL` runs only a **registry of known scripts**, keyed by the SHA-1 of the
exact Lua body, each ported to PL/pgSQL. Anything else is
`ERR Downstash: arbitrary Lua is not supported (script <sha1> is not in the
registry)`; an unknown `EVALSHA` is `NOSCRIPT No matching script. Please use
EVAL.` so the client's fallback works.

The bodies come from `tests/capture/capture-scripts.ts`, which reads the
installed SDK, resolves `${…}` interpolation, and verifies every computed SHA-1
against the SDK's own map. Output is committed as `tests/capture/scripts.json`
and generates the registry rows.

## Consequences

**Positive**

- Ratelimit compatibility without a Lua VM in a 10 ms CPU budget.
- The registry is auditable: nine rows, each with its exact source text and its
  SDK provenance in `origin`.
- A bumped SDK version throws at capture time rather than failing at runtime.

**Negative**

- New scripts need a port, so a client feature that ships a new script needs a
  Downstash release.
- Multi-region and deny-list scripts are not registered; those paths error.

## Alternatives considered

| Alternative                           | Why not                           |
| ------------------------------------- | --------------------------------- |
| Embed a Lua interpreter in the Worker | CPU budget                        |
| Proxy EVAL to a real Redis            | Defeats the point and costs money |
