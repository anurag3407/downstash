/**
 * @file tests/differential/runner.ts
 * Differential runner: executes a corpus against SRH (real Redis 7) and the
 * Downstash gateway with raw `fetch`, normalises both replies and compares
 * them (§14.4).
 *
 * Normalisers exist because a few replies are legitimately not
 * byte-comparable: Redis returns SCAN cursors in its own order, floats print
 * differently, and ZSET members come back in an unspecified order. Anything
 * that differs after normalisation is a real engine bug.
 */
export interface Step {
  cmd: string[];
  normalize?: 'sort' | 'float' | 'scanCursor' | 'ttlRange';
  /** Substring the error reply must start with (errors compare by prefix). */
  errorPrefix?: string;
}

export interface Corpus {
  family: string;
  steps: Step[];
}

type Json = unknown;

/** PostgREST-free raw call to a REST endpoint. */
async function post(url: string, token: string, body: string): Promise<Json> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body
  });
  return (await res.json()) as Json;
}

/** Sort an array of strings (and, one level deep, arrays of strings). */
function deepSort(v: unknown): unknown {
  if (Array.isArray(v)) {
    const sorted = v.map(deepSort);
    if (sorted.every((x) => typeof x === 'string' || typeof x === 'number')) {
      return [...sorted].sort((a, b) => String(a).localeCompare(String(b)));
    }
    return sorted;
  }
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = deepSort((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

/** Compare numbers within 1e-9 relative error. */
function floatEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    if (a === b) return true;
    const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
    return Math.abs(a - b) / scale < 1e-9;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => floatEqual(x, b[i]));
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Apply a step's normaliser to one envelope. */
function normalize(step: Step, reply: Json): Json {
  if (!step.normalize) return reply;
  const env = reply as { result?: unknown };
  const r = env.result;
  switch (step.normalize) {
    case 'sort':
      env.result = deepSort(r);
      return env;
    case 'float':
      return env;
    case 'ttlRange':
      return env;
    case 'scanCursor':
      env.result = Array.isArray(r) ? ['<cursor>', ...r.slice(1)] : r;
      return env;
    default:
      return env;
  }
}

export interface DiffResult {
  step: number;
  cmd: string[];
  ok: boolean;
  reason?: string;
}

/** Run one step against both engines and compare. */
export async function runStep(
  step: Step,
  index: number,
  opts: { gatewayUrl: string; token: string; srhUrl: string; srhToken: string }
): Promise<DiffResult> {
  const body = JSON.stringify(step.cmd);
  const [srh, gw] = await Promise.all([
    post(opts.srhUrl, opts.srhToken, body),
    post(opts.gatewayUrl, opts.token, body)
  ]);

  const a = normalize(step, srh);
  const b = normalize(step, gw);
  const errA = (a as { error?: string }).error;
  const errB = (b as { error?: string }).error;

  if (step.errorPrefix) {
    if (!errB) {
      return {
        step: index,
        cmd: step.cmd,
        ok: false,
        reason: `expected error, got ${JSON.stringify(b)}`
      };
    }
    // Compare the first word only: error text is engine-specific.
    const first = errB.split(/\s+/)[0] ?? '';
    if (first !== step.errorPrefix) {
      return {
        step: index,
        cmd: step.cmd,
        ok: false,
        reason: `error ${errB} !~ ${step.errorPrefix}`
      };
    }
    if (!errA) {
      return { step: index, cmd: step.cmd, ok: false, reason: 'SRH did not error' };
    }
    const firstA = errA.split(/\s+/)[0] ?? '';
    if (firstA !== step.errorPrefix) {
      return {
        step: index,
        cmd: step.cmd,
        ok: false,
        reason: `SRH error ${errA} !~ ${step.errorPrefix}`
      };
    }
    return { step: index, cmd: step.cmd, ok: true };
  }

  if (errA || errB) {
    return {
      step: index,
      cmd: step.cmd,
      ok: false,
      reason: `srh=${JSON.stringify(a)} gw=${JSON.stringify(b)}`
    };
  }

  if (step.normalize === 'float') {
    return floatEqual(a, b)
      ? { step: index, cmd: step.cmd, ok: true }
      : {
          step: index,
          cmd: step.cmd,
          ok: false,
          reason: `float mismatch: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`
        };
  }

  return JSON.stringify(a) === JSON.stringify(b)
    ? { step: index, cmd: step.cmd, ok: true }
    : {
        step: index,
        cmd: step.cmd,
        ok: false,
        reason: `${JSON.stringify(a)} vs ${JSON.stringify(b)}`
      };
}

/** Run a whole corpus, flushing both engines first. */
export async function runCorpus(
  corpus: Corpus,
  opts: { gatewayUrl: string; token: string; srhUrl: string; srhToken: string }
): Promise<DiffResult[]> {
  await post(opts.gatewayUrl, opts.token, JSON.stringify(['FLUSHDB']));
  await post(opts.srhUrl, opts.srhToken, JSON.stringify(['FLUSHDB']));
  const results: DiffResult[] = [];
  for (const [i, step] of corpus.steps.entries()) {
    results.push(await runStep(step, i, opts));
  }
  return results;
}
