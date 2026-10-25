/**
 * @file apps/web/components/ui/accordion.tsx
 * Accordion (§11.4): bordered items, a trigger that turns accent when open, and
 * a Plus icon that rotates 45° into a cross.
 */
'use client';

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      className={cn('border-4 border-black bg-white shadow-neo-sm', className)}
      {...props}
    />
  );
});

export const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        className={cn(
          'flex w-full items-center justify-between px-6 py-5 text-left text-lg md:text-xl font-black uppercase transition-colors duration-100 hover:bg-neo-secondary data-[state=open]:bg-neo-accent',
          className
        )}
        {...props}
      >
        {children}
        <Plus
          aria-hidden
          className="size-6 shrink-0 stroke-[3px] transition-transform duration-200 [[data-state=open]_&]:rotate-45"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  );
});

export const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <AccordionPrimitive.Content
      ref={ref}
      className="overflow-hidden data-[state=closed]:animate-none"
      {...props}
    >
      <div
        className={cn(
          'border-t-4 border-black bg-neo-muted px-6 py-5 text-lg font-bold',
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Content>
  );
});
