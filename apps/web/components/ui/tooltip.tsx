/**
 * @file apps/web/components/ui/tooltip.tsx
 * Tooltip (§11.4): black surface, white text, a heavy arrow. Wraps Radix so the
 * trigger keeps its own class list.
 */
'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils.ts';

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 4,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 border-2 border-black bg-black px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white',
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="fill-black" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  );
}
