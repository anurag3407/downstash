/**
 * @file tests/helpers/gateway.ts
 * Gateway health helpers (§14.1). Used by compat/differential suites.
 */
export const GATEWAY_URL = process.env.GATEWAY_URL ?? 'http://127.0.0.1:8787';

/** POST a raw command array to the gateway and return the envelope. */
export async function gatewayRun(
  token: string,
  command: string[]
): Promise<{ result?: unknown; error?: string }> {
  const res = await fetch(`${GATEWAY_URL}/`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  return (await res.json()) as { result?: unknown; error?: string };
}

/** Poll `GET /health` until it responds ok, or throw after `timeoutMs`. */
export async function waitForHealth(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${GATEWAY_URL}/health`);
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`gateway not healthy after ${timeoutMs}ms: ${String(lastErr)}`);
}
