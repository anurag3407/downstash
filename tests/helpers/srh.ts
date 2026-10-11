/**
 * @file tests/helpers/srh.ts
 * Serverless-Redis-HTTP helpers for the differential suite (§14.1, §14.4).
 */
export const SRH_URL = process.env.SRH_URL ?? 'http://127.0.0.1:8079';
export const SRH_TOKEN = process.env.SRH_TOKEN ?? 'example_token';

/** POST a raw command array to SRH and return the JSON body. */
export async function srhRun(command: string[]): Promise<unknown> {
  const res = await fetch(SRH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SRH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  return res.json();
}

/** Flush the SRH-backed Redis before a differential run. */
export async function flushSrh(): Promise<void> {
  await srhRun(['FLUSHALL']);
}
