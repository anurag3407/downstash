/**
 * @file apps/web/components/ui/switch.tsx
 * Switch (§11.4): a thick-bordered track with a black thumb that slides on
 * check. Radix handles the keyboard behaviour and the `data-state`.
 */
'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import { cn } from '@/lib/utils.ts';

export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(function Switch({ className, ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        'inline-flex h-8 w-14 shrink-0 items-center rounded-none border-4 border-black bg-white p-0.5 transition-colors duration-100 data-[state=checked]:bg-neo-accent',
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block size-5 bg-black transition-transform duration-100 ease-linear data-[state=checked]:translate-x-6'
        )}
      />
    </SwitchPrimitive.Root>
  );
});
