/**
 * @file apps/web/components/ui/alert-dialog.tsx
 * AlertDialog (§11.4): the Dialog shape with an accent header, a `danger`
 * confirm, and an optional `confirmText` gate that requires typing an exact
 * string (a database name) before the confirm button enables.
 */
'use client';

import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils.ts';
import { Button } from './button.tsx';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
export const AlertDialogAction = AlertDialogPrimitive.Action;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;

export function AlertDialogContent({
  className,
  children,
  ...props
}: AlertDialogPrimitive.AlertDialogContentProps) {
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 bg-halftone" />
      <AlertDialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-none border-4 border-black bg-neo-canvas shadow-neo-xl data-[state=open]:animate-pop-in',
          className
        )}
        {...props}
      >
        {children}
      </AlertDialogPrimitive.Content>
    </AlertDialogPrimitive.Portal>
  );
}

export interface AlertDialogGateProps {
  title: string;
  description: string;
  /** When set, confirm is disabled until the user types exactly this string. */
  confirmText?: string;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel?: string;
  /** Slot for extra content, rendered above the footer. */
  children?: React.ReactNode;
}

/** A confirmation dialog with an optional type-to-confirm gate. */
export function AlertDialogGate({
  title,
  description,
  confirmText,
  confirmLabel,
  onConfirm,
  cancelLabel = 'Cancel',
  children
}: AlertDialogGateProps) {
  const [typed, setTyped] = React.useState('');
  const matches = confirmText === undefined || typed === confirmText;

  return (
    <AlertDialog>
      <AlertDialogPrimitive.Trigger asChild>{children}</AlertDialogPrimitive.Trigger>
      <AlertDialogContent>
        <div className="border-b-4 border-black bg-neo-accent px-6 py-4">
          <AlertDialogPrimitive.Title className="text-2xl font-black uppercase tracking-tight">
            {title}
          </AlertDialogPrimitive.Title>
        </div>
        <div className="space-y-4 p-6">
          <AlertDialogPrimitive.Description className="font-bold">
            {description}
          </AlertDialogPrimitive.Description>
          {confirmText !== undefined ? (
            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-widest">
                Type {confirmText} to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="h-12 w-full rounded-none border-4 border-black bg-white px-3 font-mono text-sm font-bold focus-visible:bg-neo-secondary focus-visible:shadow-neo-sm focus-visible:outline-none"
                autoComplete="off"
              />
            </label>
          ) : null}
        </div>
        <div className="flex flex-col-reverse gap-3 border-t-4 border-black px-6 py-4 sm:flex-row sm:justify-end">
          <AlertDialogCancel asChild>
            <Button variant="outline">{cancelLabel}</Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button variant="danger" disabled={!matches} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </AlertDialogAction>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
