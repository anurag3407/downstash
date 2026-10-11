---
title: Components
status: stable
last_updated: 2026-10-11
updated_by: P6-T2
code_paths:
  - apps/web/components/ui/button.tsx
---

# Components

> Every `components/ui/*` item. Built on `cva` for variants, `cn()` for merging,
> forwarding `className` and refs. The base class strings in plan §11.4 are
> mandatory; layout classes may be added, the look may not.

## Buttons and inputs

| Component     | File               | Notes                                                                                                                                                                                        |
| ------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`      | `button.tsx`       | `primary` (accent), `secondary`, `muted`, `outline`, `dark`, `danger`, `ghost`; sizes `sm`/`md`/`lg`/`icon`; `asChild` via Radix `Slot`; `loading` swaps in a `Spinner` and sets `aria-busy` |
| `Input`       | `input.tsx`        | `h-14 border-4`, focus turns the field `bg-neo-secondary` with a hard shadow; `mono` prop adds `font-mono text-base`                                                                         |
| `Textarea`    | `textarea.tsx`     | input classes plus `min-h-40 font-mono`                                                                                                                                                      |
| `SecretField` | `secret-field.tsx` | client; value arrives through an async `reveal()` prop so no secret is in the initial HTML                                                                                                   |
| `Field`       | `field.tsx`        | label + control + hint + error; wires `aria-describedby` and `aria-invalid`                                                                                                                  |
| `Label`       | `label.tsx`        | `text-xs font-black uppercase tracking-widest`                                                                                                                                               |

## Surfaces

| Component                                                      | Notes                                                                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `Card`, `CardHeader`, `CardTitle`, `CardContent`, `CardFooter` | `border-4 shadow-neo-md`; header `tone` is `muted` (default), `secondary`, `accent`, `black` or `white`; `interactive` adds the lift-on-hover |
| `Table`                                                        | wrapper `overflow-x-auto border-4 shadow-neo-md`; `th` on `bg-neo-secondary`; last row loses its bottom border                                |
| `StatCard`                                                     | icon box + label + value + hint                                                                                                               |
| `ProgressBar`                                                  | track `h-8 border-4`; fill `bg-neo-secondary` below 70 %, `bg-neo-accent` 70–90 %, `bg-neo-accent bg-stripes` above                           |

## Overlays

| Component      | Notes                                                                                                                                  |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Dialog`       | overlay `bg-black/40 bg-halftone`; content `bg-neo-canvas shadow-neo-xl`; header `bg-neo-secondary`; close button at `-right-4 -top-4` |
| `AlertDialog`  | as Dialog with an `accent` header and a `danger` confirm; optional `confirmText` requires typing an exact string                       |
| `Tooltip`      | black surface, white text, `border-2`                                                                                                  |
| `DropdownMenu` | content as Select, separator `h-1 bg-black`                                                                                            |

## Navigation

`Tabs` (bordered list, active trigger `bg-neo-secondary`), `NavTabs` (links,
active `bg-neo-accent` with `aria-current="page"`), `Switch` (`h-8 w-14`, thumb
translates 6 on check), `Select`, `Accordion` (open trigger `bg-neo-accent`, plus
icon rotating 45°).

## Feedback

`Badge` (tones + `shape` square/pill), `EmptyState` (dashed border, spinning
star), `Skeleton`, `Spinner` (`aria-live` via `role="status"`), `Toaster`
(sonner, `unstyled`, bottom-right), `Kbd`, `Separator`, `Texture`.

## Code and data

`CodeBlock` (server-rendered, Shiki with the neo theme — keywords accent,
strings secondary, functions muted, rest white on ink), `CopyButton` (copies,
shows `Check` for 1500 ms, toasts `COPIED`), `TypeBadge` (per
[data type colours](./tokens.md)).

## Brand

`LogoMark` (black-bordered accent square with `ArrowDownToLine`), `Logo`
(mark + rotated wordmark box). `app/icon.svg` is the favicon.

## Do / don't

| Do                                     | Don't                               |
| -------------------------------------- | ----------------------------------- |
| Compose with layout classes            | Change a base class string          |
| Use a tone for a whole block           | Sprinkle colour on single words     |
| Put a text label next to an icon       | Rely on colour alone                |
| Use `Button loading` for async actions | Disable a button without saying why |

## Related

- [tokens.md](./tokens.md) · [patterns.md](./patterns.md) ·
  [../conventions/code-style-react.md](../conventions/code-style-react.md)
