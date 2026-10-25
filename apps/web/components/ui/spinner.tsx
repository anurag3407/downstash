/**
 * @file apps/web/components/ui/spinner.tsx
 * Spinner (§11.4): a Star icon, `role="status"` and an sr-only label, so screen
 * readers hear "Loading" rather than nothing.
 */
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils.ts';

export type SpinnerProps = React.HTMLAttributes<HTMLSpanElement>;

export function Spinner({ className }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex', className)}>
      <Star aria-hidden className="size-5 animate-spin fill-black stroke-[3px]" />
      <span className="sr-only">Loading</span>
    </span>
  );
}
