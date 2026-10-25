/**
 * @file apps/web/components/ui/label.tsx
 * Label (§11.4): Radix Label with the uppercase-widest type scale.
 */
'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '@/lib/utils.ts';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(function Label({ className, ...props }, ref) {
  return (
    <LabelPrimitive.Root
      ref={ref}
      className={cn(
        'text-xs font-black uppercase tracking-widest text-black',
        className
      )}
      {...props}
    />
  );
});
