/**
 * @file packages/protocol/src/registry/lists.ts
 * List command specs (§7.8 lists family).
 */
import type { CommandFlag, CommandSpec } from '../types.ts';

type Spec = Omit<CommandSpec, 'flags'> & { flags: readonly CommandFlag[] };

export const LISTS: readonly Spec[] = [
  { name: 'LPUSH', arity: -3, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Prepend one or more elements to a list', syntax: 'LPUSH key element [element ...]' },
  { name: 'RPUSH', arity: -3, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Append one or more elements to a list', syntax: 'RPUSH key element [element ...]' },
  { name: 'LPUSHX', arity: -3, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Prepend an element to a list, only if the list exists', syntax: 'LPUSHX key element [element ...]' },
  { name: 'RPUSHX', arity: -3, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Append an element to a list, only if the list exists', syntax: 'RPUSHX key element [element ...]' },
  { name: 'LPOP', arity: -2, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Remove and return elements from the beginning of a list', syntax: 'LPOP key [count]' },
  { name: 'RPOP', arity: -2, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Remove and return elements from the end of a list', syntax: 'RPOP key [count]' },
  { name: 'LRANGE', arity: 4, flags: ['read', 'cacheable'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Get a range of elements from a list', syntax: 'LRANGE key start stop' },
  { name: 'LLEN', arity: 2, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Get the length of a list', syntax: 'LLEN key' },
  { name: 'LINDEX', arity: 3, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Get an element from a list by its index', syntax: 'LINDEX key index' },
  { name: 'LSET', arity: 4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Set the value of an element in a list by its index', syntax: 'LSET key index element' },
  { name: 'LREM', arity: 4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Remove elements from a list', syntax: 'LREM key count element' },
  { name: 'LTRIM', arity: 4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Trim a list to the specified range', syntax: 'LTRIM key start stop' },
  { name: 'LPOS', arity: -3, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'lists', summary: 'Return the index of matching elements on a list', syntax: 'LPOS key element [RANK rank] [COUNT num-matches] [MAXLEN len]' }
];
