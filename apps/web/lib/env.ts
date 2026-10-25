/**
 * @file apps/web/lib/env.ts
 * Environment for the web app, validated with zod at import (§12.3). Server-only:
 * it reads unvalidated process.env, which must never reach a client bundle.
 */
import 'server-only';
import { z } from 'zod';

const raw = {
  DATABASE_URL: process.env.DATABASE_URL,
  TOKEN_ENCRYPTION_KEY: process.env.TOKEN_ENCRYPTION_KEY,
  MAX_DATABASES_PER_WORKSPACE: process.env.MAX_DATABASES_PER_WORKSPACE,
  CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
};

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .min(1, 'TOKEN_ENCRYPTION_KEY is required (pnpm gen:enc-key)'),
  MAX_DATABASES_PER_WORKSPACE: z.coerce.number().int().positive().default(25),
  CLERK_SECRET_KEY: z.string().optional()
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment for @downstash/web:\n${details}`);
  }
  return parsed.data;
}

export const env: Env = load();

/** Client-safe values: no secret ever passes through here. */
export const publicEnv = {
  gatewayUrl: process.env.NEXT_PUBLIC_GATEWAY_URL ?? 'http://127.0.0.1:8787',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
  storageRegionLabel: process.env.NEXT_PUBLIC_STORAGE_REGION_LABEL ?? 'Supabase',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
} as const;
