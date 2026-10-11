/**
 * @file tests/sql/helpers.test.ts
 * Table-driven tests for the numeric parsing and glob helpers (§7.5, P1-T2).
 * ≥ 40 cases across to_int / to_float / fmt_float / glob_to_regex / glob_prefix.
 */
import { describe, expect, it } from 'vitest';
import { sql } from '../helpers/sql.ts';

async function intOrThrow(v: string): Promise<string | 'THROW'> {
  try {
    const rows = await sql<{ v: string }[]>`select downstash.to_int(${v})::text as v`;
    return rows[0]?.v ?? '';
  } catch (e) {
    expect(String(e)).toMatch(/integer or out of range/);
    return 'THROW';
  }
}

describe('downstash.to_int', () => {
  const ok: Array<[string, string]> = [
    ['0', '0'],
    ['1', '1'],
    ['-1', '-1'],
    ['9223372036854775807', '9223372036854775807'],
    ['-9223372036854775808', '-9223372036854775808'],
    ['123', '123'],
    ['-42', '-42'],
    ['1000000000000', '1000000000000']
  ];
  for (const [input, out] of ok) {
    it(`accepts ${input}`, async () => {
      const rows = await sql<
        { v: string }[]
      >`select downstash.to_int(${input})::text as v`;
      expect(rows[0]?.v).toBe(out);
    });
  }

  const bad = [
    '-0',
    '01',
    '007',
    '+5',
    ' 5',
    '5 ',
    '5.0',
    '1e3',
    '',
    'abc',
    '0x10',
    '9223372036854775808',
    '-9223372036854775809'
  ];
  for (const input of bad) {
    it(`rejects ${JSON.stringify(input)}`, async () => {
      expect(await intOrThrow(input)).toBe('THROW');
    });
  }
});

describe('downstash.to_float', () => {
  it('parses plain floats', async () => {
    const rows = await sql<{ v: number }[]>`select downstash.to_float('3.14') as v`;
    expect(rows[0]?.v).toBeCloseTo(3.14);
  });
  it('parses integers as floats', async () => {
    const rows = await sql<{ v: number }[]>`select downstash.to_float('5') as v`;
    expect(rows[0]?.v).toBe(5);
  });
  it('parses scientific notation', async () => {
    const rows = await sql<{ v: number }[]>`select downstash.to_float('1e3') as v`;
    expect(rows[0]?.v).toBe(1000);
  });
  it('parses leading-dot', async () => {
    const rows = await sql<{ v: number }[]>`select downstash.to_float('.5') as v`;
    expect(rows[0]?.v).toBe(0.5);
  });
  it('rejects nan by default', async () => {
    await expect(sql`select downstash.to_float('nan')`).rejects.toThrow();
  });
  it('rejects inf by default', async () => {
    await expect(sql`select downstash.to_float('inf')`).rejects.toThrow();
  });
  it('accepts inf when allowed', async () => {
    const rows = await sql<
      { v: number }[]
    >`select downstash.to_float('inf', true) as v`;
    expect(rows[0]?.v).toBe(Infinity);
  });
  it('accepts -inf when allowed', async () => {
    const rows = await sql<
      { v: number }[]
    >`select downstash.to_float('-inf', true) as v`;
    expect(rows[0]?.v).toBe(-Infinity);
  });
  it('rejects garbage', async () => {
    await expect(sql`select downstash.to_float('abc')`).rejects.toThrow();
  });
});

describe('downstash.fmt_float', () => {
  const cases: Array<[number, string]> = [
    [5, '5'],
    [5.5, '5.5'],
    [0, '0'],
    [-3.25, '-3.25'],
    [1.5, '1.5'],
    [10, '10']
  ];
  for (const [input, out] of cases) {
    it(`formats ${input} → ${out}`, async () => {
      const rows = await sql<
        { v: string }[]
      >`select downstash.fmt_float(${input}::double precision) as v`;
      expect(rows[0]?.v).toBe(out);
    });
  }
  it('formats infinity → inf', async () => {
    const rows = await sql<
      { v: string }[]
    >`select downstash.fmt_float('infinity'::double precision) as v`;
    expect(rows[0]?.v).toBe('inf');
  });
  it('formats -infinity → -inf', async () => {
    const rows = await sql<
      { v: string }[]
    >`select downstash.fmt_float('-infinity'::double precision) as v`;
    expect(rows[0]?.v).toBe('-inf');
  });
});

describe('downstash.glob_to_regex / glob_prefix', () => {
  // [pattern, glob_to_regex, glob_prefix]
  const cases: Array<[string, string, string]> = [
    ['*', '^.*$', ''],
    ['foo', '^foo$', 'foo'],
    ['foo*', '^foo.*$', 'foo'],
    ['h?llo', '^h.llo$', 'h'],
    ['h[ae]llo', '^h[ae]llo$', 'h'],
    ['user:*', '^user:.*$', 'user:'],
    ['foo\\*bar', '^foo\\*bar$', 'foo\\*bar'],
    ['a.b', '^a\\.b$', 'a.b'],
    ['prefix*suffix', '^prefix.*suffix$', 'prefix'],
    ['[', '^[$', '']
  ];
  for (const [pattern, regex, prefix] of cases) {
    it(`glob_to_regex(${JSON.stringify(pattern)})`, async () => {
      const rows = await sql<
        { v: string }[]
      >`select downstash.glob_to_regex(${pattern}) as v`;
      expect(rows[0]?.v).toBe(regex);
    });
    it(`glob_prefix(${JSON.stringify(pattern)})`, async () => {
      const rows = await sql<
        { v: string }[]
      >`select downstash.glob_prefix(${pattern}) as v`;
      expect(rows[0]?.v).toBe(prefix);
    });
  }

  it('glob_to_regex compiles and matches', async () => {
    const rows = await sql<{ m: boolean }[]>`
      select 'hello' ~ downstash.glob_to_regex('h?llo') as m
    `;
    expect(rows[0]?.m).toBe(true);
  });
  it('glob_to_regex does not match when it should not', async () => {
    const rows = await sql<{ m: boolean }[]>`
      select 'hxxllo' ~ downstash.glob_to_regex('h?llo') as m
    `;
    expect(rows[0]?.m).toBe(false);
  });
});
