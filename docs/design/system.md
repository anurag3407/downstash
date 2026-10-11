---
title: Design system
status: stable
last_updated: 2026-10-11
updated_by: P6-T1
code_paths:
  - apps/web/app/globals.css
  - tooling/check-design/src/rules.ts
---

# Design system

> **UX = Upstash. UI = Neo-brutalism.** The flows, page names and order of
> actions follow Upstash. Every pixel of visual styling follows this file and
> [tokens.md](./tokens.md).

## Non-negotiables

1. Colours come only from the six tokens. No grays.
2. Borders are `border-4 border-black` by default, `border-2` for dense inline
   elements, `border-8` for hero and section dividers.
3. Corners are `rounded-none`. `rounded-full` is for pill badges, circular
   stickers and decorative circles only.
4. Shadows are hard, zero blur, bottom-right, from the `shadow-neo-*` set.
5. Headings are `font-black uppercase tracking-tighter`; labels are `uppercase
tracking-widest`; weights are 700/900.
6. Motion is `duration-100` or `duration-200`/`300`, `ease-linear` or
   `ease-out`. Never `ease-in-out`. `prefers-reduced-motion` is respected.
7. No blur, no gradients, no backdrop blur, no soft shadows. Alpha only for
   texture overlays, the dialog scrim, disabled states and placeholders.
8. Contrast: black text on accent, secondary, muted, white and canvas; white
   only on black. Never white on red.

## Scales

| Use             | Landing                                                       | Console                             |
| --------------- | ------------------------------------------------------------- | ----------------------------------- |
| H1              | `text-5xl sm:text-7xl md:text-8xl lg:text-9xl leading-[0.85]` | `text-4xl md:text-6xl leading-none` |
| H2              | `text-4xl sm:text-6xl md:text-7xl leading-none`               | `text-2xl md:text-3xl`              |
| H3              | `text-3xl md:text-4xl`                                        | `text-xl`                           |
| Body            | `text-lg md:text-xl leading-relaxed`                          | `text-base leading-snug`            |
| Label           | `text-sm uppercase tracking-widest`                           | `text-xs uppercase tracking-widest` |
| Section padding | `py-16 md:py-24 lg:py-32`                                     | `py-8 md:py-10`                     |
| Gaps            | `gap-8 md:gap-12`                                             | `gap-6`                             |
| Shadows         | `md`–`xl`                                                     | `sm`–`md`                           |

The console is denser but still unmistakably brutalist: thick borders, hard
shadows, uppercase labels, colour blocking.

## Colour blocking

Each section and card header takes a **tone**: `canvas`, `secondary`, `muted`,
`accent`, `black` or `white`. Colour is applied in blocks — a whole header, a
whole section — never as a one-off accent on a word.

## Data type colours

| Type   | Tone               |
| ------ | ------------------ |
| STRING | secondary (yellow) |
| HASH   | muted (violet)     |
| LIST   | accent (red)       |
| SET    | white              |
| ZSET   | black (white text) |

Always rendered through `TypeBadge`, so the colour and the text agree.

## Downstash deviations from the original brief

| Deviation                                                                      | Reason                                                                                              |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Space Mono for code, keys, tokens and the CLI                                  | the data browser and the CLI need a monospace font — ADR [0013](../adr/0013-monospace-exception.md) |
| Synthesised 900 weight                                                         | Space Grotesk tops out at 700 on Google Fonts                                                       |
| `disabled:opacity-60`, `placeholder:text-black/40`, `bg-black/40` dialog scrim | the brief forbids alpha except for overlays, scrims, disabled states and placeholders               |
| Console scale above                                                            | the brief only specified the landing scale                                                          |

## Enforcement

`pnpm check:design` scans `apps/web/{app,components,features,lib}/**/*.{ts,tsx}`
and fails on: mid radii, raw hex, blur, gradients, grays, soft easing, light
weights, slow motion, default shadows, and inline colour styles. The allowlist
is `lib/tokens.ts`, `lib/shiki.ts` and `lib/clerk-appearance.ts`.

## Related

- [tokens.md](./tokens.md) · [components.md](./components.md) ·
  [patterns.md](./patterns.md) · [copy.md](./copy.md)
