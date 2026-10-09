/**
 * @file tooling/check-design/test/rules.test.ts
 */

import { describe, expect, it } from 'vitest';
import { ALLOWLIST, isAllowlisted, scanContent } from '../src/rules.ts';

describe('isAllowlisted', () => {
  it('allows tokens/shiki/clerk-appearance', () => {
    expect(isAllowlisted('apps/web/lib/tokens.ts')).toBe(true);
    expect(isAllowlisted('lib/shiki.ts')).toBe(true);
    expect(isAllowlisted('lib/clerk-appearance.ts')).toBe(true);
  });
  it('blocks other files', () => {
    expect(isAllowlisted('app/page.tsx')).toBe(false);
  });
});

describe('scanContent', () => {
  it('flags rounded-md', () => {
    const v = scanContent('<div className="rounded-md" />', 'app/x.tsx');
    expect(v.some((x) => x.rule === 'mid-radius')).toBe(true);
  });
  it('flags raw hex', () => {
    const v = scanContent('<div className="text-[#FF6B6B]" />', 'app/x.tsx');
    expect(v.some((x) => x.rule === 'raw-hex')).toBe(true);
  });
  it('flags grays', () => {
    expect(scanContent('text-gray-500', 'a.tsx').some((x) => x.rule === 'grays')).toBe(true);
  });
  it('flags ease-in-out', () => {
    expect(scanContent('ease-in-out', 'a.tsx').some((x) => x.rule === 'soft-easing')).toBe(true);
  });
  it('flags default shadow-md', () => {
    expect(scanContent('shadow-md', 'a.tsx').some((x) => x.rule === 'default-shadow')).toBe(true);
  });
  it('allows shadow-neo-md', () => {
    expect(scanContent('shadow-neo-md', 'a.tsx')).toHaveLength(0);
  });
  it('respects allowlist', () => {
    expect(scanContent('#FF6B6B', 'lib/tokens.ts')).toHaveLength(0);
  });
  it('reports 1-based line numbers', () => {
    const v = scanContent('ok\nrounded-lg', 'a.tsx');
    expect(v[0]?.line).toBe(2);
  });
  it('passes clean neo-brutalist markup', () => {
    const clean =
      'border-4 border-black rounded-none shadow-neo-sm bg-neo-accent text-black ease-linear duration-100';
    expect(scanContent(clean, 'app/x.tsx')).toHaveLength(0);
  });
});
