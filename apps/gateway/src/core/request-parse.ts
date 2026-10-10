/**
 * @file apps/gateway/src/core/request-parse.ts
 * Turn a request (body + path + query) into argv lists, and build argv from a
 * path-style command (`GET /get/foo?EX=1`) per §9.4.
 */
import {
  normalizeCommand,
  normalizePipeline,
  ProtocolError
} from '@downstash/protocol';

export type Parsed =
  | {
      ok: true;
      mode: 'single' | 'pipeline' | 'multi';
      commands: string[][];
      raw?: unknown;
    }
  | { ok: false; error: string };

/** Parse a JSON body for POST /, POST /pipeline, POST /multi-exec. */
export async function parseJsonBody(
  body: string,
  mode: 'single' | 'pipeline' | 'multi',
  maxPipeline: number
): Promise<Parsed> {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, error: 'ERR Downstash: invalid JSON body' };
  }
  try {
    if (mode === 'single') {
      return { ok: true, mode, commands: [normalizeCommand(json)] };
    }
    return { ok: true, mode, commands: normalizePipeline(json, maxPipeline) };
  } catch (e) {
    if (e instanceof ProtocolError) return { ok: false, error: e.message };
    return { ok: false, error: 'ERR Downstash: invalid command shape' };
  }
}

/**
 * Build argv from a path command: segments after the command are args, then
 * query params (excluding `_token`) as `[name, value]`; an empty value appends
 * only the name. For POST, a non-empty raw body is appended as the last arg.
 */
export function parsePathCommand(
  command: string,
  segments: string[],
  query: URLSearchParams,
  body: string
): string[] {
  const argv: string[] = [command.toUpperCase()];
  for (const seg of segments) argv.push(decodeURIComponent(seg));
  for (const [name, value] of query) {
    if (name === '_token') continue;
    if (value === '') argv.push(name);
    else argv.push(name, value);
  }
  if (body.length > 0) argv.push(body);
  return argv;
}
