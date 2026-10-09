/**
 * @file packages/client/src/types.ts
 * Public client types.
 */
import type { ResultEnvelope, RedisValue } from '@downstash/protocol';

export type { ResultEnvelope, RedisValue };

export interface DownstashFallbackConfig {
  supabaseUrl: string; // https://<ref>.supabase.co
  supabaseKey: string; // publishable/anon key is enough (token checked in SQL)
}

export interface DownstashConfig {
  url: string; // gateway URL
  token: string; // dsk_... or dsr_...
  fallback?: DownstashFallbackConfig;
  timeoutMs?: number; // default 5000, per attempt
  failoverOnTimeout?: boolean; // default true
  stickyFailoverMs?: number; // default 60000
  onFailover?: (event: FailoverEvent) => void;
  fetch?: typeof fetch;
}

export interface FailoverEvent {
  reason: 'rate_limited' | 'server_error' | 'network_error' | 'timeout';
  status?: number | undefined;
  at: number; // epoch ms
}

export type Command = Array<string | number | boolean>;

/** The result of a gateway/RPC call, before decoding. */
export type RawEnvelopeOrArray = ResultEnvelope | ResultEnvelope[];
