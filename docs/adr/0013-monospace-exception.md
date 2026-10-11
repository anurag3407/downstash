---
title: Monospace exception
status: stable
last_updated: 2026-10-11
updated_by: P6-T1
---

# 0013. Monospace exception

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P6-T1

## Context

The design system is Space Grotesk 700/900 everywhere, with one exception
recorded here: the data browser and the CLI display keys, tokens, values and
numeric ids, and a proportional font makes them unreadable.

## Decision

Space Mono 400/700 is allowed **only** for code, keys, tokens, the CLI and
numeric identifiers. It is declared as `--font-mono` in `globals.css`, and
`code`, `kbd`, `samp` and `pre` default to it in the base layer. Everything else
stays Space Grotesk.

## Consequences

**Positive**

- Keys line up in the data browser; a token is readable; the CLI looks like a
  terminal.
- One utility class (`font-mono`) marks every exception, so the rule is
  auditable.

**Negative**

- The type system is no longer one font, and a reviewer has to check that
  `font-mono` appears only in the allowed places.

## Alternatives considered

| Alternative                      | Why not                         |
| -------------------------------- | ------------------------------- |
| One font, accept unreadable keys | The data browser is the product |
| A third display font for data    | Two exceptions instead of one   |
