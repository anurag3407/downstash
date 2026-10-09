/**
 * @file apps/gateway/src/storage/storage.ts
 * The storage abstraction. The gateway talks to Postgres through this, so tests
 * inject a fake and never touch a real database.
 */
import type { RunMode } from '@downstash/protocol';

export interface RunRequest {
  tokenHash: string;
  mode: RunMode;
  commands: string[][];
  l1Hits: number;
  bytesIn: number;
  bytesOut: number;
}

export interface RunResponse {
  ok: true;
  status: 200;
  /** Single: one envelope. Pipeline/multi: one envelope per command. */
  envelopes: unknown;
  /** Principal learned from a successful call (for cache priming). */
  principal?: { dbId: string; readonly: boolean; l1TtlMs: number };
}

export interface RunFailure {
  ok: false;
  status: number;
  /** Redis-style error string for 401 etc. */
  error?: string;
}

export interface PingResponse {
  ok: boolean;
  status: number;
}

export class StorageUnavailableError extends Error {
  constructor(message = 'storage unavailable') {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

export interface Storage {
  run(req: RunRequest): Promise<RunResponse | RunFailure>;
  ping(): Promise<PingResponse>;
}
