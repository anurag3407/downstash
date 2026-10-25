/**
 * @file apps/web/app/layout.tsx
 * Root layout: fonts, Clerk provider, the Toaster. The design system is
 * light-only, so there is no theme provider.
 * @see docs/web/routes.md
 */
import type { Metadata } from 'next';
import { Space_Grotesk, Space_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Toaster } from '@/components/ui/toaster';
import { clerkAppearance } from '@/lib/clerk-appearance';
import './globals.css';

// Space Grotesk tops out at 700 on Google Fonts; font-black (900) is
// synthesised from 700. That is accepted by the design brief.
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
  display: 'block'
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-space-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  title: 'Downstash — Serverless Redis for $0.00',
  description:
    'Self-hosted, Upstash-compatible serverless Redis and rate limiting on Cloudflare Workers + Supabase. Free forever.'
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <ClerkProvider appearance={clerkAppearance}>
      <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable}`}>
        <body>
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
