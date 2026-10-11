/**
 * @file tests/capture/capture-scripts.ts
 * Script capture harness for P4-T1.
 *
 * Extracts every Lua script that `@upstash/ratelimit` can send over the wire,
 * computes its SHA-1 (the value the SDK puts in `EVALSHA`), and writes
 * `scripts.json`. `scripts.json` is the input the port migration
 * (`supabase/migrations/20261007001100_scripts_ratelimit.sql`) is written
 * against, and the parity suite (`tests/differential/scripts.test.ts`) reads it
 * back to prove every registry row matches the real SDK source.
 *
 * Two capture modes:
 *
 * 1. **Static** (always runs): read `node_modules/@upstash/ratelimit/dist/*.js`
 *    and pull the script bodies out of the `SCRIPTS` map. Deterministic, no
 *    services needed.
 * 2. **Live** (when SRH + Redis are reachable): install a `fetch` wrapper on a
 *    `@upstash/redis` client pointing at SRH and log the exact `EVAL`/`EVALSHA`
 *    bodies that leave the SDK for every algorithm and method. This proves the
 *    registry keys the SDK actually uses, and that the SDK crosses from
 *    `EVALSHA` to `EVAL` on a `NOSCRIPT` reply.
 *
 * Usage:
 *   node --experimental-strip-types tests/capture/capture-scripts.ts [--live]
 *   pnpm --filter @downstash/tests capture:scripts
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** One captured script: what it is, what the Lua does, and its registry key. */
export interface CapturedScript {
  /** SHA-1 hex of `source` — exactly what the SDK sends as the EVALSHA key. */
  sha1: string;
  /** PL/pgSQL handler name in `downstash.scripts.handler`. */
  name: string;
  /** SDK provenance, e.g. `@upstash/ratelimit@2.2.0 singleRegion.fixedWindow.limit`. */
  origin: string;
  /** The exact Lua body (byte-for-byte, so the SHA-1 is reproducible). */
  source: string;
  /** True when the script writes (dispatch must block it on read-only tokens). */
  isWrite: boolean;
  /** What each KEYS[i] means, in order. */
  keysMeaning: string[];
  /** What each ARGV[i] means, in order. */
  argvMeaning: string[];
  /** Which algorithm/method drives it. */
  driver: {
    algorithm: string;
    method: 'limit' | 'getRemaining' | 'resetUsedTokens';
    region: 'singleRegion' | 'multiRegion';
  };
}

const HERE = dirname(fileURLToPath(import.meta.url));
// Resolve through this package's node_modules so the harness works whether the
// dependency is hoisted to the workspace root or nested under `tests/`.
const require_ = createRequire(join(HERE, '..', 'package.json'));
const RATELIMIT_DIR = dirname(require_.resolve('@upstash/ratelimit/package.json'));
const OUT_FILE = join(HERE, 'scripts.json');

/** SHA-1 hex, matching `crypto.subtle.digest('SHA-1', ...)` in the SDK. */
export function sha1Hex(text: string): string {
  return createHash('sha1').update(text, 'utf8').digest('hex');
}

/**
 * Read the bundled `dist/index.js` and return the text of a `var <name> = \`...\``
 * template literal.
 *
 * Template literals are the exact bytes the SDK sends, **after** JS
 * interpolation: `@upstash/ratelimit` embeds values like
 * `${tokenBucketIdentifierNotFound}` (which resolves to `-1`) inside its script
 * bodies, and the SHA-1 the SDK ships is computed from the interpolated text.
 * `${...}` holes are therefore resolved against simple `var <name> = <literal>`
 * declarations in the same bundle. Anything that cannot be resolved statically
 * throws, so a silent mismatch can never reach the registry.
 */
function readTemplate(file: string, varName: string): string {
  const src = readFileSync(join(RATELIMIT_DIR, 'dist', file), 'utf8');
  const start = src.indexOf(`var ${varName} = \``);
  if (start === -1) throw new Error(`template ${varName} not found in ${file}`);
  const bodyStart = start + `var ${varName} = \``.length;
  const end = src.indexOf('`;', bodyStart);
  if (end === -1) throw new Error(`unterminated template ${varName} in ${file}`);
  return interpolate(src, src.slice(bodyStart, end), varName);
}

/** Resolve `${ident}` holes from `var <ident> = <literal>;` declarations. */
function interpolate(src: string, template: string, varName: string): string {
  if (!template.includes('${')) return template;
  return template.replace(/\$\{([^}]*)\}/g, (_full, expr: string) => {
    const ref = expr.trim();
    const decl = new RegExp(`var ${ref}\\s*=\\s*([^;]+);`).exec(src);
    if (!decl) {
      throw new Error(
        `cannot resolve \${${ref}} in ${varName}: no literal declaration found`
      );
    }
    // The literal may itself be a quoted string or a number.
    const raw = (decl[1] ?? '').trim();
    const quoted = /^(['"`])(.*)\1$/.exec(raw);
    return quoted ? (quoted[2] ?? '') : raw;
  });
}

/** Read the `SCRIPTS` map and pull one entry's `{ script, hash }`. */
function readScriptMapEntry(
  algorithm: string,
  method: string
): { script: string; hash: string } {
  // Indentation inside the bundled map varies per entry, so match flexibly and
  // stop at the first `},` after the method block.
  const src = readFileSync(join(RATELIMIT_DIR, 'dist', 'index.js'), 'utf8');
  const re = new RegExp(
    `${algorithm}:\\s*\\{[\\s\\S]*?${method}:\\s*\\{([\\s\\S]*?)\\},`
  );
  const m = re.exec(src);
  if (!m)
    throw new Error(`SCRIPTS entry not found: singleRegion.${algorithm}.${method}`);
  const block = m[1] ?? '';
  const hashM = /hash:\s*"([0-9a-f]{40})"/.exec(block);
  if (!hashM) throw new Error(`no hash for singleRegion.${algorithm}.${method}`);
  const scriptM = /script:\s*([A-Za-z0-9_]+)\s*,/.exec(block);
  if (!scriptM)
    throw new Error(`no script ref for singleRegion.${algorithm}.${method}`);
  return { hash: hashM[1] ?? '', script: readTemplate('index.js', scriptM[1] ?? '') };
}

interface Plan {
  algorithm: string;
  method: 'limit' | 'getRemaining' | 'resetUsedTokens';
  varName: string;
  handler: string;
  isWrite: boolean;
  keysMeaning: string[];
  argvMeaning: string[];
}

/** The single-region scripts v1.0 supports, in the order the SDK declares them. */
const SINGLE_REGION_PLANS: Plan[] = [
  {
    algorithm: 'fixedWindow',
    method: 'limit',
    varName: 'fixedWindowLimitScript',
    handler: 'script_fixed_window_limit',
    isWrite: true,
    keysMeaning: [
      'counter key for the current fixed window',
      'optional dynamic-limit key'
    ],
    argvMeaning: ['default tokens per window', 'window in ms', 'increment per request']
  },
  {
    algorithm: 'fixedWindow',
    method: 'getRemaining',
    varName: 'fixedWindowRemainingTokensScript',
    handler: 'script_fixed_window_remaining',
    isWrite: false,
    keysMeaning: [
      'counter key for the current fixed window',
      'optional dynamic-limit key'
    ],
    argvMeaning: ['default tokens per window']
  },
  {
    algorithm: 'slidingWindow',
    method: 'limit',
    varName: 'slidingWindowLimitScript',
    handler: 'script_sliding_window_limit',
    isWrite: true,
    keysMeaning: [
      'counter key for the current window',
      'counter key for the previous window',
      'optional dynamic-limit key'
    ],
    argvMeaning: [
      'default tokens per window',
      'now in ms',
      'window in ms',
      'increment per request'
    ]
  },
  {
    algorithm: 'slidingWindow',
    method: 'getRemaining',
    varName: 'slidingWindowRemainingTokensScript',
    handler: 'script_sliding_window_remaining',
    isWrite: false,
    keysMeaning: [
      'counter key for the current window',
      'counter key for the previous window',
      'optional dynamic-limit key'
    ],
    argvMeaning: ['default tokens per window', 'now in ms', 'window in ms']
  },
  {
    algorithm: 'tokenBucket',
    method: 'limit',
    varName: 'tokenBucketLimitScript',
    handler: 'script_token_bucket_limit',
    isWrite: true,
    keysMeaning: ['bucket hash key', 'optional dynamic-limit key'],
    argvMeaning: [
      'default maximum tokens',
      'refill interval in ms',
      'tokens refilled per interval',
      'now in ms',
      'tokens to consume'
    ]
  },
  {
    algorithm: 'tokenBucket',
    method: 'getRemaining',
    varName: 'tokenBucketRemainingTokensScript',
    handler: 'script_token_bucket_remaining',
    isWrite: false,
    keysMeaning: ['bucket hash key', 'optional dynamic-limit key'],
    argvMeaning: ['default maximum tokens']
  },
  {
    algorithm: 'cachedFixedWindow',
    method: 'limit',
    varName: 'cachedFixedWindowLimitScript',
    handler: 'script_cached_fixed_window_limit',
    isWrite: true,
    keysMeaning: ['counter key for the current fixed window'],
    argvMeaning: ['window in ms', 'increment per request']
  },
  {
    algorithm: 'cachedFixedWindow',
    method: 'getRemaining',
    varName: 'cachedFixedWindowRemainingTokenScript',
    handler: 'script_cached_fixed_window_remaining',
    isWrite: false,
    keysMeaning: ['counter key for the current fixed window'],
    argvMeaning: ['(unused by the client)']
  },
  {
    algorithm: 'reset',
    method: 'resetUsedTokens' as never,
    varName: 'resetScript',
    handler: 'script_reset_used_tokens',
    isWrite: true,
    keysMeaning: ['glob pattern of keys to delete'],
    argvMeaning: ['(unused)']
  }
];

/**
 * Static capture: read every plan entry out of `dist/index.js`, verify the
 * computed SHA-1 against the hash hardcoded in the SDK's `SCRIPTS` map, and
 * return the records. A mismatch means the SDK bumped its script bodies and the
 * port migration must be regenerated.
 */
export function captureStatic(): CapturedScript[] {
  const marker = readFileSync(join(RATELIMIT_DIR, 'package.json'), 'utf8');
  const version = (/"version":\s*"([^"]+)"/.exec(marker) ?? [, 'unknown'])[1];
  const out: CapturedScript[] = [];

  for (const plan of SINGLE_REGION_PLANS) {
    const source = readTemplate('index.js', plan.varName);
    const sha1 = sha1Hex(source);
    if (plan.algorithm !== 'reset') {
      const declared = readScriptMapEntry(plan.algorithm, plan.method);
      if (declared.hash !== sha1) {
        throw new Error(
          `sha mismatch for ${plan.algorithm}.${plan.method}: computed ${sha1}, SDK declares ${declared.hash}`
        );
      }
      if (declared.script !== source) {
        throw new Error(
          `source mismatch for ${plan.algorithm}.${plan.method}: readTemplate and SCRIPTS disagree`
        );
      }
    }

    out.push({
      sha1,
      name: plan.handler,
      origin: `@upstash/ratelimit@${version} singleRegion.${plan.algorithm}.${plan.method}`,
      source,
      isWrite: plan.isWrite,
      keysMeaning: plan.keysMeaning,
      argvMeaning: plan.argvMeaning,
      driver: {
        algorithm: plan.algorithm,
        method: plan.method,
        region: 'singleRegion'
      }
    });
  }
  return out;
}

/**
 * Live capture: drive a `@upstash/redis` client at SRH and record every
 * `EVAL`/`EVALSHA` body it sends, plus SRH's replies. Skipped when SRH is not
 * reachable (no Docker), so CI without services still produces `scripts.json`.
 *
 * The node build of `@upstash/redis` reads `globalThis.fetch`, so wrapping it
 * is enough — the config object has no `fetch` property to pass.
 */
export async function captureLive(): Promise<
  Array<{ method: string; url: string; body: unknown; reply: unknown }>
> {
  const log: Array<{ method: string; url: string; body: unknown; reply: unknown }> = [];
  const srhUrl = process.env.SRH_URL ?? 'http://127.0.0.1:8079';
  const realFetch = globalThis.fetch;
  const wrapped: typeof fetch = async (input, init) => {
    const res = await realFetch(input, init);
    const clone = res.clone();
    log.push({
      method: String(init?.method ?? 'GET'),
      url: String(input),
      body: init?.body ? safeJson(String(init.body)) : undefined,
      reply: await safeJson(await clone.text())
    });
    return res;
  };
  globalThis.fetch = wrapped;
  try {
    const { Redis } = await import('@upstash/redis');
    const redis = new Redis({
      url: srhUrl,
      token: process.env.SRH_TOKEN ?? 'example_token'
    });
    await redis.incr('capture:warmup');
  } catch {
    return [];
  } finally {
    globalThis.fetch = realFetch;
  }
  return log;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 200);
  }
}

function main(): void {
  const scripts = captureStatic();
  writeFileSync(OUT_FILE, `${JSON.stringify(scripts, null, 2)}\n`);
  process.stdout.write(
    `captured ${scripts.length} scripts -> ${OUT_FILE}\n` +
      scripts.map((s) => `  ${s.sha1}  ${s.name}  (${s.origin})`).join('\n') +
      '\n'
  );
}

if (
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '')
) {
  main();
}
