/**
 * @file packages/protocol/src/registry/zsets.ts
 * Sorted-set command specs (§7.8 zsets family).
 */
import type { CommandFlag, CommandSpec } from '../types.ts';

type Spec = Omit<CommandSpec, 'flags'> & { flags: readonly CommandFlag[] };

export const ZSETS: readonly Spec[] = [
  { name: 'ZADD', arity: -4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Add one or more members to a sorted set, or update scores', syntax: 'ZADD key [NX|XX] [GT|LT] [CH] [INCR] score member [score member ...]' },
  { name: 'ZINCRBY', arity: 4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Increment the score of a member in a sorted set', syntax: 'ZINCRBY key increment member' },
  { name: 'ZSCORE', arity: 3, flags: ['read', 'cacheable'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Get the score of a member in a sorted set', syntax: 'ZSCORE key member' },
  { name: 'ZMSCORE', arity: -3, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Get the score of one or more members in a sorted set', syntax: 'ZMSCORE key member [member ...]' },
  { name: 'ZREM', arity: -3, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Remove one or more members from a sorted set', syntax: 'ZREM key member [member ...]' },
  { name: 'ZCARD', arity: 2, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Get the number of members in a sorted set', syntax: 'ZCARD key' },
  { name: 'ZCOUNT', arity: 4, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Count the members in a sorted set with scores within the given values', syntax: 'ZCOUNT key min max' },
  { name: 'ZRANGE', arity: -4, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Return a range of members in a sorted set', syntax: 'ZRANGE key start stop [BYSCORE] [REV] [LIMIT offset count] [WITHSCORES]' },
  { name: 'ZRANK', arity: 3, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Determine the index of a member in a sorted set', syntax: 'ZRANK key member' },
  { name: 'ZREVRANK', arity: 3, flags: ['read'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Determine the index of a member in a sorted set, ordered from high to low', syntax: 'ZREVRANK key member' },
  { name: 'ZREMRANGEBYSCORE', arity: 4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Remove all members in a sorted set within the given scores', syntax: 'ZREMRANGEBYSCORE key min max' },
  { name: 'ZREMRANGEBYRANK', arity: 4, flags: ['write'], firstKey: 1, lastKey: 1, keyStep: 1, family: 'zsets', summary: 'Remove all members in a sorted set within the given indexes', syntax: 'ZREMRANGEBYRANK key start stop' }
];
