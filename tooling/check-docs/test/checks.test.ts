/**
 * @file tooling/check-docs/test/checks.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  checkFileHeaders,
  checkUnreferencedDocs,
  extractReadmeLinks,
  extractClassTokens
} from '../src/checks.ts';

describe('checkFileHeaders', () => {
  it('flags files missing @file header', () => {
    const problems = checkFileHeaders([
      { path: 'a.ts', content: 'export const x = 1;' }
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('@file');
  });
  it('passes files with @file header', () => {
    const problems = checkFileHeaders([
      { path: 'a.ts', content: '/**\n * @file a.ts\n */\nexport const x=1;' }
    ]);
    expect(problems).toHaveLength(0);
  });
});

describe('checkUnreferencedDocs', () => {
  it('flags doc files not in the index', () => {
    expect(checkUnreferencedDocs(['progress.md'], [])).toHaveLength(1);
  });
  it('passes referenced docs', () => {
    expect(checkUnreferencedDocs(['progress.md'], ['progress.md'])).toHaveLength(0);
  });
  it('ignores README.md itself', () => {
    expect(checkUnreferencedDocs(['README.md'], [])).toHaveLength(0);
  });
});

describe('extractReadmeLinks', () => {
  it('extracts local links and skips URLs', () => {
    const links = extractReadmeLinks(
      '[a](progress.md) [b](https://x.com) [c](./codemap.md)'
    );
    expect(links).toEqual(['progress.md', 'codemap.md']);
  });
});

describe('extractClassTokens', () => {
  it('collects btn/card/chip classes', () => {
    const out = extractClassTokens('<div class="btn btn-primary card">x</div>');
    expect(out).toContain('btn');
    expect(out).toContain('btn-primary');
    expect(out).toContain('card');
  });
});
