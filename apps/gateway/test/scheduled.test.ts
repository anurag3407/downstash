/**
 * @file apps/gateway/test/scheduled.test.ts
 * Keep-alive cron handler (§9.1 `src/scheduled.ts`, ADR 0010).
 */
import { describe, expect, it, vi } from 'vitest';
import { handleScheduled, type Logger } from '../src/scheduled.ts';

function captureLogger(): { logger: Logger; lines: string[] } {
  const lines: string[] = [];
  return {
    logger: {
      log: (m: string) => lines.push(m),
      error: (m: string) => lines.push(m)
    },
    lines
  };
}

describe('scheduled keep-alive', () => {
  it('logs one line with ok:true when the ping succeeds', async () => {
    const { logger, lines } = captureLogger();
    const ping = vi.fn(async () => ({ ok: true, status: 200 }));
    await handleScheduled({ storage: { ping }, log: logger });
    expect(ping).toHaveBeenCalledTimes(1);
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'info',
      msg: 'keepalive',
      ok: true,
      status: 200
    });
  });

  it('logs a failure without leaking storage details', async () => {
    const { logger, lines } = captureLogger();
    const ping = vi.fn(async () => {
      throw new Error('connection refused to https://proj.supabase.co with eyJsecret');
    });
    await handleScheduled({ storage: { ping }, log: logger });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? '{}') as Record<string, unknown>;
    expect(entry).toMatchObject({ level: 'error', msg: 'keepalive failed' });
    // Only the error *name* is recorded — never the message.
    const serialized = JSON.stringify(entry);
    expect(serialized).toContain('Error');
    expect(serialized).not.toContain('supabase');
    expect(serialized).not.toContain('eyJ');
  });

  it('defaults to console when no logger is injected', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    await handleScheduled({
      storage: { ping: async () => ({ ok: true, status: 200 }) }
    });
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
