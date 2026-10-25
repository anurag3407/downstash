/**
 * @file apps/web/components/ui/input.tsx
 * Input (§11.4). Focus turns the field yellow with a hard shadow; `mono` adds
 * the Space Mono stack for keys and tokens.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.ts';

const inputVariants = cva(
  'h-14 w-full rounded-none border-4 border-black bg-white px-4 text-lg font-bold text-black placeholder:text-black/40 transition-[background-color,box-shadow] duration-100 focus-visible:bg-neo-secondary focus-visible:shadow-neo-sm focus-visible:outline-none focus-visible:ring-0 aria-[invalid=true]:shadow-neo-accent-sm disabled:opacity-60'
);

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  /** Render keys, tokens and ids in Space Mono. */
  mono?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, mono = false, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      className={cn(inputVariants(), mono && 'font-mono text-base', className)}
      {...props}
    />
  );
});

export { inputVariants };
