/**
 * @file apps/web/components/ui/badge.tsx
 * Badge (§11.4): tones plus a `pill` shape. Used for data types, statuses and
 * eyebrows, always next to a text label — never colour alone.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.ts';

const badgeVariants = cva(
  'inline-flex items-center gap-1 border-2 border-black px-2.5 py-0.5 text-xs font-black uppercase tracking-widest',
  {
    variants: {
      tone: {
        accent: 'bg-neo-accent text-black',
        secondary: 'bg-neo-secondary text-black',
        muted: 'bg-neo-muted text-black',
        white: 'bg-white text-black',
        black: 'bg-black text-white'
      },
      shape: {
        square: 'rounded-none',
        pill: 'rounded-full'
      }
    },
    defaultVariants: { tone: 'white', shape: 'square' }
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, shape, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone, shape }), className)} {...props} />;
}

export { badgeVariants };

/** Redis type → badge tone (docs/design/tokens.md). */
export const TYPE_TONES = {
  STRING: 'secondary',
  HASH: 'muted',
  LIST: 'accent',
  SET: 'white',
  ZSET: 'black'
} as const;

export type RedisType = keyof typeof TYPE_TONES;

export interface TypeBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  type: RedisType;
}

/**
 * The one place a Redis type's colour is decided, so the colour and the label
 * can never disagree.
 */
export function TypeBadge({ type, className, ...props }: TypeBadgeProps) {
  return (
    <Badge
      tone={TYPE_TONES[type]}
      className={cn('shrink-0 font-mono', className)}
      {...props}
    >
      {type}
    </Badge>
  );
}
