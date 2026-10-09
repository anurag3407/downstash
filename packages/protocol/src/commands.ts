/**
 * @file packages/protocol/src/commands.ts
 * Aggregates the per-family registries into one sorted `COMMANDS` map and
 * exposes the precheck helpers the gateway uses (mirrors `downstash.dispatch`).
 */
import type { CommandSpec } from './types.ts';
import { formatError, ERRORS } from './errors.ts';
import { STRINGS } from './registry/strings.ts';
import { KEYSPACE } from './registry/keyspace.ts';
import { HASHES } from './registry/hashes.ts';
import { LISTS } from './registry/lists.ts';
import { SETS } from './registry/sets.ts';
import { ZSETS } from './registry/zsets.ts';
import { SERVER, SCRIPTING } from './registry/server.ts';

const ALL: readonly CommandSpec[] = [
  ...STRINGS,
  ...KEYSPACE,
  ...HASHES,
  ...LISTS,
  ...SETS,
  ...ZSETS,
  ...SERVER,
  ...SCRIPTING
];

const sorted = [...ALL].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

export const COMMANDS: Readonly<Record<string, CommandSpec>> = Object.freeze(
  Object.fromEntries(
    sorted.map((s) => [
      s.name,
      Object.freeze({ ...s, flags: Object.freeze([...s.flags]) }) as CommandSpec
    ])
  )
);

/** Case-insensitive command lookup. */
export function getCommand(name: string): CommandSpec | undefined {
  return COMMANDS[name.toUpperCase()];
}

/** True if the command writes (write or script flag), or is unknown (fail safe). */
export function isWrite(name: string): boolean {
  const spec = getCommand(name);
  if (!spec) return true;
  return spec.flags.includes('write') || spec.flags.includes('script');
}

/** True if the command is cacheable (L1). */
export function isCacheable(name: string): boolean {
  const spec = getCommand(name);
  return spec ? spec.flags.includes('cacheable') : false;
}

/** All command names, sorted. */
export function commandNames(): string[] {
  return Object.keys(COMMANDS);
}

export interface PrecheckOk {
  ok: true;
  spec: CommandSpec;
}
export interface PrecheckErr {
  ok: false;
  error: string;
}
export type PrecheckResult = PrecheckOk | PrecheckErr;

/** Preview of up to 3 args for the unknown-command message (Redis-style). */
function argsPreview(args: readonly string[]): string {
  return args
    .slice(0, 3)
    .map((a) => `'${a.slice(0, 128)}' `)
    .join('');
}

/**
 * Pre-check a command the same way `downstash.dispatch` does: unknown command,
 * then arity. Returns the exact error strings, or the resolved spec.
 */
export function precheck(argv: readonly string[]): PrecheckResult {
  const name = argv[0] ?? '';
  const spec = getCommand(name);
  if (!spec) {
    return { ok: false, error: formatError(ERRORS.UNKNOWN_COMMAND, name, argsPreview(argv.slice(1))) };
  }
  const n = argv.length;
  const arityOk = spec.arity > 0 ? n === spec.arity : n >= -spec.arity;
  if (!arityOk) {
    return { ok: false, error: formatError(ERRORS.WRONG_ARGS, name.toLowerCase()) };
  }
  return { ok: true, spec };
}
