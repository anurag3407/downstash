/**
 * @file apps/web/next.config.ts
 * Next.js 15 App Router config. The protocol package is consumed as TypeScript
 * source, so it has to be transpiled.
 */
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Desktop/server only; the design system is light-only (§1.2).
  reactStrictMode: true,
  transpilePackages: ['@downstash/protocol'],
  typedRoutes: true,
  // Keep the bundle honest about what actually reached the browser.
  productionBrowserSourceMaps: false
};

export default nextConfig;
