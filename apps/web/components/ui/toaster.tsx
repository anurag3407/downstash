/**
 * @file apps/web/components/ui/toaster.tsx
 * Toaster (§11.4): sonner wrapper styled to the Neo-brutalism design tokens.
 */
'use client';

import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'border-4 border-black bg-neo-canvas p-4 font-mono text-sm font-bold shadow-neo-md flex items-center gap-3',
          title: 'font-black uppercase',
          description: 'text-xs font-bold',
          actionButton:
            'border-2 border-black bg-neo-accent px-2 py-1 font-bold shadow-neo-sm',
          cancelButton:
            'border-2 border-black bg-white px-2 py-1 font-bold shadow-neo-sm'
        }
      }}
    />
  );
}
