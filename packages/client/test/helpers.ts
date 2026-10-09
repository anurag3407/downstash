/**
 * @file packages/client/test/helpers.ts
 * Shared test helpers for mocked-fetch transport tests.
 */
import { vi } from 'vitest';
import type { DownstashConfig } from '../src/types.ts';

export const URL_ = 'https://gw.example.dev';
export const SB = 'https://proj.supabase.co';
export const enc = (s: string): string => btoa(s);

export interface MockedResponse {
  status: number;
  body: unknown;
}

export function makeFetch(responses: MockedResponse[]) {
  let i = 0;
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return {
      status: r.status,
      ok: r.status >= 200 && r.status < 300,
      text: async () => (typeof r.body === 'string' ? r.body : JSON.stringify(r.body))
    } as unknown as Response;
  });
  return { fn, calls };
}

export const baseConfig = (over: Partial<DownstashConfig> = {}): DownstashConfig => ({
  url: URL_,
  token: 'dsk_' + 'a'.repeat(43),
  ...over
});

let now = 1_000_000;
export const clock = {
  reset(): void {
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  },
  advance(ms: number): void {
    now += ms;
  },
  restore(): void {
    vi.restoreAllMocks();
  }
};
