/**
 * @file apps/web/components/ui/textarea.tsx
 * Textarea (§11.4): the Input classes with a mono body and a taller minimum.
 */
import * as React from 'react';
import { inputVariants } from './input.tsx';
import { cn } from '@/lib/utils.ts';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      className={cn(
        inputVariants(),
        'min-h-40 py-3 font-mono text-base leading-relaxed',
        className
      )}
      {...props}
    />
  );
});
