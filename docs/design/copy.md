---
title: UI copy
status: stable
last_updated: 2026-10-11
updated_by: P8-T1
code_paths:
  - apps/web/components/marketing/hero.tsx
---

# UI copy

> The rules for every string the user sees.

## Case

| Where                                           | Case                                                  |
| ----------------------------------------------- | ----------------------------------------------------- |
| Headings, buttons, labels, badges, tabs, toasts | UPPERCASE, short, punchy                              |
| Body copy                                       | Sentence case, second person, ≤ 20 words per sentence |

Buttons are at most four words: `CREATE DATABASE`, `ROTATE TOKEN`, `SAVE`.

## Numbers

| Context             | Format                      |
| ------------------- | --------------------------- |
| Money               | `$0.00`                     |
| Counts              | `100,000`, `500 MB`, `1 MB` |
| Durations in labels | `60 S`, `5S`                |
| Durations in body   | `60 seconds`, `5 seconds`   |

## Toasts

Success, fixed:

`DATABASE CREATED` · `DATABASE RENAMED` · `SETTINGS SAVED` · `TOKEN ROTATED` ·
`KEY CREATED` · `KEY SAVED` · `KEY DELETED` · `TTL UPDATED` ·
`DATABASE FLUSHED` · `DATABASE DELETED` · `COPIED`

Failures use the `ActionResult.message` verbatim, so the same reason reads the
same everywhere.

## Forbidden

- Exclamation marks.
- Emojis.
- "Upstash" in the console UI, except inside connect snippets where it is a
  package or env var name. The landing page may compare.
- Marketing superlatives in the console ("blazing fast"). The landing page is
  allowed its own voice; the console is a tool.

## Redis replies

Shown verbatim, mono: `(nil)`, `(integer) 1`, `OK`. Never translated into
sentences.

## Empty states

Title states the situation, description states the action:

- `NO DATABASES. YET.` — `Create your first database. It costs exactly $0.00.`
- `PICK A KEY` — `Select a key on the left or add a new one.`
- `KEY GONE` — `This key was deleted somewhere else. Refresh to see the current keys.`

## Related

- [system.md](./system.md) ·
  [../conventions/writing-style.md](../conventions/writing-style.md)
