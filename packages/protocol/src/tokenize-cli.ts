/**
 * @file packages/protocol/src/tokenize-cli.ts
 * redis-cli-style line tokenizer for the web terminal and the CLI package.
 * Double quotes support escapes; single quotes are literal except `\'`.
 */
import { ProtocolError } from './errors.ts';

/**
 * Split a command line into argv tokens following redis-cli rules.
 * @throws ProtocolError('ERR Invalid argument(s)') on unbalanced quotes.
 */
export function tokenizeCli(line: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = line.length;

  while (i < n) {
    // Skip leading whitespace.
    while (i < n && isSpace(line[i] as string)) i++;
    if (i >= n) break;

    let token = '';
    let inDouble = false;
    let inSingle = false;

    while (i < n && (!isSpace(line[i] as string) || inDouble || inSingle)) {
      const c = line[i] as string;
      if (inSingle) {
        if (c === '\\' && line[i + 1] === "'") {
          token += "'";
          i += 2;
          continue;
        }
        if (c === "'") {
          inSingle = false;
          i++;
          continue;
        }
        token += c;
        i++;
        continue;
      }
      if (inDouble) {
        if (c === '\\') {
          const next = line[i + 1];
          if (next === '"') { token += '"'; i += 2; continue; }
          if (next === '\\') { token += '\\'; i += 2; continue; }
          if (next === 'n') { token += '\n'; i += 2; continue; }
          if (next === 't') { token += '\t'; i += 2; continue; }
          if (next === 'r') { token += '\r'; i += 2; continue; }
          if (next === 'x') {
            const hex = line.slice(i + 2, i + 4);
            if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new ProtocolError('ERR Invalid argument(s)');
            token += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            continue;
          }
          token += '\\';
          i++;
          continue;
        }
        if (c === '"') {
          inDouble = false;
          i++;
          continue;
        }
        token += c;
        i++;
        continue;
      }
      // Not in a quote.
      if (c === '"') { inDouble = true; i++; continue; }
      if (c === "'") { inSingle = true; i++; continue; }
      token += c;
      i++;
    }

    if (inDouble || inSingle) {
      throw new ProtocolError('ERR Invalid argument(s)');
    }
    out.push(token);
  }

  return out;
}

function isSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}
