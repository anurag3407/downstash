/**
 * @file tests/differential/corpus/index.ts
 * Aggregates every differential corpus (§14.4).
 */
import type { Corpus } from '../runner.ts';
import { strings } from './strings.ts';
import { keyspace } from './keyspace.ts';
import { hashes } from './hashes.ts';
import { lists } from './lists.ts';
import { sets } from './sets.ts';
import { zsets } from './zsets.ts';
import { server } from './server.ts';

export const CORPORA: readonly Corpus[] = [
  strings,
  keyspace,
  hashes,
  lists,
  sets,
  zsets,
  server
];

/** Total step count across every corpus (the suite asserts a floor). */
export const TOTAL_STEPS = CORPORA.reduce((n, c) => n + c.steps.length, 0);

export { strings, keyspace, hashes, lists, sets, zsets, server };
export type { Corpus };
