/**
 * @file packages/client/src/downstash.ts
 * The public `Downstash` client: single/pipeline/multi plus thin conveniences.
 */
import type { ResultEnvelope, RedisValue } from '@downstash/protocol';
import { normalizeCommand, normalizePipeline } from '@downstash/protocol';
import { DownstashError } from './error.ts';
import { Transport } from './transport.ts';
import type { Command, DownstashConfig, RawEnvelopeOrArray } from './types.ts';

function isEnvelopeArray(x: RawEnvelopeOrArray): x is ResultEnvelope[] {
  return Array.isArray(x);
}

export class Downstash {
  private readonly transport: Transport;

  constructor(config: DownstashConfig) {
    this.transport = new Transport({ config });
  }

  /**
   * Run a single command and return its result. Throws `DownstashError` when
   * the reply is an error envelope.
   *
   * The gateway replies in plain JSON because this client never sends
   * `Upstash-Encoding: base64` (§10.2), so there is nothing to decode.
   */
  async execute<T = unknown>(command: Command): Promise<T> {
    const argv = normalizeCommand(command);
    const raw = await this.transport.run('single', argv);
    if (isEnvelopeArray(raw)) {
      // Defensive: gateway should not return an array for single.
      const first = raw[0];
      if (first && 'error' in first)
        throw new DownstashError(first.error, { command: argv[0], source: 'gateway' });
      return (first?.result ?? null) as T;
    }
    if (raw && 'error' in raw) {
      throw new DownstashError(raw.error, { command: argv[0], source: 'gateway' });
    }
    return raw.result as T;
  }

  /** Run a pipeline atomically and return every envelope, in order. */
  async pipeline(commands: Command[]): Promise<ResultEnvelope[]> {
    const argvs = normalizePipeline(commands, 1000);
    const raw = await this.transport.run('pipeline', undefined, argvs);
    return isEnvelopeArray(raw) ? raw : [];
  }

  /** Run a MULTI transaction. Identical to pipeline in Downstash. */
  async multi(commands: Command[]): Promise<ResultEnvelope[]> {
    return this.pipeline(commands);
  }

  async ping(): Promise<string> {
    return this.execute<string>(['PING']);
  }

  async get<T = string>(key: string): Promise<T | null> {
    const v = await this.execute<RedisValue>(['GET', key]);
    return (v ?? null) as T | null;
  }

  async set(
    key: string,
    value: string,
    opts?: { ex?: number; px?: number; nx?: boolean; xx?: boolean }
  ): Promise<'OK' | null> {
    const cmd: Command = ['SET', key, value];
    if (opts?.nx) cmd.push('NX');
    if (opts?.xx) cmd.push('XX');
    if (opts?.ex !== undefined) cmd.push('EX', opts.ex);
    if (opts?.px !== undefined) cmd.push('PX', opts.px);
    return this.execute<'OK' | null>(cmd);
  }

  async incr(key: string): Promise<number> {
    return this.execute<number>(['INCR', key]);
  }

  async incrby(key: string, delta: number): Promise<number> {
    return this.execute<number>(['INCRBY', key, delta]);
  }

  async del(...keys: string[]): Promise<number> {
    return this.execute<number>(['DEL', ...keys]);
  }

  async expire(key: string, seconds: number): Promise<0 | 1> {
    return this.execute<0 | 1>(['EXPIRE', key, seconds]);
  }

  async ttl(key: string): Promise<number> {
    return this.execute<number>(['TTL', key]);
  }
}
