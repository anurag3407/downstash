/**
 * @file apps/web/components/ui/card.tsx
 * Card family (§11.4): a bordered surface with a toned header. `interactive`
 * adds the lift-on-hover for clickable cards.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils.ts';

const cardVariants = cva('rounded-none border-4 border-black bg-white shadow-neo-md', {
  variants: {
    interactive: {
      true: 'transition-[transform,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:shadow-neo-lg',
      false: ''
    }
  },
  defaultVariants: { interactive: false }
});

const headerTones = cva(
  'flex items-center justify-between gap-4 border-b-4 border-black px-6 py-4',
  {
    variants: {
      tone: {
        muted: 'bg-neo-muted text-black',
        secondary: 'bg-neo-secondary text-black',
        accent: 'bg-neo-accent text-black',
        black: 'bg-black text-white',
        white: 'bg-white text-black'
      }
    },
    defaultVariants: { tone: 'muted' }
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, interactive, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(cardVariants({ interactive }), className)}
      {...props}
    />
  );
});

export interface CardHeaderProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof headerTones> {}

export function CardHeader({ className, tone, ...props }: CardHeaderProps) {
  return <div className={cn(headerTones({ tone }), className)} {...props} />;
}

export function CardTitle({
  className,
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={cn(
        'text-xl md:text-2xl font-black uppercase tracking-tight',
        className
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-6', className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex items-center gap-4 border-t-4 border-black px-6 py-4',
        className
      )}
      {...props}
    />
  );
}

export { cardVariants, headerTones };
