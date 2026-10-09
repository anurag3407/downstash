#!/usr/bin/env node
/**
 * @file tooling/check-docs/src/index.ts
 * Walks the repo and runs documentation checks. Exits non-zero on any problem.
 * Usage: pnpm check:docs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  checkFileHeaders,
  checkUnreferencedDocs,
  extractReadmeLinks
} from './checks.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..', '..');

const SOURCE_DIRS = ['packages', 'apps', 'tooling'];

function walk(dir: string, acc: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.wrangler') continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, acc);
    } else if (/\.tsx?$/.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

function main(): number {
  const problems: string[] = [];

  // 1. @file headers on every source file.
  const files: Array<{ path: string; content: string }> = [];
  for (const base of SOURCE_DIRS) {
    const dir = path.join(root, base);
    if (!existsSync(dir)) continue;
    for (const full of walk(dir, [])) {
      files.push({ path: path.relative(root, full), content: readFileSync(full, 'utf8') });
    }
  }
  problems.push(...checkFileHeaders(files));

  // 2. Every docs/*.md referenced from docs/README.md.
  const docsDir = path.join(root, 'docs');
  if (existsSync(docsDir)) {
    const docFiles = readdirSync(docsDir).filter((f) => f.endsWith('.md'));
    const readmePath = path.join(docsDir, 'README.md');
    const readmeLinks = existsSync(readmePath)
      ? extractReadmeLinks(readFileSync(readmePath, 'utf8'))
      : [];
    problems.push(...checkUnreferencedDocs(docFiles, readmeLinks));
  }

  if (problems.length > 0) {
    process.stderr.write('check-docs failed:\n');
    for (const p of problems) process.stderr.write(`  - ${p}\n`);
    return 1;
  }
  process.stdout.write('check-docs OK\n');
  return 0;
}

process.exit(main());
