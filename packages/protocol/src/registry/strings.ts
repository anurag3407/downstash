/**
 * @file packages/protocol/src/registry/strings.ts
 * String command specs (§7.8 strings family).
 */
import type { CommandFlag, CommandSpec } from '../types.ts';

type Spec = Omit<CommandSpec, 'flags'> & { flags: readonly CommandFlag[] };

export const STRINGS: readonly Spec[] = [
  {
    name: 'GET',
    arity: 2,
    flags: ['read', 'cacheable'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Get the value of a key',
    syntax: 'GET key'
  },
  {
    name: 'SET',
    arity: -3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Set the string value of a key',
    syntax: 'SET key value [NX|XX] [GET] [EX seconds|PX ms|EXAT ts|PXAT ms|KEEPTTL]'
  },
  {
    name: 'SETNX',
    arity: 3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Set the value of a key, only if the key does not exist',
    syntax: 'SETNX key value'
  },
  {
    name: 'SETEX',
    arity: 4,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Set the value and expiration of a key',
    syntax: 'SETEX key seconds value'
  },
  {
    name: 'PSETEX',
    arity: 4,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Set the value and time to live in milliseconds of a key',
    syntax: 'PSETEX key ms value'
  },
  {
    name: 'GETSET',
    arity: 3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Set the string value of a key and return its old value',
    syntax: 'GETSET key value'
  },
  {
    name: 'GETDEL',
    arity: 2,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Get the value of a key and delete it',
    syntax: 'GETDEL key'
  },
  {
    name: 'MGET',
    arity: -2,
    flags: ['read', 'cacheable'],
    firstKey: 1,
    lastKey: -1,
    keyStep: 1,
    family: 'strings',
    summary: 'Get the values of all the given keys',
    syntax: 'MGET key [key ...]'
  },
  {
    name: 'MSET',
    arity: -3,
    flags: ['write'],
    firstKey: 1,
    lastKey: -1,
    keyStep: 2,
    family: 'strings',
    summary: 'Set multiple keys to multiple values',
    syntax: 'MSET key value [key value ...]'
  },
  {
    name: 'MSETNX',
    arity: -3,
    flags: ['write'],
    firstKey: 1,
    lastKey: -1,
    keyStep: 2,
    family: 'strings',
    summary: 'Set multiple keys to multiple values, only if none exist',
    syntax: 'MSETNX key value [key value ...]'
  },
  {
    name: 'INCR',
    arity: 2,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Increment the integer value of a key by one',
    syntax: 'INCR key'
  },
  {
    name: 'DECR',
    arity: 2,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Decrement the integer value of a key by one',
    syntax: 'DECR key'
  },
  {
    name: 'INCRBY',
    arity: 3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Increment the integer value of a key by the given amount',
    syntax: 'INCRBY key increment'
  },
  {
    name: 'DECRBY',
    arity: 3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Decrement the integer value of a key by the given number',
    syntax: 'DECRBY key decrement'
  },
  {
    name: 'INCRBYFLOAT',
    arity: 3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Increment the float value of a key by the given amount',
    syntax: 'INCRBYFLOAT key increment'
  },
  {
    name: 'APPEND',
    arity: 3,
    flags: ['write'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Append a value to a key',
    syntax: 'APPEND key value'
  },
  {
    name: 'STRLEN',
    arity: 2,
    flags: ['read'],
    firstKey: 1,
    lastKey: 1,
    keyStep: 1,
    family: 'strings',
    summary: 'Get the length of the value stored in a key',
    syntax: 'STRLEN key'
  }
];
