/**
 * @file apps/gateway/test/helpers.ts
 * Fake storage + app factory for gateway tests. No network, no real clock.
 */
import type {
  PingResponse,
  RunFailure,
  RunRequest,
  RunResponse,
  Storage
} from '../src/storage/storage.ts';
import { createApp, type App } from '../src/app.ts';
import { readConfig, type Env, type GatewayConfig } from '../src/env.ts';

export function okRun(
  envelopes: unknown,
  principal?: { dbId: string; readonly: boolean; l1TtlMs: number }
): RunResponse {
  return principal
    ? { ok: true, status: 200, envelopes, principal }
    : { ok: true, status: 200, envelopes };
}
export function failRun(status: number, error?: string): RunFailure {
  return error !== undefined ? { ok: false, status, error } : { ok: false, status };
}

export class FakeStorage implements Storage {
  calls: RunRequest[] = [];
  pings = 0;
  private handler: (req: RunRequest) => Promise<RunResponse | RunFailure>;
  pingOk = true;

  constructor(
    handler?: (
      req: RunRequest
    ) => Promise<RunResponse | RunFailure> | RunResponse | RunFailure
  ) {
    this.handler = (req) =>
      Promise.resolve(
        handler
          ? handler(req)
          : req.mode === 'single'
            ? okRun({ result: 'PONG' })
            : okRun([{ result: 'PONG' }])
      );
  }

  async run(req: RunRequest): Promise<RunResponse | RunFailure> {
    this.calls.push(req);
    return this.handler(req);
  }
  async ping(): Promise<PingResponse> {
    this.pings += 1;
    return { ok: this.pingOk, status: this.pingOk ? 200 : 503 };
  }
}

export const VALID = 'dsk_' + 'a'.repeat(43);
export const READONLY = 'dsr_' + 'b'.repeat(43);

let t = 1_000_000;
export function fakeClock() {
  return {
    now: () => t,
    advance(ms: number) {
      t += ms;
    }
  };
}

export function makeConfig(over: Partial<Env> = {}): GatewayConfig {
  return readConfig({
    SUPABASE_URL: 'https://proj.supabase.co',
    SUPABASE_SECRET_KEY: 'service-key',
    ...over
  }) as GatewayConfig;
}

export function makeApp(
  storage: Storage,
  over: Partial<Env> = {},
  now?: () => number
): App {
  const clock = now ?? (() => t);
  return createApp({
    storage,
    config: makeConfig(over),
    now: clock,
    logger: { info: () => {}, error: () => {} }
  });
}
