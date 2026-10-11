---
title: Design tokens
status: stable
last_updated: 2026-10-11
updated_by: P6-T1
code_paths:
  - apps/web/app/globals.css
---

# Design tokens

> `apps/web/app/globals.css` is the single source of truth. `lib/tokens.ts` holds
> the same values as raw hex for libraries that cannot consume CSS classes
> (Recharts, Clerk, Shiki). Those are the only two files allowed to contain hex.

## Colour

| Token                   | Value     | Class                             | Use                           |
| ----------------------- | --------- | --------------------------------- | ----------------------------- |
| `--color-neo-canvas`    | `#FFFDF5` | `bg-neo-canvas` `text-neo-canvas` | page background               |
| `--color-neo-ink`       | `#000000` | `bg-black` `text-black`           | borders, ink                  |
| `--color-neo-accent`    | `#FF6B6B` | `bg-neo-accent`                   | primary actions, list badges  |
| `--color-neo-secondary` | `#FFD93D` | `bg-neo-secondary`                | headers, table heads          |
| `--color-neo-muted`     | `#C4B5FD` | `bg-neo-muted`                    | hash badges, accordion bodies |
| `--color-white`         | `#FFFFFF` | `bg-white`                        | cards, set badges             |

There are **no grays**. `--color-*: initial` in the `@theme` block resets
Tailwind's default palette, so `bg-gray-500` generates no CSS at all.

## Contrast rules

- Black text on canvas, accent, secondary, muted and white.
- White text only on black.
- Never white on red: `#FFF` on `#FF6B6B` is 2.8:1 and fails AA.

## Border and radius

| Use                                             | Class                     |
| ----------------------------------------------- | ------------------------- |
| Default                                         | `border-4 border-black`   |
| Dense inline (badges, rows, small icon buttons) | `border-2 border-black`   |
| Hero / section dividers                         | `border-8 border-black`   |
| Corners                                         | `rounded-none` everywhere |
| Pills, circles                                  | `rounded-full`            |

`--radius-*: initial` removes `rounded-md`, `rounded-lg` and friends.

## Shadow

| Token                       | Value                 |
| --------------------------- | --------------------- |
| `--shadow-neo-xs`           | `2px 2px 0 0 #000`    |
| `--shadow-neo-sm`           | `4px 4px 0 0 #000`    |
| `--shadow-neo-hover`        | `6px 6px 0 0 #000`    |
| `--shadow-neo-md`           | `8px 8px 0 0 #000`    |
| `--shadow-neo-lg`           | `12px 12px 0 0 #000`  |
| `--shadow-neo-xl`           | `16px 16px 0 0 #000`  |
| `--shadow-neo-white-md`     | `8px 8px 0 0 #FFF`    |
| `--shadow-neo-white-xl`     | `20px 20px 0 0 #FFF`  |
| `--shadow-neo-accent-sm`    | `4px 4px 0 0 #FF6B6B` |
| `--shadow-neo-secondary-md` | `8px 8px 0 0 #FFD93D` |

Hard, zero-blur, bottom-right offset. `--shadow-*: initial` resets Tailwind's
soft shadows.

## Type

| Role                   | Class                                                                            |
| ---------------------- | -------------------------------------------------------------------------------- |
| Display / H1 (landing) | `text-5xl sm:text-7xl md:text-8xl lg:text-9xl leading-[0.85]`                    |
| Page title (console)   | `text-4xl md:text-6xl leading-none`                                              |
| H2                     | `text-4xl sm:text-6xl md:text-7xl leading-none` / console `text-2xl md:text-3xl` |
| Body                   | `text-lg md:text-xl leading-relaxed` / console `text-base leading-snug`          |
| Label                  | `text-sm uppercase tracking-widest` / console `text-xs`                          |
| Code, keys, tokens     | `font-mono` (Space Mono, ADR [0013](../adr/0013-monospace-exception.md))         |

Headings get `font-black uppercase tracking-tighter` from the base layer. Font
weights are 700/900 only.

## Motion

`duration-100` for buttons, `duration-200`/`300` for cards, `ease-linear` or
`ease-out`. Never `ease-in-out`. Animations: `animate-spin-slow`,
`animate-pop-in`, `animate-wiggle`. `prefers-reduced-motion` collapses every
duration to 0.01 ms in `globals.css`.

## Utilities

`text-stroke`, `text-stroke-white`, `text-shadow-neo`, `text-shadow-neo-lg`,
`bg-halftone`, `bg-dots`, `bg-grid`, `bg-noise`, `bg-stripes`.

## Related

- [system.md](./system.md) · [components.md](./components.md) ·
  [../conventions/code-style-react.md](../conventions/code-style-react.md)
