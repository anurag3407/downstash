/**
 * @file packages/protocol/src/registry/sets.ts
 * Set command specs (§7.8 sets family).
 */
import type { CommandFlag, CommandSpec } from '../types.ts';

type Spec = Omit<CommandSpec, 'flags'> & { flags: readonly CommandFlag[] };

export const SETS: readonly Spec[] = [
  {
    name: 'SADD',
    arity: -3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'sets',
    summary: 'Add one or more members to a set',
    syntax: 'SADD key member [member ...]'
  },
  {
    name: 'SREM',
    arity: -3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'sets',
    summary: 'Remove one or more members from a set',
    syntax: 'SREM key member [member ...]'
  },
  {
    name: 'SMEMBERS',
    arity: 2,
    flags: ['read', 'cacheable'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'sets',
    summary: 'Get all the members in a set',
    syntax: 'SMEMBERS key'
  },
  {
    name: 'SISMEMBER',
    arity: 3,
    flags: ['read', 'cacheable'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'sets',
    summary: 'Determine if a given value is a member of a set',
    syntax: 'SISMEMBER key member'
  },
  {
    name: 'SMISMEMBER',
    arity: -3,
    flags: ['read'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'sets',
    summary: 'Returns the membership associated with the given elements for a set',
    syntax: 'SMISMEMBER key member [member ...]'
  },
  {
    name: 'SCARD',
    arity: 2,
    flags: ['read'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'sets',
    summary: 'Get the number of members in a set',
    syntax: 'SCARD key'
  },
  {
    name: 'SPOP',
    arity: -2,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'sets',
    summary: 'Remove and return one or multiple random members from a set',
    syntax: 'SPOP key [count]'
  },
  {
    name: 'SRANDMEMBER',
    arity: -2,
    flags: ['read'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'sets',
    summary: 'Get one or multiple random members from a set',
    syntax: 'SRANDMEMBER key [count]'
  },
  {
    name: 'SINTER',
    arity: -2,
    flags: ['read'],
    firstKey: 1,
    lastKey: -1,
    keyStep: 1,
    family: 'sets',
    summary: 'Intersect multiple sets',
    syntax: 'SINTER key [key ...]'
  },
  {
    name: 'SUNION',
    arity: -2,
    flags: ['read'],
    firstKey: 1,
    lastKey: -1,
    keyStep: 1,
    family: 'sets',
    summary: 'Add multiple sets',
    syntax: 'SUNION key [key ...]'
  },
  {
    name: 'SDIFF',
    arity: -2,
    flags: ['read'],
    firstKey: 1,
    lastKey: -1,
    keyStep: 1,
    family: 'sets',
    summary: 'Subtract multiple sets',
    syntax: 'SDIFF key [key ...]'
  }
];
