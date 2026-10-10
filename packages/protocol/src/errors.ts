/**
 * @file packages/protocol/src/errors.ts
 * Error message catalog mirroring §17.2 (docs/engine/errors.md). Handlers and
 * the protocol layer must reuse these exact strings.
 */

export const ERRORS = {
  UNKNOWN_COMMAND: "ERR unknown command '%s', with args beginning with: %s",
  WRONG_ARGS: "ERR wrong number of arguments for '%s' command",
  EMPTY_COMMAND: 'ERR empty command',
  COMMAND_SHAPE: 'ERR Downstash: each command must be a JSON array of strings',
  NULL_BYTES: 'ERR Downstash: command contains null bytes',
  PIPELINE_SIZE: 'ERR Downstash: pipeline must contain 1..1000 commands',
  INVALID_MODE: 'ERR Downstash: invalid mode',
  NOPERM: "NOPERM this token has no permissions to run the '%s' command",
  SYNTAX_ERROR: 'ERR syntax error',
  INVALID_EXPIRE: "ERR invalid expire time in '%s' command",
  NOT_INTEGER: 'ERR value is not an integer or out of range',
  INCR_OVERFLOW: 'ERR increment or decrement would overflow',
  NOT_FLOAT: 'ERR value is not a float',
  HASH_NOT_INTEGER: 'ERR hash value is not an integer',
  HASH_NOT_FLOAT: 'ERR hash value is not a float',
  WRONGTYPE: 'WRONGTYPE Operation against a key holding the wrong kind of value',
  NO_SUCH_KEY: 'ERR no such key',
  INDEX_OUT_OF_RANGE: 'ERR index out of range',
  KEYS_TOO_MANY: 'ERR Downstash: KEYS matched more than 10000 keys, use SCAN',
  BYLEX_NOT_SUPPORTED: 'ERR Downstash: BYLEX is not supported',
  LUA_NOT_SUPPORTED:
    'ERR Downstash: arbitrary Lua is not supported (script %s is not in the registry)',
  NOSCRIPT: 'NOSCRIPT No matching script. Please use EVAL.',
  READ_ONLY_SCRIPT: 'ERR Write commands are not allowed from read-only scripts',
  INVALID_ARGUMENTS: 'ERR Invalid argument(s)',
  EMPTY_ARRAY: '(empty array)'
} as const;

export type ErrorKey = keyof typeof ERRORS;

/** Format an error template, replacing each `%s` with the given args in order. */
export function formatError(template: string, ...args: string[]): string {
  let i = 0;
  return template.replace(/%s/g, () => args[i++] ?? '');
}

/** Error thrown by the protocol layer (argv normalization, CLI tokenizing). */
export class ProtocolError extends Error {
  readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = 'ProtocolError';
    this.code = message;
  }
}
