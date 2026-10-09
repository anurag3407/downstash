/**
 * @file apps/gateway/src/env.ts
 * Env interface + config parsing with defaults and validation.
 */
export interface Env {
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  DOWNSTASH_VERSION?: string;
  ALLOWED_ORIGINS?: string;
  MAX_REQUEST_BYTES?: string | number;
  MAX_PIPELINE_COMMANDS?: string | number;
  AUTH_CACHE_TTL_MS?: string | number;
  NEGATIVE_AUTH_CACHE_TTL_MS?: string | number;
  RPC_TIMEOUT_MS?: string | number;
}

export interface GatewayConfig {
  version: string;
  supabaseUrl: string;
  supabaseKey: string;
  allowedOrigins: string;
  maxRequestBytes: number;
  maxPipelineCommands: number;
  authCacheTtlMs: number;
  negativeAuthCacheTtlMs: number;
  rpcTimeoutMs: number;
}

function num(v: string | number | undefined, def: number): number {
  if (v === undefined) return def;
  const n = typeof v === 'number' ? v : Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

/** Parse and validate env into a config. Throws if SUPABASE_URL is missing. */
export function readConfig(env: Env): GatewayConfig {
  if (!env.SUPABASE_URL || !/^https?:\/\//.test(env.SUPABASE_URL)) {
    throw new Error('SUPABASE_URL is required and must be an http(s) URL');
  }
  if (!env.SUPABASE_SECRET_KEY) {
    throw new Error('SUPABASE_SECRET_KEY is required');
  }
  return {
    version: env.DOWNSTASH_VERSION ?? '1.0.0',
    supabaseUrl: env.SUPABASE_URL.replace(/\/+$/, ''),
    supabaseKey: env.SUPABASE_SECRET_KEY,
    allowedOrigins: env.ALLOWED_ORIGINS ?? '*',
    maxRequestBytes: num(env.MAX_REQUEST_BYTES, 1048576),
    maxPipelineCommands: num(env.MAX_PIPELINE_COMMANDS, 1000),
    authCacheTtlMs: num(env.AUTH_CACHE_TTL_MS, 60000),
    negativeAuthCacheTtlMs: num(env.NEGATIVE_AUTH_CACHE_TTL_MS, 30000),
    rpcTimeoutMs: num(env.RPC_TIMEOUT_MS, 8000)
  };
}
