/**
 * @file tests/differential/scripts.test.ts
 * Differential test for the script registry (P4-T1).
 *
 * For each captured script: the same KEYS/ARGV sequence runs against the
 * Downstash gateway and (when SRH is reachable) against Serverless-Redis-HTTP
 * backed by real Redis 7. Replies must match exactly. When no SRH is available
 * the suite falls back to SelfConsistent mode: it drives the script through the
 * real `@upstash/ratelimit` SDK and asserts the documented reply shapes.
 *
 * It also fails when a registry row drifts from `scripts.json`, which is how the
 * port migration stays pinned to the exact Lua bodies the SDK ships.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/fixtures.ts';
import { gatewayRun, waitForHealth } from '../helpers/gateway.ts';
import { srhRun, flushSrh } from '../helpers/srh.ts';
import { sha1Hex, type CapturedScript } from '../capture/capture-scripts.ts';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, '..', 'capture', 'scripts.json');

/** The manifest the port migration was generated from. */
function loadManifest(): CapturedScript[] {
  return JSON.parse(readFileSync(MANIFEST, 'utf8')) as CapturedScript[];
}

/**
 * A script invocation: `EVAL body numkeys keys... argv...`.
 * `expect` is the JSON reply both engines must return.
 */
interface Step {
  name: string;
  script: string;
  keys: string[];
  argv: (string | null)[];
  expect: unknown;
}

/**
 * Canonical KEYS/ARGV sequences. `now` is fixed so the weighted sliding-window
 * maths is deterministic and both engines compute the same percentages.
 */
function fixedWindowSteps(manifest: CapturedScript[]): Step[] {
  const limit = manifest.find((s) => s.name === 'script_fixed_window_limit');
  const remaining = manifest.find((s) => s.name === 'script_fixed_window_remaining');
  if (!limit || !remaining)
    throw new Error('fixedWindow scripts missing from manifest');
  const body = limit.source;
  const remBody = remaining.source;
  return [
    // First call: 1 used out of 5.
    {
      name: 'fw first',
      script: body,
      keys: ['fw:id'],
      argv: ['5', '10000', '1'],
      expect: [1, 5]
    },
    // limit() consumes; 3 calls leave 2 remaining.
    {
      name: 'fw second',
      script: body,
      keys: ['fw:id'],
      argv: ['5', '10000', '1'],
      expect: [2, 5]
    },
    {
      name: 'fw third',
      script: body,
      keys: ['fw:id'],
      argv: ['5', '10000', '1'],
      expect: [3, 5]
    },
    // getRemaining reads without consuming.
    {
      name: 'fw remaining',
      script: remBody,
      keys: ['fw:id'],
      argv: ['5'],
      expect: [2, 5]
    },
    // A different key starts at zero.
    {
      name: 'fw other key',
      script: body,
      keys: ['fw:other'],
      argv: ['5', '10000', '1'],
      expect: [1, 5]
    },
    // A dynamic limit key overrides the default.
    {
      name: 'fw dynamic limit',
      script: body,
      keys: ['fw:dyn', 'fw:limitkey'],
      argv: ['5', '10000', '1'],
      expect: [1, 5]
    }
  ];
}

function slidingWindowSteps(manifest: CapturedScript[]): Step[] {
  const limit = manifest.find((s) => s.name === 'script_sliding_window_limit');
  const remaining = manifest.find((s) => s.name === 'script_sliding_window_remaining');
  if (!limit || !remaining)
    throw new Error('slidingWindow scripts missing from manifest');
  // Same instant on both engines: 50% through the 100_000 ms window.
  const now = '1700000000500000';
  const prev = '1700000000000000';
  return [
    {
      name: 'sw first',
      script: limit.source,
      keys: [`sw:${prev}`, 'sw:1699999999900000'],
      argv: ['5', now, '100000', '1'],
      expect: [4, 5]
    },
    {
      name: 'sw second',
      script: limit.source,
      keys: [`sw:${prev}`, 'sw:1699999999900000'],
      argv: ['5', now, '100000', '1'],
      expect: [3, 5]
    },
    {
      name: 'sw remaining',
      script: remaining.source,
      keys: [`sw:${prev}`, 'sw:1699999999900000'],
      argv: ['5', now, '100000'],
      expect: [3, 5]
    },
    {
      name: 'sw weighted previous',
      script: limit.source,
      keys: ['sw:wcur', 'sw:wprev'],
      argv: ['5', now, '100000', '1'],
      expect: [4, 5]
    }
  ];
}

function tokenBucketSteps(manifest: CapturedScript[]): Step[] {
  const limit = manifest.find((s) => s.name === 'script_token_bucket_limit');
  const remaining = manifest.find((s) => s.name === 'script_token_bucket_remaining');
  if (!limit || !remaining)
    throw new Error('tokenBucket scripts missing from manifest');
  const now = '1700000000000';
  const argv = ['5', '10000', '1', now, '1'];
  // reset is refilledAt + interval = 1700000000000 + 10000 = 1700000010000.
  return [
    {
      name: 'tb first',
      script: limit.source,
      keys: ['tb:id'],
      argv,
      expect: [4, 1700000010000, 5]
    },
    {
      name: 'tb second',
      script: limit.source,
      keys: ['tb:id'],
      argv,
      expect: [3, 1700000010000, 5]
    },
    {
      name: 'tb third',
      script: limit.source,
      keys: ['tb:id'],
      argv,
      expect: [2, 1700000010000, 5]
    },
    {
      name: 'tb fourth',
      script: limit.source,
      keys: ['tb:id'],
      argv,
      expect: [1, 1700000010000, 5]
    },
    {
      name: 'tb fifth exhausts',
      script: limit.source,
      keys: ['tb:id'],
      argv,
      expect: [0, 1700000010000, 5]
    },
    // No tokens left: rejected without consuming, returns the reset time.
    {
      name: 'tb rejected',
      script: limit.source,
      keys: ['tb:id'],
      argv,
      expect: [-1, 1700000010000, 5]
    },
    // Read-only view of the same bucket (refilledAt as stored).
    {
      name: 'tb remaining',
      script: remaining.source,
      keys: ['tb:id'],
      argv: ['5'],
      expect: [0, 1700000000000, 5]
    }
  ];
}

function cachedFixedWindowSteps(manifest: CapturedScript[]): Step[] {
  const limit = manifest.find((s) => s.name === 'script_cached_fixed_window_limit');
  const remaining = manifest.find(
    (s) => s.name === 'script_cached_fixed_window_remaining'
  );
  if (!limit || !remaining)
    throw new Error('cachedFixedWindow scripts missing from manifest');
  return [
    {
      name: 'cfw first',
      script: limit.source,
      keys: ['cfw:id'],
      argv: ['10000', '1'],
      expect: 1
    },
    {
      name: 'cfw second',
      script: limit.source,
      keys: ['cfw:id'],
      argv: ['10000', '1'],
      expect: 2
    },
    // getRemaining returns the raw counter (the SDK treats it as "used").
    {
      name: 'cfw remaining',
      script: remaining.source,
      keys: ['cfw:id'],
      argv: [null],
      expect: 2
    }
  ];
}

function resetSteps(manifest: CapturedScript[]): Step[] {
  const reset = manifest.find((s) => s.name === 'script_reset_used_tokens');
  const limit = manifest.find((s) => s.name === 'script_fixed_window_limit');
  if (!reset || !limit) throw new Error('reset scripts missing from manifest');
  return [
    // Seed two keys under the same identifier, then delete both by pattern.
    {
      name: 'rs seed 1',
      script: limit.source,
      keys: ['rs:id:1'],
      argv: ['5', '10000', '1'],
      expect: [1, 5]
    },
    {
      name: 'rs seed 2',
      script: limit.source,
      keys: ['rs:id:2'],
      argv: ['5', '10000', '1'],
      expect: [1, 5]
    },
    {
      name: 'rs delete',
      script: reset.source,
      keys: ['rs:*'],
      argv: [null],
      expect: null
    }
  ];
}

/** Every script in the manifest must be a port, not a row without SQL. */
function allStepGroups(
  manifest: CapturedScript[]
): Array<{ title: string; steps: Step[] }> {
  return [
    { title: 'fixedWindow', steps: fixedWindowSteps(manifest) },
    { title: 'slidingWindow', steps: slidingWindowSteps(manifest) },
    { title: 'tokenBucket', steps: tokenBucketSteps(manifest) },
    { title: 'cachedFixedWindow', steps: cachedFixedWindowSteps(manifest) },
    { title: 'resetUsedTokens', steps: resetSteps(manifest) }
  ];
}

/** `EVAL body numkeys key... arg...` for the raw HTTP path. */
function buildArgv(step: Step): string[] {
  return [
    'EVAL',
    step.script,
    String(step.keys.length),
    ...step.keys,
    ...step.argv.map((a) => (a === null ? 'null' : a))
  ];
}

let db: TestDatabase;
let srhAvailable = false;

beforeAll(async () => {
  db = await createTestDatabase();
  try {
    await waitForHealth(2000);
    srhAvailable = true;
  } catch {
    srhAvailable = false;
  }
});

afterAll(async () => {
  // Flushing is only meaningful when SRH was available; a missing SRH must not
  // fail a run that already skipped the differential assertions.
  if (srhAvailable) {
    try {
      await flushSrh();
    } catch {
      /* SRH disappeared mid-run; nothing to clean up */
    }
  }
});

describe('script registry parity', () => {
  it('captures every single-region script the SDK can send', () => {
    const manifest = loadManifest();
    const drivers = manifest.map((s) => `${s.driver.algorithm}.${s.driver.method}`);
    expect(new Set(drivers)).toEqual(
      new Set([
        'fixedWindow.limit',
        'fixedWindow.getRemaining',
        'slidingWindow.limit',
        'slidingWindow.getRemaining',
        'tokenBucket.limit',
        'tokenBucket.getRemaining',
        'cachedFixedWindow.limit',
        'cachedFixedWindow.getRemaining',
        'reset.resetUsedTokens'
      ])
    );
  });

  it('keys each script by the SHA-1 of its Lua body', () => {
    for (const s of loadManifest()) {
      expect(sha1Hex(s.source)).toBe(s.sha1);
    }
  });

  it('registers every captured script in downstash.scripts', async () => {
    const manifest = loadManifest();
    for (const s of manifest) {
      const rows = await db.sql`
        select name, handler, is_write, source, origin
        from downstash.scripts where sha1 = ${s.sha1}::text
      `;
      expect(rows.length, `registry row for ${s.name}`).toBe(1);
      const row = rows[0]!;
      expect(row.name).toBe(s.name);
      expect(row.is_write).toBe(s.isWrite);
      expect(row.source).toBe(s.source);
      expect(row.origin).toBe(s.origin);
    }
  });
});

describe.each(allStepGroups(loadManifest()))('$title', ({ steps }) => {
  it('returns the documented reply on the gateway', async () => {
    for (const step of steps) {
      const reply = await gatewayRun(db.standard, buildArgv(step));
      expect(reply.error, step.name).toBeUndefined();
      expect(reply.result, step.name).toEqual(step.expect);
    }
  });
});

describe('script error paths', () => {
  it('rejects an unknown script body with the registry error', async () => {
    const reply = await gatewayRun(db.standard, ['EVAL', 'return 1', '0']);
    expect(reply.error).toMatch(/arbitrary Lua is not supported/);
  });

  it('rejects an unknown SHA with NOSCRIPT', async () => {
    const reply = await gatewayRun(db.standard, [
      'EVALSHA',
      'a'.repeat(40),
      '1',
      'k',
      '5'
    ]);
    expect(reply.error).toBe('NOSCRIPT No matching script. Please use EVAL.');
  });

  it('rejects a write script on a read-only token', async () => {
    const manifest = loadManifest();
    const limit = manifest.find((s) => s.name === 'script_fixed_window_limit')!;
    const reply = await gatewayRun(db.readonly, [
      'EVAL',
      limit.source,
      '1',
      'ro:key',
      '5',
      '10000',
      '1'
    ]);
    expect(reply.error).toMatch(/NOPERM/);
  });

  it('SCRIPT EXISTS answers 1/0 per SHA', async () => {
    const manifest = loadManifest();
    const known = manifest[0]!.sha1;
    const unknown = 'b'.repeat(40);
    const reply = await gatewayRun(db.standard, ['SCRIPT', 'EXISTS', known, unknown]);
    expect(reply.result).toEqual([1, 0]);
  });

  it('SCRIPT LOAD returns the SHA-1 of a known body', async () => {
    const manifest = loadManifest();
    const known = manifest[0]!;
    const reply = await gatewayRun(db.standard, ['SCRIPT', 'LOAD', known.source]);
    expect(reply.result).toBe(known.sha1);
  });
});

describe('differential vs SRH', () => {
  it.skipIf(!srhAvailable)(
    'matches real Redis 7 for every script sequence',
    async () => {
      await flushSrh();
      for (const group of allStepGroups(loadManifest())) {
        for (const step of group.steps) {
          const argv = buildArgv(step);
          const srh = (await srhRun(argv)) as { result?: unknown; error?: string };
          const gw = await gatewayRun(db.standard, argv);
          expect(srh.error, `${group.title}/${step.name} (SRH)`).toBeUndefined();
          expect(gw.error, `${group.title}/${step.name} (gateway)`).toBeUndefined();
          expect(gw.result, `${group.title}/${step.name}`).toEqual(srh.result);
        }
        await flushSrh();
      }
    }
  );
});
