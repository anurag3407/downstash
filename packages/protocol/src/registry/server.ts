/**
 * @file packages/protocol/src/registry/server.ts
 * Server & scripting command specs (§7.8 server/scripting families).
 */
import type { CommandFlag, CommandSpec } from '../types.ts';

type Spec = Omit<CommandSpec, 'flags'> & { flags: readonly CommandFlag[] };

export const SERVER: readonly Spec[] = [
  { name: 'PING', arity: -1, flags: ['read'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'server', summary: 'Ping the server', syntax: 'PING [message]' },
  { name: 'ECHO', arity: 2, flags: ['read'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'server', summary: 'Echo the given string', syntax: 'ECHO message' },
  { name: 'DBSIZE', arity: 1, flags: ['read'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'server', summary: 'Return the number of keys in the database', syntax: 'DBSIZE' },
  { name: 'FLUSHDB', arity: -1, flags: ['write', 'admin'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'server', summary: 'Remove all keys from the current database', syntax: 'FLUSHDB [ASYNC|SYNC]' },
  { name: 'FLUSHALL', arity: -1, flags: ['write', 'admin'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'server', summary: 'Remove all keys from all databases', syntax: 'FLUSHALL [ASYNC|SYNC]' },
  { name: 'TIME', arity: 1, flags: ['read'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'server', summary: 'Return the current server time', syntax: 'TIME' }
];

export const SCRIPTING: readonly Spec[] = [
  { name: 'EVAL', arity: -3, flags: ['script'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'scripting', summary: 'Execute a registered script', syntax: 'EVAL script numkeys key [key ...] arg [arg ...]' },
  { name: 'EVAL_RO', arity: -3, flags: ['script'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'scripting', summary: 'Execute a registered script in read-only mode', syntax: 'EVAL_RO script numkeys key [key ...] arg [arg ...]' },
  { name: 'EVALSHA', arity: -3, flags: ['script'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'scripting', summary: 'Execute a registered script by SHA', syntax: 'EVALSHA sha1 numkeys key [key ...] arg [arg ...]' },
  { name: 'EVALSHA_RO', arity: -3, flags: ['script'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'scripting', summary: 'Execute a registered script by SHA in read-only mode', syntax: 'EVALSHA_RO sha1 numkeys key [key ...] arg [arg ...]' },
  { name: 'SCRIPT', arity: -2, flags: ['script'], firstKey: 0, lastKey: 0, keyStep: 0, family: 'scripting', summary: 'Manage the script cache', syntax: 'SCRIPT LOAD script | SCRIPT EXISTS sha1 [sha1 ...] | SCRIPT FLUSH' }
];
