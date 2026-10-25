/**
 * @file apps/web/components/ui/nav-tabs.tsx
 * NavTabs (§11.4): links, so this is a server component. The active link is
 * marked `aria-current="page"` rather than only by colour.
 */
import Link from 'next/link';
import { cn } from '@/lib/utils.ts';

export interface NavTabItem {
  label: string;
  href: string;
}

export interface NavTabsProps {
  items: readonly NavTabItem[];
  /** `href` of the active tab. */
  active: string;
  className?: string;
}

export function NavTabs({ items, active, className }: NavTabsProps) {
  return (
    <nav
      aria-label="Database sections"
      className={cn('flex gap-2 overflow-x-auto border-b-4 border-black', className)}
    >
      {items.map((item) => {
        const isActive = item.href === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              '-mb-1 flex h-12 shrink-0 items-center border-4 border-b-4 border-black px-5 font-black uppercase tracking-tight transition-transform duration-100',
              isActive
                ? 'bg-neo-accent'
                : 'translate-y-1 bg-white hover:translate-y-0 hover:bg-neo-secondary'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
