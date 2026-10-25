/**
 * @file apps/web/lib/tokens.ts
 * Raw design token values for libraries that can't consume CSS classes
 * (Recharts, Clerk, Shiki). This file is on the check-design allowlist; no other
 * TS file may hold a hex value.
 * @see docs/design/tokens.md
 */
export const NEO = {
  canvas: '#FFFDF5',
  ink: '#000000',
  accent: '#FF6B6B',
  secondary: '#FFD93D',
  muted: '#C4B5FD',
  white: '#FFFFFF'
} as const;

export type NeoColor = keyof typeof NEO;

/** A design-system colour as a hex string. */
export type NeoHex = (typeof NEO)[NeoColor];
