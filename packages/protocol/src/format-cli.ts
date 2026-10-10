/**
 * @file packages/protocol/src/format-cli.ts
 * Render a ResultEnvelope the way redis-cli prints replies.
 */
import type { RedisValue, ResultEnvelope } from './types.ts';
import { ERRORS } from './errors.ts';

/** Top-level entry: render one envelope to a display string. */
export function formatCli(envelope: ResultEnvelope): string {
  if ('error' in envelope) return `(error) ${envelope.error}`;
  return renderValue(envelope.result, '');
}

const OK_LITERALS = new Set(['OK', 'PONG', 'QUEUED']);

function scalar(v: string | number): string {
  if (typeof v === 'number') return `(integer) ${v}`;
  if (OK_LITERALS.has(v)) return v;
  return JSON.stringify(v);
}

/**
 * Render a value at the given base indent. The returned string's FIRST line is
 * never prefixed with `indent` (the caller places it inline); continuation
 * lines already carry the appropriate indentation, exactly like redis-cli.
 */
function renderValue(v: RedisValue, indent: string): string {
  if (v === null) return '(nil)';
  if (typeof v === 'number' || typeof v === 'string') return scalar(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return ERRORS.EMPTY_ARRAY;
    const parts: string[] = [];
    v.forEach((item, idx) => {
      const n = idx + 1;
      const childIndent = indent + ' '.repeat(String(n).length + 2);
      const child = renderValue(item, childIndent);
      parts.push(`${n}) ${child}`);
    });
    return parts.join(`\n${indent}`);
  }
  return String(v);
}
