/**
 * @file tests/differential/corpus/lists.ts
 * List command corpus. ≥20 steps (§14.4).
 */
import type { Corpus } from '../runner.ts';

export const lists: Corpus = {
  family: 'lists',
  steps: [
    { cmd: ['RPUSH', 'l:1', 'a', 'b', 'c'] },
    { cmd: ['LPUSH', 'l:1', 'z'] },
    { cmd: ['LRANGE', 'l:1', '0', '-1'] },
    { cmd: ['LLEN', 'l:1'] },
    { cmd: ['LINDEX', 'l:1', '0'] },
    { cmd: ['LINDEX', 'l:1', '-1'] },
    { cmd: ['LINDEX', 'l:1', '99'] },
    { cmd: ['LRANGE', 'l:1', '1', '2'] },
    { cmd: ['LRANGE', 'l:1', '-2', '-1'] },
    { cmd: ['LRANGE', 'l:1', '5', '10'] },
    { cmd: ['LPOP', 'l:1'] },
    { cmd: ['RPOP', 'l:1'] },
    { cmd: ['LRANGE', 'l:1', '0', '-1'] },
    { cmd: ['LPUSH', 'l:2', 'a', 'b', 'c', 'd', 'e'] },
    { cmd: ['LRANGE', 'l:2', '0', '-1'] },
    { cmd: ['LPOP', 'l:2', '2'] },
    { cmd: ['RPOP', 'l:2', '1'] },
    { cmd: ['RPUSH', 'l:3', 'x', 'y', 'x', 'z', 'x'] },
    { cmd: ['LREM', 'l:3', '1', 'x'] },
    { cmd: ['LRANGE', 'l:3', '0', '-1'] },
    { cmd: ['LREM', 'l:3', '-1', 'z'] },
    { cmd: ['LRANGE', 'l:3', '0', '-1'] },
    { cmd: ['RPUSH', 'l:4', 'a', 'b', 'c'] },
    { cmd: ['LSET', 'l:4', '1', 'B'] },
    { cmd: ['LRANGE', 'l:4', '0', '-1'] },
    { cmd: ['LSET', 'l:4', '99', 'x'], errorPrefix: 'ERR' },
    { cmd: ['RPUSH', 'l:5', 'a', 'b', 'c', 'd', 'e'] },
    { cmd: ['LTRIM', 'l:5', '1', '3'] },
    { cmd: ['LRANGE', 'l:5', '0', '-1'] },
    { cmd: ['LTRIM', 'l:5', '5', '10'] },
    { cmd: ['EXISTS', 'l:5'] },
    { cmd: ['LPUSH', 'l:6', 'a', 'b'] },
    { cmd: ['LPOS', 'l:6', 'b'] },
    { cmd: ['LPOS', 'l:6', 'zz'] },
    { cmd: ['LPUSHX', 'l:missing', 'a'] },
    { cmd: ['RPUSHX', 'l:6', 'c'] },
    { cmd: ['LRANGE', 'l:6', '0', '-1'] },
    { cmd: ['LPUSH', 'l:7', 'keep'] },
    { cmd: ['SET', 's:str', 'not-a-list'] },
    { cmd: ['LPUSH', 's:str', 'x'], errorPrefix: 'WRONGTYPE' }
  ]
};
