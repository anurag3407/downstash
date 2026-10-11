---
title: SQL is the engine
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0005. SQL is the engine

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P1-T2

## Context

The PRD puts command semantics partly in the Worker ("AST parser"). There are
two clients into the same keyspace — the gateway and the SDK's direct-RPC
failover — and they must behave identically.

## Decision

**Every command is a PL/pgSQL function.** The gateway normalises, validates
arity, caches and encodes; it never interprets a command. `downstash.dispatch`
looks the command up in `downstash.command_registry`, checks arity, flags and
key lengths, and executes `downstash.cmd_<name>($1, $2)`.

Both the gateway and the failover RPC end in `downstash.run`, so a command has
exactly one implementation.

## Consequences

**Positive**

- Failover is behaviourally identical to the gateway, by construction.
- Tests run against Postgres directly, with no Worker in the loop.
- The TypeScript `COMMANDS` mirror is only for early validation and UI metadata,
  and a parity test keeps it honest.
- Multi-key writes lock in sorted order in one place.

**Negative**

- A new command needs a migration, not just a deploy.
- The Worker's 10 ms CPU budget is not a place to optimise semantics; it is a
  reason to keep pipelines small.
- The gateway still does an arity precheck in TS, so a wrong-arity error can be
  answered without a DB call — two places to keep the message identical.

## Alternatives considered

| Alternative                                                     | Why not                                       |
| --------------------------------------------------------------- | --------------------------------------------- |
| Semantics in the gateway, failover a partial re-implementation  | They drift; failover becomes a second product |
| Two implementations with a differential suite as the only guard | The suite runs after the bug                  |
