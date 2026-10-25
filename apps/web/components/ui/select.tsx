/**
 * @file apps/web/components/ui/select.tsx
 * Select (§11.4): an Input-shaped trigger with a heavy chevron, and bordered
 * content. The highlighted and checked items get the secondary and muted tones.
 */
'use client';

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(function SelectTrigger({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn(
        'flex h-14 w-full items-center justify-between rounded-none border-4 border-black bg-white px-4 text-lg font-bold text-black focus-visible:bg-neo-secondary focus-visible:shadow-neo-sm focus-visible:outline-none disabled:opacity-60',
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown aria-hidden className="size-5 stroke-[3px]" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
});

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(function SelectContent({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          'z-50 rounded-none border-4 border-black bg-white shadow-neo-md',
          className
        )}
        position="popper"
        {...props}
      >
        <SelectPrimitive.Viewport className="p-0">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(function SelectItem({ className, children, ...props }, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      className={cn(
        'cursor-pointer px-4 py-3 font-bold uppercase outline-none data-[highlighted]:bg-neo-secondary data-[state=checked]:bg-neo-muted',
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
});

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(function SelectLabel({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Label
      ref={ref}
      className={cn(
        'px-4 py-2 text-xs font-black uppercase tracking-widest',
        className
      )}
      {...props}
    />
  );
});
