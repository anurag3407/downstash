/**
 * @file tests/differential/corpus/zsets.ts
 * Sorted-set corpus. ≥20 steps (§14.4).
 *
 * ZSET members come back in an unspecified order for SMEMBERS-style replies,
 * so every member list is `sort`ed; score pairs are compared as text and are
 * deterministic because our ordering is (score, member).
 */
import type { Corpus } from '../runner.ts';

export const zsets: Corpus = {
  family: 'zsets',
  steps: [
    { cmd: ['ZADD', 'z:1', '1', 'a', '2', 'b', '3', 'c'] },
    { cmd: ['ZCARD', 'z:1'] },
    { cmd: ['ZSCORE', 'z:1', 'b'] },
    { cmd: ['ZSCORE', 'z:1', 'zz'] },
    { cmd: ['ZMSCORE', 'z:1', 'a', 'zz', 'c'] },
    { cmd: ['ZRANK', 'z:1', 'a'] },
    { cmd: ['ZRANK', 'z:1', 'c'] },
    { cmd: ['ZREVRANK', 'z:1', 'a'] },
    { cmd: ['ZRANGE', 'z:1', '0', '-1'] },
    { cmd: ['ZRANGE', 'z:1', '0', '1'] },
    { cmd: ['ZRANGE', 'z:1', '-1', '-1'] },
    { cmd: ['ZRANGE', 'z:1', '0', '-1', 'WITHSCORES'] },
    { cmd: ['ZRANGE', 'z:1', '0', '-1', 'withscores'] },
    { cmd: ['ZRANGE', 'z:1', '2', '3', 'BYSCORE'] },
    { cmd: ['ZRANGE', 'z:1', '(1', '3', 'BYSCORE'] },
    { cmd: ['ZRANGE', 'z:1', '-inf', '+inf', 'BYSCORE'] },
    { cmd: ['ZRANGE', 'z:1', '3', '1', 'BYSCORE', 'REV'] },
    { cmd: ['ZRANGE', 'z:1', '0', '-1', 'REV'] },
    { cmd: ['ZRANGE', 'z:1', '0', '1', 'LIMIT', '1', '1', 'BYSCORE'] },
    { cmd: ['ZCOUNT', 'z:1', '1', '2'] },
    { cmd: ['ZCOUNT', 'z:1', '(1', '3'] },
    { cmd: ['ZINCRBY', 'z:1', '5', 'a'] },
    { cmd: ['ZSCORE', 'z:1', 'a'] },
    { cmd: ['ZADD', 'z:2', 'XX', '10', 'a'] },
    { cmd: ['ZSCORE', 'z:2', 'a'] },
    { cmd: ['ZADD', 'z:2', 'NX', '99', 'a'] },
    { cmd: ['ZSCORE', 'z:2', 'a'] },
    { cmd: ['ZADD', 'z:2', 'GT', 'CH', '1', 'a', '2', 'new'] },
    { cmd: ['ZSCORE', 'z:2', 'a'] },
    { cmd: ['ZREM', 'z:1', 'a', 'zz'] },
    { cmd: ['ZCARD', 'z:1'] },
    { cmd: ['ZREMRANGEBYSCORE', 'z:1', '1', '2'] },
    { cmd: ['ZRANGE', 'z:1', '0', '-1'] },
    { cmd: ['ZREMRANGEBYRANK', 'z:1', '0', '0'] },
    { cmd: ['ZRANGE', 'z:1', '0', '-1'] },
    { cmd: ['ZADD', 'z:3', 'NX', 'GT', '1', 'a'], errorPrefix: 'ERR' },
    { cmd: ['ZADD', 'z:3', 'XX', 'NX', '1', 'a'], errorPrefix: 'ERR' },
    { cmd: ['ZADD', 'z:3', 'notafloat', 'a'], errorPrefix: 'ERR' },
    { cmd: ['ZSCORE', 'z:missing', 'a'] },
    { cmd: ['ZCARD', 'z:missing'] },
    { cmd: ['SET', 's:str', 'not-a-zset'] },
    { cmd: ['ZADD', 's:str', '1', 'a'], errorPrefix: 'WRONGTYPE' }
  ]
};
