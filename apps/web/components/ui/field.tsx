/**
 * @file apps/web/components/ui/field.tsx
 * Field (§11.4): label + control + hint + error, wiring `aria-describedby` and
 * `aria-invalid` so a screen reader hears the hint and the reason.
 */
'use client';

import * as React from 'react';
import { Label } from './label.tsx';
import { cn } from '@/lib/utils.ts';

export interface FieldProps {
  /** Associates the label with the control; must match the control's id. */
  id: string;
  label: string;
  hint?: string;
  /** Rendered in a red box with `role="alert"`. */
  error?: string;
  children: React.ReactNode;
  className?: string;
}

export function Field({ id, label, hint, error, children, className }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id,
            'aria-describedby': describedBy,
            'aria-invalid': error ? true : undefined
          })
        : children}
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="inline-block border-2 border-black bg-neo-accent px-2 py-0.5 text-xs font-black uppercase"
        >
          {error}
        </p>
      ) : null}
      {hint ? (
        <p id={hintId} className="text-sm font-medium">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
