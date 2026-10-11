---
title: Patterns
status: stable
last_updated: 2026-10-11
updated_by: P8-T1
code_paths:
  - apps/web/components/marketing/hero.tsx
---

# Patterns

> Recurring page shapes. One component per section, named as the plan names them.

## Layout primitives

| Primitive    | Class                                                                            |
| ------------ | -------------------------------------------------------------------------------- |
| `Container`  | `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8`                                  |
| `Section`    | `relative overflow-hidden border-b-4 border-black` + `tone` + optional `texture` |
| `PageHeader` | eyebrow `Badge`, title, description, actions                                     |

## The "chaos zone"

A hero slot with a fixed minimum height that stacks a `CodeBlock`, rotated
stickers, a spinning star, a filled square and a large stroked background
number. Everything is `aria-hidden` except the code. The rotation and bounce are
disabled under `prefers-reduced-motion`.

## Colour-blocked sections

Each landing section picks one tone and commits to it: `secondary` for the
how-it-works, `muted` for features, `black` for the ratelimit showcase (the only
place white text is allowed), `accent` for the final call to action. The console
uses the same trick at the card-header level.

## Console page pattern

1. `PageHeader` with an eyebrow badge, an uppercase title and a primary action.
2. NavTabs for the sections that belong to one database.
3. A grid of `Card`s, each with a toned header.
4. One `EmptyState` per list, with a rotated `Sticker` as the only flourish.

## Tables

The pattern is a bordered wrapper, a `secondary` head, `2px` row dividers and a
hover of `bg-neo-canvas`. Numbers are right-aligned and formatted by
`lib/format.ts`.

## Async actions

Every mutation returns `ActionResult<T>`. The client runs it in
`useTransition`, sets `Button loading`, maps `fieldErrors` onto `Field error`,
and toasts `message`. Success toasts are the fixed copy in
[copy.md](./copy.md).

## Accessibility patterns

- A section's heading is the first focusable target when you jump by heading.
- Every `Dialog` traps focus and closes on `Escape`.
- `aria-current="page"` marks the active nav link.
- Tables are real `<table>` elements, so screen readers can announce them.

## Related

- [system.md](./system.md) · [components.md](./components.md) ·
  [../web/routes.md](../web/routes.md)
