/**
 * @file apps/web/components/ui/tabs.tsx
 * Tabs (§11.4): a bordered list whose active trigger is yellow and heavier.
 */
'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils.ts';

export const Tabs = TabsPrimitive.Root;
export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        'inline-flex flex-wrap border-4 border-black bg-white shadow-neo-sm',
        className
      )}
      {...props}
    />
  );
});

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'h-11 border-r-4 border-black px-4 text-sm font-bold uppercase transition-colors duration-100 last:border-r-0 hover:bg-neo-muted data-[state=active]:bg-neo-secondary data-[state=active]:font-black focus-visible:bg-neo-muted focus-visible:outline-none',
        className
      )}
      {...props}
    />
  );
});

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Content
      ref={ref}
      className={cn('mt-6 focus-visible:outline-none', className)}
      {...props}
    />
  );
});
