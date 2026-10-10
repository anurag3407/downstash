/**
 * @file apps/gateway/src/core/l1-cache.ts
 * Per-isolate read-through cache for cacheable, single commands (§9.7).
 * LRU via Map re-insertion; skips oversized values.
 */
import type { RedisValue } from '@downstash/protocol';

interface Entry {
  value: RedisValue;
  expiresAt: number;
}

export class L1Cache {
  private readonly map = new Map<string, Entry>();

  constructor(
    private readonly opts: {
      maxEntries: number;
      maxValueBytes: number;
      now: () => number;
    }
  ) {}

  /** Cache key: dbId + NUL + argv joined by NUL. Null bytes are banned in argv. */
  private key(dbId: string, argv: readonly string[]): string {
    return `${dbId}\u0000${[argv[0]?.toUpperCase() ?? '', ...argv.slice(1)].join('\u0000')}`;
  }

  get(dbId: string, argv: readonly string[]): RedisValue | undefined {
    const k = this.key(dbId, argv);
    const e = this.map.get(k);
    if (!e) return undefined;
    if (e.expiresAt <= this.opts.now()) {
      this.map.delete(k);
      return undefined;
    }
    // LRU: move to most-recently-used.
    this.map.delete(k);
    this.map.set(k, e);
    return e.value;
  }

  set(dbId: string, argv: readonly string[], value: RedisValue, ttlMs: number): void {
    if (ttlMs <= 0) return;
    let serialized: string;
    try {
      serialized = JSON.stringify(value) ?? '';
    } catch {
      return;
    }
    if (serialized.length > this.opts.maxValueBytes) return;

    const k = this.key(dbId, argv);
    this.map.delete(k);
    this.map.set(k, { value, expiresAt: this.opts.now() + ttlMs });
    while (this.map.size > this.opts.maxEntries) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }

  /** Drop all entries for a database (called after writes). */
  invalidateDb(dbId: string): void {
    const prefix = `${dbId}\u0000`;
    for (const k of this.map.keys()) {
      if (k.startsWith(prefix)) this.map.delete(k);
    }
  }

  get size(): number {
    return this.map.size;
  }
}
