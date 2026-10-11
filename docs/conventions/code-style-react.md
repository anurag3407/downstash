---
title: Code style (React / Next.js)
status: stable
last_updated: 2026-10-11
updated_by: P6-T1
code_paths:
  - apps/web/app/layout.tsx
---

# Code style (React / Next.js)

> The web app is Next.js 15 App Router. Server Components are the default;
> client components are the exception, pushed as low in the tree as possible.

## Server first

Read: `features/<feature>/queries.ts` with `import 'server-only'`. Mutate:
`features/<feature>/actions.ts` with `'use server'`. Validate in both places with
`features/<feature>/schemas.ts` (zod). Components never call `fetch` against our
own API routes.

## File naming

Route files keep the App Router names (`page.tsx`, `layout.tsx`,
`not-found.tsx`, `error.tsx`, `route.ts`); everything else is
`kebab-case.tsx` with a `PascalCase` component export. Hooks live in
`use-thing.ts` exporting `useThing`.

## Client components

Add `'use client'` only for interactivity — state, effects, event handlers,
browser APIs. Put it on the leaf, not the page. Prefer passing a server-rendered
result into a small client island over fetching on the client.

## Styling

Tailwind classes built from design tokens only, merged with `cn()`. No CSS
modules, no inline `style` except computed values (a chart width, a progress
percentage). `pnpm check:design` enforces this in CI.

## Accessibility

- Every interactive element is a real `<button>`, `<a>` or form control.
- Labels are wired with `<label htmlFor>` / `aria-labelledby`; `Field` does this
  for you.
- Async controls get `aria-busy` while loading.
- Icon-only buttons get an `aria-label`.
- Colour is never the only signal: the data browser adds a `TypeBadge` with
  text, not just a colour.
- Focus is visible: the base layer sets `:focus-visible { outline: 3px solid }`.

## Data flow

```
page.tsx (Server Component)
  └─ queries.ts      → server-only read
  └─ <ClientIsland 'use client'>
       └─ actions.ts  → server action → ActionResult<T>
```

## Related

- [../design/components.md](../design/components.md) ·
  [../web/data-access.md](../web/data-access.md)
