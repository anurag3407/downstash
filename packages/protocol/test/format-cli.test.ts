/**
 * @file packages/protocol/test/format-cli.test.ts
 */

import { describe, expect, it } from 'vitest';
import { formatCli } from '../src/format-cli.ts';

describe('formatCli', () => {
  const cases: Array<{
    envelope: { result: unknown } | { error: string };
    expected: string;
  }> = [
    { envelope: { error: 'ERR no such key' }, expected: '(error) ERR no such key' },
    { envelope: { result: null }, expected: '(nil)' },
    { envelope: { result: 42 }, expected: '(integer) 42' },
    { envelope: { result: -1 }, expected: '(integer) -1' },
    { envelope: { result: 0 }, expected: '(integer) 0' },
    { envelope: { result: 'OK' }, expected: 'OK' },
    { envelope: { result: 'PONG' }, expected: 'PONG' },
    { envelope: { result: 'QUEUED' }, expected: 'QUEUED' },
    { envelope: { result: 'hello' }, expected: '"hello"' },
    { envelope: { result: '' }, expected: '""' },
    { envelope: { result: 'with "quotes"' }, expected: '"with \\"quotes\\""' },
    { envelope: { result: [] }, expected: '(empty array)' },
    { envelope: { result: ['a', 'b'] }, expected: '1) "a"\n2) "b"' },
    {
      envelope: { result: [1, 2, 3] },
      expected: '1) (integer) 1\n2) (integer) 2\n3) (integer) 3'
    },
    { envelope: { result: ['a', null, 'c'] }, expected: '1) "a"\n2) (nil)\n3) "c"' },
    {
      envelope: { result: [['a', 'b'], ['c']] },
      expected: '1) 1) "a"\n   2) "b"\n2) 1) "c"'
    },
    { envelope: { result: [['x']] }, expected: '1) 1) "x"' },
    {
      envelope: { result: ['f1', 'v1', 'f2', 'v2'] },
      expected: '1) "f1"\n2) "v1"\n3) "f2"\n4) "v2"'
    },
    { envelope: { result: ['OK', 5] }, expected: '1) OK\n2) (integer) 5' }
  ];

  for (const c of cases) {
    it(`renders ${JSON.stringify(c.envelope)}`, () => {
      expect(formatCli(c.envelope as never)).toBe(c.expected);
    });
  }

  it('renders 10+ items with two-digit numbering', () => {
    const arr = Array.from({ length: 12 }, (_, i) => `v${i}`);
    const lines = formatCli({ result: arr }).split('\n');
    expect(lines).toHaveLength(12);
    expect(lines[9]).toBe('10) "v9"');
    expect(lines[11]).toBe('12) "v11"');
  });
});
