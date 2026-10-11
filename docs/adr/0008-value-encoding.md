---
title: Value encoding
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
---

# 0008. Value encoding

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P1-T4

## Context

The PRD stores values as raw JSONB, so numbers stay numbers. Redis strings are
byte strings: after `INCR k`, `GET k` must return `"2"`, not `2` — the PRD's own
example shows `"1"`.

## Decision

Every Redis string is stored as a **JSON string**. `INCR` writes `"2"`. Hash
fields, list elements, set members and sorted-set members are likewise strings;
sorted-set scores are JSON numbers. Empty collections are never stored — the row
is deleted.

## Consequences

**Positive**

- `GET` after `INCR` returns `"2"`, and `@upstash/redis`'s automatic
  deserialisation turns it back into `2`, exactly as with Upstash.
- `TYPE`, `EXISTS` and `STRLEN` fall out of the same row shape.
- A JSON number can never be confused for a string by a client.

**Negative**

- Arithmetic needs a cast on read (`val #>> '{}'` then `::numeric`), and an
  unparseable value is an explicit error rather than a cast surprise.
- Some commands are slightly more verbose than they would be over typed columns.

## Alternatives considered

| Alternative                   | Why not                                    |
| ----------------------------- | ------------------------------------------ |
| Raw JSONB, numbers as numbers | The PRD's own example contradicts it       |
| One column per type           | Five tables, five FK sets, no shared index |
