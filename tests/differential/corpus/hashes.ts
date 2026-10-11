/**
 * @file tests/differential/corpus/hashes.ts
 * Hash command corpus. ≥20 steps (§14.4).
 */
import type { Corpus } from '../runner.ts';

export const hashes: Corpus = {
  family: 'hashes',
  steps: [
    { cmd: ['HSET', 'h:1', 'f1', 'v1', 'f2', 'v2'] },
    { cmd: ['HGET', 'h:1', 'f1'] },
    { cmd: ['HGET', 'h:1', 'nope'] },
    { cmd: ['HMGET', 'h:1', 'f1', 'nope'] },
    { cmd: ['HGETALL', 'h:1'], normalize: 'sort' },
    { cmd: ['HLEN', 'h:1'] },
    { cmd: ['HEXISTS', 'h:1', 'f1'] },
    { cmd: ['HEXISTS', 'h:1', 'nope'] },
    { cmd: ['HKEYS', 'h:1'], normalize: 'sort' },
    { cmd: ['HVALS', 'h:1'], normalize: 'sort' },
    { cmd: ['HSTRLEN', 'h:1', 'f1'] },
    { cmd: ['HSETNX', 'h:1', 'f1', 'other'] },
    { cmd: ['HSETNX', 'h:1', 'f3', 'v3'] },
    { cmd: ['HMSET', 'h:2', 'a', '1', 'b', '2'] },
    { cmd: ['HGETALL', 'h:2'], normalize: 'sort' },
    { cmd: ['HINCRBY', 'h:2', 'a', '10'] },
    { cmd: ['HGET', 'h:2', 'a'] },
    { cmd: ['HINCRBYFLOAT', 'h:2', 'a', '1.5'], normalize: 'float' },
    { cmd: ['HGET', 'h:2', 'a'], normalize: 'float' },
    { cmd: ['HDEL', 'h:1', 'f1'] },
    { cmd: ['HEXISTS', 'h:1', 'f1'] },
    { cmd: ['HDEL', 'h:1', 'f2', 'f3'] },
    { cmd: ['EXISTS', 'h:1'] },
    { cmd: ['HRANDFIELD', 'h:2', '1'], normalize: 'sort' },
    { cmd: ['HRANDFIELD', 'h:2', '2', 'WITHVALUES'], normalize: 'sort' },
    { cmd: ['SET', 's:str', 'not-a-hash'] },
    { cmd: ['HGET', 's:str', 'f'], errorPrefix: 'WRONGTYPE' },
    { cmd: ['HGETALL', 'h:missing'] },
    { cmd: ['HLEN', 'h:missing'] },
    { cmd: ['HSET', 'h:4'], errorPrefix: 'ERR' },
    { cmd: ['HSET', 'h:4', 'a'], errorPrefix: 'ERR' },
    { cmd: ['HSET', 'h:4', 'a', '1', 'b', '2', 'c', '3'] },
    { cmd: ['HDEL', 'h:4', 'a'] },
    { cmd: ['HDEL', 'h:4', 'a'] },
    { cmd: ['HGETALL', 'h:4'], normalize: 'sort' },
    { cmd: ['HINCRBY', 'h:4', 'b', '-1'] },
    { cmd: ['HGET', 'h:4', 'b'] },
    { cmd: ['HINCRBY', 'h:4', 'nofield', '5'] },
    { cmd: ['HGET', 'h:4', 'nofield'] },
    { cmd: ['HINCRBY', 'h:4', 'b', 'notanint'], errorPrefix: 'ERR' },
    { cmd: ['HRANDFIELD', 'h:4', '-3'] },
    { cmd: ['HRANDFIELD', 'h:missing', '3'], normalize: 'sort' }
  ]
};
