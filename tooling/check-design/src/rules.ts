/**
 * @file tooling/check-design/src/rules.ts
 * Neo-brutalism design-system guardrails (§11.7). Pure functions that scan a
 * single file's contents and return a list of violations. Kept pure for tests.
 */

/** Files allowed to hold raw hex / special styling (§11.7 allowlist). */
export const ALLOWLIST = ['lib/tokens.ts', 'lib/shiki.ts', 'lib/clerk-appearance.ts'];

export interface Violation {
  line: number;
  column: number;
  rule: string;
  message: string;
}

interface Rule {
  name: string;
  regex: RegExp;
  message: string;
}

/** The exact rule table from §11.7. */
const RULES: Rule[] = [
  { name: 'mid-radius', regex: /\brounded-(xs|sm|md|lg|xl|2xl|3xl|4xl)\b/, message: 'rounded-<size> not allowed (use rounded-none / rounded-full)' },
  { name: 'raw-hex', regex: /#[0-9a-fA-F]{3,8}\b/, message: 'raw hex color not allowed (use neo-* tokens)' },
  { name: 'blur', regex: /\b(backdrop-)?blur(-[a-z0-9]+)?\b/, message: 'blur not allowed' },
  { name: 'gradient', regex: /\bbg-(gradient|linear|radial|conic)-/, message: 'gradient background not allowed' },
  { name: 'grays', regex: /\b(gray|slate|zinc|neutral|stone)-\d{2,3}\b/, message: 'gray palette not allowed (no grays)' },
  { name: 'soft-easing', regex: /\bease-in-out\b|\bease-in\b/, message: 'soft easing not allowed (use ease-linear / ease-out)' },
  { name: 'light-weight', regex: /\bfont-(thin|extralight|light|normal)\b/, message: 'light font weight not allowed' },
  { name: 'slow-motion', regex: /\bduration-(500|700|1000)\b/, message: 'slow motion not allowed (duration-100/200/300)' },
  { name: 'default-shadow', regex: /\bshadow-(sm|md|lg|xl|2xl|inner)\b/, message: 'soft shadow not allowed (use shadow-neo-*)' },
  { name: 'inline-style', regex: /style=\{\{[^}]*(color|background|boxShadow|borderRadius)/, message: 'inline color/shadow/radius style not allowed' }
];

/** True if the given path is on the allowlist. */
export function isAllowlisted(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/');
  return ALLOWLIST.some((a) => normalized.endsWith(a));
}

/**
 * Scan one file. Returns violations with 1-based line and column numbers.
 * @param content file text
 * @param relPath path relative to apps/web, used only for reporting
 */
export function scanContent(content: string, relPath = '(memory)'): Violation[] {
  if (isAllowlisted(relPath)) return [];
  const violations: Violation[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] as string;
    for (const rule of RULES) {
      const re = new RegExp(rule.regex.source, rule.regex.flags);
      const m = re.exec(line);
      if (m) {
        violations.push({
          line: i + 1,
          column: (m.index ?? 0) + 1,
          rule: rule.name,
          message: rule.message
        });
      }
    }
  }
  return violations;
}
