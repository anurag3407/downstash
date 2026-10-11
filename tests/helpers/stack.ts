/**
 * @file tests/helpers/stack.ts
 * Boots the local test stack for the compat/differential suites: a PostgREST
 * shim on :54321 and `wrangler dev` on :8787 pointed at it. Docker-free.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { writeFileSync, unlinkSync, existsSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startShim, type ShimHandle } from './postgrest-shim.ts';

/** Repo root, resolved from this file so the cwd never matters. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DEV_VARS = join(REPO_ROOT, 'apps', 'gateway', '.dev.vars');

export const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8787';

export interface Stack {
  gatewayUrl: string;
  shimUrl: string;
  stop(): Promise<void>;
}

/** Poll a URL until it answers, or throw after `timeoutMs`. */
async function waitFor(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} did not become ready: ${String(lastErr)}`);
}

/**
 * Start the shim and the gateway. Secrets are written to a temporary
 * `.dev.vars` and removed on stop, so no secret ever lands in git.
 */
export async function startStack(opts?: { gatewayPort?: number }): Promise<Stack> {
  const shim: ShimHandle = await startShim();
  const hadDevVars = existsSync(DEV_VARS);
  const prev = hadDevVars ? DEV_VARS : undefined;
  if (hadDevVars) {
    // Preserve any developer-provided file by renaming while tests run.
    renameSync(DEV_VARS, `${DEV_VARS}.bak`);
  }
  writeFileSync(
    DEV_VARS,
    `SUPABASE_URL=${shim.url}\nSUPABASE_SECRET_KEY=shim-local-key\n`
  );

  const port = opts?.gatewayPort ?? 8787;
  const wrangler = spawn(
    'pnpm',
    [
      '--filter',
      '@downstash/gateway',
      'exec',
      'wrangler',
      'dev',
      '--port',
      String(port)
    ],
    { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] }
  );
  let log = '';
  wrangler.stdout?.on('data', (d: Buffer) => {
    log += d.toString();
  });
  wrangler.stderr?.on('data', (d: Buffer) => {
    log += d.toString();
  });

  const gatewayUrl = `http://127.0.0.1:${port}`;
  try {
    await waitFor(`${gatewayUrl}/health`);
  } catch (err) {
    wrangler.kill('SIGTERM');
    await shim.close();
    restoreDevVars(hadDevVars, prev);
    throw new Error(`gateway failed to start.\n${log}\n${String(err)}`);
  }

  return {
    gatewayUrl,
    shimUrl: shim.url,
    async stop() {
      wrangler.kill('SIGTERM');
      await new Promise((r) => setTimeout(r, 500));
      wrangler.kill('SIGKILL');
      await shim.close();
      restoreDevVars(hadDevVars, prev);
    }
  };
}

function restoreDevVars(had: boolean, backup: string | undefined): void {
  try {
    if (existsSync(DEV_VARS)) unlinkSync(DEV_VARS);
  } catch {
    /* best effort */
  }
  if (had && backup && existsSync(`${DEV_VARS}.bak`)) {
    try {
      renameSync(`${DEV_VARS}.bak`, DEV_VARS);
    } catch {
      /* best effort */
    }
  }
}

export type { ChildProcess };
