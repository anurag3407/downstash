/**
 * @file apps/gateway/src/scheduled.ts
 * Cron handler: keep-alive ping (§9.1 `scheduled.ts`).
 *
 * Supabase pauses free projects after 7 days of inactivity, and it measures
 * activity through its API. pg_cron runs inside the database, so an internal job
 * alone is not proof of activity — a Worker Cron Trigger has to hit the REST
 * endpoint. This is that call (ADR 0010).
 */

/** Log surface, injectable so tests can capture output. */
export interface Logger {
  log: (message: string) => void;
  error: (message: string) => void;
}

/** Ping storage and log the outcome as one line of JSON. Safe fields only. */
export async function handleScheduled(
  deps: {
    storage: { ping: () => Promise<{ ok: boolean; status: number }> };
    log?: Logger;
  },
  _event?: unknown
): Promise<void> {
  const log = deps.log ?? console;
  try {
    const ping = await deps.storage.ping();
    log.log(
      JSON.stringify({
        level: 'info',
        msg: 'keepalive',
        ok: ping.ok,
        status: ping.status
      })
    );
  } catch (err) {
    log.error(
      JSON.stringify({
        level: 'error',
        msg: 'keepalive failed',
        error: err instanceof Error ? err.name : 'unknown'
      })
    );
  }
}
