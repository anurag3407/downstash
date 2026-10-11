---
title: Docs index
status: stable
last_updated: 2026-10-07
updated_by: P0-T1
code_paths:
  - README.md
---

# Downstash docs

Downstash is a Redis-compatible, Postgres-backed key-value store exposed over
the Upstash REST protocol. Read the docs in this order if you are new here.

## Reading order

1. [Project README](../../README.md) — what it is, how to run it.
2. [Codemap](./codemap.md) — every source file, one line each.
3. [Progress](./progress.md) — what is done, in progress, deviations.
4. [Glossary](./glossary.md) — shared vocabulary.

## Architecture

- [Overview](./architecture/overview.md)
- [Data flow](./architecture/data-flow.md)
- [Security model](./architecture/security-model.md)

## Conventions

- [Writing style](./conventions/writing-style.md)
- [Documentation](./conventions/documentation.md)
- [Code style (TypeScript)](./conventions/code-style-typescript.md)
- [Code style (SQL)](./conventions/code-style-sql.md)
- [Testing](./conventions/testing.md)
- [Git](./conventions/git.md)

## Storage engine

- [Schema](./engine/schema.md)
- [Value encoding](./engine/value-encoding.md)
- [Commands](./engine/commands.md) (generated — do not edit)
- [Adding a command](./engine/adding-a-command.md)
- [Scripts](./engine/scripts.md)
- [Concurrency](./engine/concurrency.md)
- [Errors](./engine/errors.md)

## Gateway

- [Request lifecycle](./gateway/request-lifecycle.md)
- [Protocol](./gateway/protocol.md)
- [Auth](./gateway/auth.md)
- [L1 cache](./gateway/l1-cache.md)
- [Configuration](./gateway/configuration.md)

## Client

- [Usage](./client/usage.md)
- [Failover](./client/failover.md)

## Operations

- [Local dev](./ops/local-dev.md)
- [Deploy](./ops/deploy.md)
- [Env vars](./ops/env-vars.md)
- [Durability](./ops/durability.md)
- [Runbook](./ops/runbook.md)

## Comparisons

- [Upstash user flow](./upstash-flow-comparison.md) — stage-by-stage diff, gaps, launch fixes.

## Architecture decision records

- [ADR template](./adr/0000-template.md)
