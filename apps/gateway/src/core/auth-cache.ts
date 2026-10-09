/**
 * @file apps/gateway/src/core/auth-cache.ts
 * Positive and negative auth caches with size caps (§9.3).
 */
export interface Principal {
  dbId: string;
  readonly: boolean;
  l1TtlMs: number;
  hash: string; // sha256 hex, for timing-safe re-confirmation
}

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class AuthCache {
  private readonly pos = new Map<string, Entry<Principal>>();
  private readonly neg = new Map<string, Entry<true>>();

  constructor(
    private readonly opts: {
      positiveTtlMs: number;
      negativeTtlMs: number;
      maxEntries: number;
      now: () => number;
    }
  ) {}

  getPositive(hash: string): Principal | undefined {
    const e = this.pos.get(hash);
    if (!e) return undefined;
    if (e.expiresAt <= this.opts.now()) {
      this.pos.delete(hash);
      return undefined;
    }
    // LRU
    this.pos.delete(hash);
    this.pos.set(hash, e);
    return e.value;
  }

  setPositive(hash: string, principal: Omit<Principal, 'hash'>): void {
    this.pos.delete(hash);
    this.pos.set(hash, {
      value: { ...principal, hash },
      expiresAt: this.opts.now() + this.opts.positiveTtlMs
    });
    this.cap(this.pos);
  }

  isNegative(hash: string): boolean {
    const e = this.neg.get(hash);
    if (!e) return false;
    if (e.expiresAt <= this.opts.now()) {
      this.neg.delete(hash);
      return false;
    }
    return true;
  }

  setNegative(hash: string): void {
    this.neg.delete(hash);
    this.neg.set(hash, { value: true, expiresAt: this.opts.now() + this.opts.negativeTtlMs });
    this.cap(this.neg);
    // A fresh negative result invalidates any stale positive entry.
    this.pos.delete(hash);
  }

  private cap<T>(m: Map<string, Entry<T>>): void {
    while (m.size > this.opts.maxEntries) {
      const oldest = m.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      m.delete(oldest);
    }
  }

  get positiveSize(): number {
    return this.pos.size;
  }
  get negativeSize(): number {
    return this.neg.size;
  }
}
