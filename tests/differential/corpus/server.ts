/**
 * @file tests/differential/corpus/server.ts
 * Server + misc command corpus (§14.4).
 */
import type { Corpus } from '../runner.ts';

export const server: Corpus = {
  family: 'server',
  steps: [
    { cmd: ['PING'] },
    { cmd: ['PING', 'hello'] },
    { cmd: ['ECHO', 'hi'] },
    { cmd: ['DBSIZE'] },
    { cmd: ['SET', 'srv:a', '1'] },
    { cmd: ['DBSIZE'] },
    { cmd: ['TIME'] },
    { cmd: ['TYPE', 'srv:a'] },
    { cmd: ['OBJECT', 'ENCODING', 'srv:a'], errorPrefix: 'ERR' },
    { cmd: ['COMMAND', 'COUNT'] },
    { cmd: ['COMMAND', 'DOCS', 'GET'], normalize: 'sort' },
    { cmd: ['COMMAND', 'INFO', 'GET'], normalize: 'sort' },
    { cmd: ['LPUSH', 'srv:list', 'a'] },
    { cmd: ['TYPE', 'srv:list'] },
    { cmd: ['SADD', 'srv:set', 'a'] },
    { cmd: ['TYPE', 'srv:set'] },
    { cmd: ['HSET', 'srv:hash', 'f', 'v'] },
    { cmd: ['TYPE', 'srv:hash'] },
    { cmd: ['ZADD', 'srv:zset', '1', 'a'] },
    { cmd: ['TYPE', 'srv:zset'] },
    { cmd: ['TYPE', 'srv:none'] },
    { cmd: ['GET', 'srv:list'], errorPrefix: 'WRONGTYPE' },
    { cmd: ['SET', 'srv:a', '1', 'KEEPTTL'] },
    { cmd: ['GET', 'srv:a'] },
    { cmd: ['INFO'] },
    { cmd: ['SELECT', '0'], errorPrefix: 'ERR' }
  ]
};
