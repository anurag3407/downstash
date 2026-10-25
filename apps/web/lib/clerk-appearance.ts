/**
 * @file apps/web/lib/clerk-appearance.ts
 * Clerk appearance mapped onto the Neo-brutalism tokens (§11.6). Keys are
 * checked against the installed `@clerk/types`; Clerk has renamed variables
 * between majors, so adjust names and keep the intent.
 */
import type { Appearance } from '@clerk/types';
import { NEO } from './tokens.ts';

export const clerkAppearance: Appearance = {
  cssLayerName: 'clerk',
  variables: {
    colorPrimary: NEO.accent,
    colorText: NEO.ink,
    colorTextOnPrimaryBackground: NEO.ink,
    colorBackground: NEO.canvas,
    colorInputBackground: NEO.white,
    colorInputText: NEO.ink,
    colorDanger: NEO.ink,
    borderRadius: '0rem',
    fontFamily: 'var(--font-space-grotesk)',
    fontWeight: { normal: 700, medium: 700, bold: 900 }
  },
  elements: {
    rootBox: 'w-full',
    card: 'rounded-none border-4 border-black bg-neo-canvas shadow-neo-lg',
    headerTitle: 'text-2xl font-black uppercase tracking-tight',
    headerSubtitle: 'font-bold',
    socialButtonsBlockButton:
      'h-12 rounded-none border-4 border-black bg-white font-bold uppercase shadow-neo-sm hover:bg-neo-secondary',
    dividerLine: 'h-1 bg-black',
    formFieldLabel: 'text-xs font-black uppercase tracking-widest',
    formFieldInput:
      'h-12 rounded-none border-4 border-black bg-white font-bold focus:bg-neo-secondary focus:shadow-neo-sm',
    formButtonPrimary:
      'h-12 rounded-none border-4 border-black bg-neo-accent font-bold uppercase tracking-wide text-black shadow-neo-sm hover:bg-neo-accent active:translate-x-[2px] active:translate-y-[2px] active:shadow-none',
    footerActionLink: 'font-black text-black underline decoration-4 underline-offset-4',
    userButtonAvatarBox: 'size-10 rounded-none border-4 border-black',
    userButtonPopoverCard: 'rounded-none border-4 border-black shadow-neo-md',
    organizationSwitcherTrigger:
      'h-12 rounded-none border-4 border-black bg-white px-3 font-bold uppercase shadow-neo-sm',
    organizationSwitcherPopoverCard: 'rounded-none border-4 border-black shadow-neo-md'
  }
};
