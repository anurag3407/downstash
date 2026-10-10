/**
 * @file packages/protocol/src/registry/keyspace.ts
 * Keyspace & expiry command specs (§7.8 keyspace family).
 */
import type { CommandFlag, CommandSpec } from '../types.ts';

type Spec = Omit<CommandSpec, 'flags'> & { flags: readonly CommandFlag[] };

export const KEYSPACE: readonly Spec[] = [
  {
    name: 'DEL',
    arity: -2,
    flags: ['write'],
    firstKey: 1,
    lastKey: -1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Delete a key',
    syntax: 'DEL key [key ...]'
  },
  {
    name: 'UNLINK',
    arity: -2,
    flags: ['write'],
    firstKey: 1,
    lastKey: -1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Delete a key asynchronously in another thread',
    syntax: 'UNLINK key [key ...]'
  },
  {
    name: 'EXISTS',
    arity: -2,
    flags: ['read'],
    firstKey: 1,
    lastKey: -1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Determine if a key exists',
    syntax: 'EXISTS key [key ...]'
  },
  {
    name: 'TYPE',
    arity: 2,
    flags: ['read'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Determine the type stored at key',
    syntax: 'TYPE key'
  },
  {
    name: 'KEYS',
    arity: 2,
    flags: ['read'],
    firstKey: 0,
    lastKey: 0,
    keyStep: 0,
    family: 'keyspace',
    summary: 'Find all keys matching the given pattern',
    syntax: 'KEYS pattern'
  },
  {
    name: 'SCAN',
    arity: -2,
    flags: ['read'],
    firstKey: 0,
    lastKey: 0,
    keyStep: 0,
    family: 'keyspace',
    summary: 'Incrementally iterate the keys space',
    syntax: 'SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]'
  },
  {
    name: 'RENAME',
    arity: 3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 2,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Rename a key',
    syntax: 'RENAME key newkey'
  },
  {
    name: 'RENAMENX',
    arity: 3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 2,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Rename a key, only if the new key does not exist',
    syntax: 'RENAMENX key newkey'
  },
  {
    name: 'RANDOMKEY',
    arity: 1,
    flags: ['read'],
    firstKey: 0,
    lastKey: 0,
    keyStep: 0,
    family: 'keyspace',
    summary: 'Return a random key from the keyspace',
    syntax: 'RANDOMKEY'
  },
  {
    name: 'EXPIRE',
    arity: -3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Set a seconds time to live on a key',
    syntax: 'EXPIRE key seconds [NX|XX|GT|LT]'
  },
  {
    name: 'PEXPIRE',
    arity: -3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Set a milliseconds time to live on a key',
    syntax: 'PEXPIRE key ms [NX|XX|GT|LT]'
  },
  {
    name: 'EXPIREAT',
    arity: -3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Set the expiration for a key as a Unix timestamp',
    syntax: 'EXPIREAT key ts [NX|XX|GT|LT]'
  },
  {
    name: 'PEXPIREAT',
    arity: -3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Set the expiration for a key as a Unix milliseconds timestamp',
    syntax: 'PEXPIREAT key ms [NX|XX|GT|LT]'
  },
  {
    name: 'TTL',
    arity: 2,
    flags: ['read'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Get the time to live for a key in seconds',
    syntax: 'TTL key'
  },
  {
    name: 'PTTL',
    arity: 2,
    flags: ['read'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Get the time to live for a key in milliseconds',
    syntax: 'PTTL key'
  },
  {
    name: 'PERSIST',
    arity: 2,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'keyspace',
    summary: 'Remove the expiration from a key',
    syntax: 'PERSIST key'
  }
];
