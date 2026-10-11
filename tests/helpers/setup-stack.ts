/**
 * @file tests/helpers/setup-stack.ts
 * Vitest global setup for the compat/differential suites. Boots the PostgREST
 * shim + gateway once for the whole run and exposes the URLs through
 * `process.env`, which `helpers/gateway.ts` and `helpers/srh.ts` already read.
 */
import { startStack, type Stack } from './stack.ts';

let stack: Stack | undefined;

/** Booted once per worker; exported for teardown. */
export async function setup(): Promise<void> {
  stack = await startStack({
    gatewayPort: Number(process.env.GATEWAY_PORT ?? 8787)
  });
  process.env.GATEWAY_URL = stack.gatewayUrl;
  process.env.SHIM_URL = stack.shimUrl;
}

export async function teardown(): Promise<void> {
  await stack?.stop();
}
