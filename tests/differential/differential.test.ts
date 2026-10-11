/**
 * @file tests/differential/differential.test.ts
 * Differential suite: every corpus runs against Serverless-Redis-HTTP (real
 * Redis 7) and the Downstash gateway, and the normalised replies must match
 * (§14.4). Skipped when SRH is not reachable, so a Docker-less environment
 * still runs the other suites.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { CORPORA, TOTAL_STEPS } from './corpus/index.ts';
import { runCorpus, type DiffResult } from './runner.ts';
import { createTestDatabase, type TestDatabase } from '../helpers/fixtures.ts';
import { GATEWAY_URL } from '../helpers/gateway.ts';
import { SRH_TOKEN, SRH_URL, srhRun } from '../helpers/srh.ts';

let db: TestDatabase;
let srhAvailable = false;

beforeAll(async () => {
  db = await createTestDatabase();
  try {
    await srhRun(['PING']);
    srhAvailable = true;
  } catch {
    srhAvailable = false;
  }
});

describe('differential corpus', () => {
  it('has at least 300 steps and 20 per family', () => {
    expect(TOTAL_STEPS).toBeGreaterThanOrEqual(300);
    for (const c of CORPORA) {
      expect(c.steps.length, c.family).toBeGreaterThanOrEqual(20);
    }
  });
});

describe.each(CORPORA)('$family', (corpus) => {
  it.skipIf(!srhAvailable)('matches real Redis 7', async () => {
    const results: DiffResult[] = await runCorpus(corpus, {
      gatewayUrl: GATEWAY_URL,
      token: db.standard,
      srhUrl: SRH_URL,
      srhToken: SRH_TOKEN
    });
    const failures = results.filter((r) => !r.ok);
    const detail = failures
      .map((f) => `#${f.step} ${JSON.stringify(f.cmd)}: ${f.reason ?? 'unknown'}`)
      .join('\n');
    expect(failures.length, `\n${detail}`).toBe(0);
  });
});
