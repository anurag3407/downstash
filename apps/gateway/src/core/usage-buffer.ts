/**
 * @file apps/gateway/src/core/usage-buffer.ts
 * Per-isolate buffer of approximate usage counters, piggybacked on the next
 * DB call for the same database (§9.9). Counts are best-effort.
 */
export interface UsageDelta {
  l1Hits: number;
  bytesOut: number;
}

export class UsageBuffer {
  private readonly buf = new Map<string, UsageDelta>();

  private slot(dbId: string): UsageDelta {
    let s = this.buf.get(dbId);
    if (!s) {
      s = { l1Hits: 0, bytesOut: 0 };
      this.buf.set(dbId, s);
    }
    return s;
  }

  addL1Hit(dbId: string): void {
    this.slot(dbId).l1Hits += 1;
  }

  addBytesOut(dbId: string, bytes: number): void {
    this.slot(dbId).bytesOut += bytes;
  }

  /** Return and clear the buffered counts for a database. */
  take(dbId: string): UsageDelta {
    const s = this.buf.get(dbId) ?? { l1Hits: 0, bytesOut: 0 };
    this.buf.delete(dbId);
    return s;
  }
}
