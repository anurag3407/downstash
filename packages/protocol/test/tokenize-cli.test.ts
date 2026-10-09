/**
 * @file packages/protocol/test/tokenize-cli.test.ts
 */

import { describe, expect, it } from 'vitest';
import { ProtocolError } from '../src/errors.ts';
import { tokenizeCli } from '../src/tokenize-cli.ts';

describe('tokenizeCli', () => {
  const cases: Array<{ input: string; expected: string[] | 'throw' }> = [
    { input: 'PING', expected: ['PING'] },
    { input: 'SET foo bar', expected: ['SET', 'foo', 'bar'] },
    { input: '  SET   foo   bar  ', expected: ['SET', 'foo', 'bar'] },
    { input: 'SET\tfoo\tbar', expected: ['SET', 'foo', 'bar'] },
    { input: 'SET foo "hello world"', expected: ['SET', 'foo', 'hello world'] },
    { input: "SET foo 'hello world'", expected: ['SET', 'foo', 'hello world'] },
    { input: 'SET foo "a\\"b"', expected: ['SET', 'foo', 'a"b'] },
    { input: 'SET foo "a\\\\b"', expected: ['SET', 'foo', 'a\\b'] },
    { input: 'SET foo "a\\nb"', expected: ['SET', 'foo', 'a\nb'] },
    { input: 'SET foo "a\\tb"', expected: ['SET', 'foo', 'a\tb'] },
    { input: 'SET foo "a\\rb"', expected: ['SET', 'foo', 'a\rb'] },
    { input: 'SET foo "a\\x41b"', expected: ['SET', 'foo', 'aAb'] },
    { input: "SET foo 'a\\'b'", expected: ['SET', 'foo', "a'b"] },
    { input: "SET foo 'a\\nb'", expected: ['SET', 'foo', 'a\\nb'] }, // single quotes literal
    { input: 'SET foo ""', expected: ['SET', 'foo', ''] },
    { input: 'SET foo "" bar', expected: ['SET', 'foo', '', 'bar'] },
    { input: 'HSET h f1 v1 f2 v2', expected: ['HSET', 'h', 'f1', 'v1', 'f2', 'v2'] },
    { input: 'LPUSH mylist "1" "2" "3"', expected: ['LPUSH', 'mylist', '1', '2', '3'] },
    { input: 'GET "key with spaces"', expected: ['GET', 'key with spaces'] },
    { input: 'ECHO "  padded  "', expected: ['ECHO', '  padded  '] },
    { input: '', expected: [] },
    { input: '    ', expected: [] },
    { input: 'a"b"c', expected: ['abc'] },
    { input: 'MSET k1 v1 k2 v2', expected: ['MSET', 'k1', 'v1', 'k2', 'v2'] },
    { input: 'SET foo "with \\"quotes\\" inside"', expected: ['SET', 'foo', 'with "quotes" inside'] },
    { input: 'key*', expected: ['key*'] },
    { input: 'KEYS user:*', expected: ['KEYS', 'user:*'] },
    { input: 'SET foo "unbalanced', expected: 'throw' },
    { input: "SET foo 'unbalanced", expected: 'throw' },
    { input: 'SET foo "bad\\xZZ"', expected: 'throw' }
  ];

  for (const c of cases) {
    it(`${JSON.stringify(c.input)} → ${c.expected === 'throw' ? 'throws' : JSON.stringify(c.expected)}`, () => {
      if (c.expected === 'throw') {
        expect(() => tokenizeCli(c.input)).toThrow(ProtocolError);
      } else {
        expect(tokenizeCli(c.input)).toEqual(c.expected);
      }
    });
  }
});
