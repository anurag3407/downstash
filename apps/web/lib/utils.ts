/**
 * @file apps/web/lib/utils.ts
 * `cn()` — clsx + tailwind-merge, so a later class wins over an earlier one.
 * Not server-only: components on both sides use it.
 */
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge class names, letting later Tailwind utilities win conflicts. */
export function cn(...inputs: ClassArray): string {
  return twMerge(clsx(inputs));
}

type ClassArray = ClassValue[];
