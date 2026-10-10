#!/usr/bin/env node
/**
 * @file tooling/check-design/src/index.ts
 * Scans apps/web source files for off-brand styling. Exits non-zero on any hit.
 * Usage: pnpm check:design
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanContent } from './rules.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');
const webRoot = path.join(root, 'apps', 'web');
const SCAN_DIRS = ['app', 'components', 'features', 'lib'];

function walk(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

function main(): number {
  if (!existsSync(webRoot)) {
    process.stdout.write('check-design: apps/web not present, skipping\n');
    return 0;
  }
  const violations: Array<{
    file: string;
    line: number;
    column: number;
    rule: string;
    message: string;
  }> = [];
  for (const base of SCAN_DIRS) {
    const dir = path.join(webRoot, base);
    if (!existsSync(dir)) continue;
    for (const full of walk(dir, [])) {
      const rel = path.relative(webRoot, full);
      const content = readFileSync(full, 'utf8');
      for (const v of scanContent(content, rel)) {
        violations.push({ file: rel, ...v });
      }
    }
  }

  if (violations.length > 0) {
    process.stderr.write('check-design failed:\n');
    for (const v of violations) {
      process.stderr.write(
        `  ${v.file}:${v.line}:${v.column} [${v.rule}] ${v.message}\n`
      );
    }
    return 1;
  }
  process.stdout.write('check-design OK\n');
  return 0;
}

process.exit(main());
