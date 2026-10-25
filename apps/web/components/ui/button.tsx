/**
 * @file apps/web/components/ui/button.tsx
 * Button (§11.4). `cva` variants, Radix `Slot` for `asChild`, `loading` swaps the
 * icon for a Spinner and sets `aria-busy`.
 */
'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils.ts';
import { Spinner } from './spinner.tsx';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-none border-4 border-black font-bold uppercase tracking-wide select-none transition-[transform,box-shadow] duration-100 ease-linear focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-black focus-visible:ring-offset-2 focus-visible:ring-offset-neo-canvas active:translate-x-[2px] active:translate-y-[2px] active:shadow-none disabled:pointer-events-none disabled:opacity-60 disabled:shadow-none [&_svg]:size-5 [&_svg]:stroke-[3px]',
  {
    variants: {
      variant: {
        primary:
          'bg-neo-accent text-black shadow-neo-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo-hover',
        secondary:
          'bg-neo-secondary text-black shadow-neo-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo-hover',
        muted:
          'bg-neo-muted text-black shadow-neo-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo-hover',
        outline:
          'bg-white text-black shadow-neo-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo-hover',
        dark: 'bg-black text-white shadow-neo-accent-sm hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-neo-hover',
        danger:
          'bg-black text-neo-accent shadow-neo-accent-sm hover:-translate-x-0.5 hover:-translate-y-0.5',
        ghost:
          'border-2 border-transparent bg-transparent shadow-none hover:border-black active:translate-x-0 active:translate-y-0'
      },
      size: {
        sm: 'h-11 px-4 text-xs',
        md: 'h-12 px-6 text-sm',
        lg: 'h-14 px-8 text-base',
        icon: 'size-12 p-0'
      }
    },
    defaultVariants: { variant: 'primary', size: 'md' }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element instead of a `<button>` (Radix Slot). */
  asChild?: boolean;
  /** Show a spinner and set `aria-busy`. */
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild = false, loading = false, children, ...props },
  ref
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      className={cn(buttonVariants({ variant, size }), className)}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </Comp>
  );
});

export { buttonVariants };
