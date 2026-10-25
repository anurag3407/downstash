/**
 * @file apps/web/components/ui/dropdown-menu.tsx
 * DropdownMenu (§11.4): content styled as the Select, a solid `h-1` separator,
 * and a heavy `DropdownMenuTrigger` so a row action reads as one button.
 */
'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils.ts';

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

export const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        ref={ref}
        sideOffset={4}
        className={cn(
          'z-50 rounded-none border-4 border-black bg-white shadow-neo-md',
          className
        )}
        {...props}
      />
    </DropdownMenuPrimitive.Portal>
  );
});

export const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item>
>(function DropdownMenuItem({ className, ...props }, ref) {
  return (
    <DropdownMenuPrimitive.Item
      ref={ref}
      className={cn(
        'cursor-pointer px-4 py-3 font-bold uppercase outline-none data-[highlighted]:bg-neo-secondary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-60',
        className
      )}
      {...props}
    />
  );
});

export function DropdownMenuSeparator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="separator" className={cn('my-1 h-1 bg-black', className)} {...props} />
  );
}
