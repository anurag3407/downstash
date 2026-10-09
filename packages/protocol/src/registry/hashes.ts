/**
 * @file packages/protocol/src/registry/hashes.ts
 * Hash command specs (§7.8 hashes family).
 */
import type { CommandFlag, CommandSpec } from '../types.ts';

type Spec = Omit<CommandSpec, 'flags'> & { flags: readonly CommandFlag[] };

export const HASHES: readonly Spec[] = [
  { name: 'HSET', arity: -4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Set hash fields', syntax: 'HSET key field value [field value ...]' },
  { name: 'HMSET', arity: -4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Set multiple hash fields', syntax: 'HMSET key field value [field value ...]' },
  { name: 'HSETNX', arity: 4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Set the value of a hash field, only if the field does not exist', syntax: 'HSETNX key field value' },
  { name: 'HGET', arity: 3, flags: ['read', 'cacheable'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Get the value of a hash field', syntax: 'HGET key field' },
  { name: 'HMGET', arity: -3, flags: ['read', 'cacheable'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Get the values of all the given hash fields', syntax: 'HMGET key field [field ...]' },
  { name: 'HGETALL', arity: 2, flags: ['read', 'cacheable'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Get all the fields and values in a hash', syntax: 'HGETALL key' },
  { name: 'HDEL', arity: -3, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Delete one or more hash fields', syntax: 'HDEL key field [field ...]' },
  { name: 'HLEN', arity: 2, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Get the number of fields in a hash', syntax: 'HLEN key' },
  { name: 'HEXISTS', arity: 3, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Determine if a hash field exists', syntax: 'HEXISTS key field' },
  { name: 'HKEYS', arity: 2, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Get all the fields in a hash', syntax: 'HKEYS key' },
  { name: 'HVALS', arity: 2, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Get all the values in a hash', syntax: 'HVALS key' },
  { name: 'HINCRBY', arity: 4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Increment the integer value of a hash field by the given number', syntax: 'HINCRBY key field increment' },
  { name: 'HINCRBYFLOAT', arity: 4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Increment the float value of a hash field by the given amount', syntax: 'HINCRBYFLOAT key field increment' },
  { name: 'HSTRLEN', arity: 3, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Get the length of the value of a hash field', syntax: 'HSTRLEN key field' },
  { name: 'HRANDFIELD', arity: -2, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'hashes', summary: 'Get one or multiple random fields from a hash', syntax: 'HRANDFIELD key [count [WITHVALUES]]' }
];
