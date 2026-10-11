/**
 * @file tests/differential/corpus/sets.ts
 * Set command corpus. ≥20 steps (§14.4).
 */
import type { Corpus } from '../runner.ts';

export const sets: Corpus = {
  family: 'sets',
  steps: [
    { cmd: ['SADD', 'set:1', 'a', 'b', 'c'] },
    { cmd: ['SADD', 'set:1', 'a', 'd'] },
    { cmd: ['SCARD', 'set:1'] },
    { cmd: ['SISMEMBER', 'set:1', 'a'] },
    { cmd: ['SISMEMBER', 'set:1', 'zz'] },
    { cmd: ['SMISMEMBER', 'set:1', 'a', 'zz', 'b'] },
    { cmd: ['SMEMBERS', 'set:1'], normalize: 'sort' },
    { cmd: ['SADD', 'set:2', 'b', 'c', 'e'] },
    { cmd: ['SINTER', 'set:1', 'set:2'], normalize: 'sort' },
    { cmd: ['SUNION', 'set:1', 'set:2'], normalize: 'sort' },
    { cmd: ['SDIFF', 'set:1', 'set:2'], normalize: 'sort' },
    { cmd: ['SREM', 'set:1', 'a', 'zz'] },
    { cmd: ['SCARD', 'set:1'] },
    { cmd: ['SMEMBERS', 'set:1'], normalize: 'sort' },
    { cmd: ['SADD', 'set:3', 'x', 'y', 'z', 'w'] },
    { cmd: ['SPOP', 'set:3', '2'], normalize: 'sort' },
    { cmd: ['SCARD', 'set:3'] },
    { cmd: ['SRANDMEMBER', 'set:3', '2'], normalize: 'sort' },
    { cmd: ['SRANDMEMBER', 'set:3', '-5'], normalize: 'sort' },
    { cmd: ['SMEMBERS', 'set:missing'], normalize: 'sort' },
    { cmd: ['SCARD', 'set:missing'] },
    { cmd: ['SISMEMBER', 'set:missing', 'a'] },
    { cmd: ['SINTER', 'set:missing', 'set:1'] },
    { cmd: ['SUNION', 'set:missing'] },
    { cmd: ['SDIFF', 'set:1'], normalize: 'sort' },
    { cmd: ['SADD', 'set:short', 'a'], errorPrefix: 'ERR' },
    { cmd: ['SET', 's:str', 'not-a-set'] },
    { cmd: ['SADD', 's:str', 'x'], errorPrefix: 'WRONGTYPE' },
    { cmd: ['SMEMBERS', 's:str'], errorPrefix: 'WRONGTYPE' },
    { cmd: ['SADD', 'set:4', 'a', 'b', 'c', 'd', 'e', 'f'] },
    { cmd: ['SADD', 'set:5', 'c', 'd', 'e', 'f', 'g'] },
    { cmd: ['SINTER', 'set:4', 'set:5', 'set:1'], normalize: 'sort' },
    { cmd: ['SUNION', 'set:4', 'set:5', 'set:missing'], normalize: 'sort' },
    { cmd: ['SDIFF', 'set:4', 'set:5'], normalize: 'sort' },
    { cmd: ['SCARD', 'set:4'] },
    { cmd: ['SREM', 'set:4', 'a', 'b'] },
    { cmd: ['SREM', 'set:4', 'a'] },
    { cmd: ['SCARD', 'set:4'] },
    { cmd: ['SMISMEMBER', 'set:4', 'c', 'zz', 'g'] },
    { cmd: ['SMISMEMBER', 'set:4'], errorPrefix: 'ERR' },
    { cmd: ['SPOP', 'set:4', '100'], normalize: 'sort' },
    { cmd: ['EXISTS', 'set:4'] },
    { cmd: ['SADD', 'set:6', 'x', 'x', 'x'] },
    { cmd: ['SCARD', 'set:6'] }
  ]
};
