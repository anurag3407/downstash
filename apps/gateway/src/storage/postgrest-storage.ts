/**
 * @file apps/gateway/src/storage/postgrest-storage.ts
 * Calls the Supabase `downstash_gw_run` / `downstash_gw_ping` RPCs with retries
 * on serialization/deadlock codes and transient 5xx (§9.8).
 */
import {
  StorageUnavailableError,
  type PingResponse,
  type RunFailure,
  type RunRequest,
  type RunResponse,
  type Storage
} from './storage.ts';

const RETRY_CODES = new Set(['40P01', '40001']);
const RETRY_STATUSES = new Set([502, 503, 504]);

export class PostgrestStorage implements Storage {
  constructor(
    private readonly opts: {
      url: string;
      key: string;
      timeoutMs: number;
      fetch?: typeof fetch;
      sleep?: (ms: number) => Promise<void>;
    }
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      apikey: this.opts.key,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    };
    // Legacy JWT keys need Authorization; new sb_secret_* keys use apikey only.
    if (this.opts.key.startsWith('eyJ')) h.Authorization = `Bearer ${this.opts.key}`;
    return h;
  }

  async run(req: RunRequest): Promise<RunResponse | RunFailure> {
    const body = JSON.stringify({
      p_token_hash: req.tokenHash,
      p_mode: req.mode,
      p_commands: req.commands,
      p_l1_hits: req.l1Hits,
      p_bytes_in: req.bytesIn,
      p_bytes_out: req.bytesOut
    });

    let lastErr: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        await this.sleep(attempt === 1 ? 15 : 60);
      }
      let res: Response;
      try {
        res = await this.fetch(`${this.opts.url}/rest/v1/rpc/downstash_gw_run`, body);
      } catch (err) {
        lastErr = err;
        continue; // network/timeout → retry
      }
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        const parsed = text ? JSON.parse(text) : null;
        json = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
      } catch {
        json = null;
      }

      if (res.status >= 200 && res.status < 300) {
        // downstash_gw_run returns { ok, db, readonly, l1TtlMs, results }.
        const db = json?.db !== undefined && json.db !== null ? String(json.db) : '';
        const readonly = Boolean(json?.readonly);
        const l1TtlMs = Number(json?.l1TtlMs ?? 0);
        const principal =
          db !== '' ? { dbId: db, readonly, l1TtlMs } : undefined;
        const base: RunResponse = {
          ok: true,
          status: 200,
          envelopes: (json?.results ?? null) as unknown
        };
        return principal ? { ...base, principal } : base;
      }

      // Auth failure: no retry.
      if (res.status === 401) {
        return { ok: false, status: 401, error: 'Unauthorized' };
      }

      // Retryable: serialization/deadlock code, or transient 5xx.
      const code = json ? String(json.code ?? '') : '';
      if (RETRY_CODES.has(code) || RETRY_STATUSES.has(res.status)) {
        lastErr = new StorageUnavailableError(`retryable (${res.status} ${code})`);
        continue;
      }

      // Non-retryable 4xx → treat as an error reply, not unavailable.
      if (res.status >= 400 && res.status < 500) {
        const errText = typeof json?.error === 'string' ? json.error : 'ERR Downstash: bad request';
        return { ok: false, status: res.status, error: errText };
      }

      // Other 5xx.
      lastErr = new StorageUnavailableError(`server error (${res.status})`);
    }
    throw new StorageUnavailableError(
      lastErr instanceof StorageUnavailableError ? lastErr.message : 'network error'
    );
  }

  async ping(): Promise<PingResponse> {
    try {
      const res = await this.fetch(`${this.opts.url}/rest/v1/rpc/downstash_gw_ping`, '{}');
      return { ok: res.ok, status: res.status };
    } catch {
      return { ok: false, status: 503 };
    }
  }

  private async fetch(url: string, body: string): Promise<Response> {
    const f = this.opts.fetch ?? globalThis.fetch;
    const res = await f(url, {
      method: 'POST',
      headers: this.headers(),
      body,
      signal: AbortSignal.timeout(this.opts.timeoutMs)
    });
    return res;
  }

  private sleep(ms: number): Promise<void> {
    return this.opts.sleep
      ? this.opts.sleep(ms)
      : new Promise((r) => setTimeout(r, ms));
  }
}
