/**
 * @file apps/web/components/ui/dialog.tsx
 * Dialog (§11.4): a halftoned scrim, a hard-shadowed canvas panel, a toned
 * header, and a close button pinned outside the panel's top-right corner.
 */
'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils.ts';
import { Button } from './button.tsx';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.DialogOverlayProps) {
  return (
    <DialogPrimitive.Overlay
      className={cn('fixed inset-0 z-50 bg-black/40 bg-halftone', className)}
      {...props}
    />
  );
}

export function DialogContent({
  className,
  children,
  ...props
}: DialogPrimitive.DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-none border-4 border-black bg-neo-canvas shadow-neo-xl data-[state=open]:animate-pop-in',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close asChild>
          <Button
            variant="outline"
            size="icon"
            aria-label="Close"
            className="absolute -right-4 -top-4 border-2"
          >
            <X aria-hidden />
          </Button>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('border-b-4 border-black bg-neo-secondary px-6 py-4', className)}
      {...props}
    />
  );
}

export function DialogTitle({ className, ...props }: DialogPrimitive.DialogTitleProps) {
  return (
    <DialogPrimitive.Title
      className={cn('text-2xl font-black uppercase tracking-tight', className)}
      {...props}
    />
  );
}

export function DialogDescription({
  className,
  ...props
}: DialogPrimitive.DialogDescriptionProps) {
  return (
    <DialogPrimitive.Description className={cn('font-bold', className)} {...props} />
  );
}

export function DialogBody({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('space-y-6 p-6', className)} {...props} />;
}

export function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex flex-col-reverse gap-3 border-t-4 border-black px-6 py-4 sm:flex-row sm:justify-end',
        className
      )}
      {...props}
    />
  );
}
