/**
 * @file tooling/check-docs/src/checks.ts
 * Pure documentation checks. Each function returns a list of human-readable
 * problems; an empty list means the check passed. Keeping these pure makes
 * them unit-testable without touching the real filesystem.
 */

/** A source file missing the required `@file` header. */
export function checkFileHeaders(
  files: Array<{ path: string; content: string }>
): string[] {
  const problems: string[] = [];
  for (const f of files) {
    if (!f.path.endsWith('.ts') && !f.path.endsWith('.tsx')) continue;
    const header = /@file\s+\S+/.test(f.content.slice(0, 400));
    if (!header) {
      problems.push(`${f.path}: missing '@file' header`);
    }
  }
  return problems;
}

/**
 * Given the set of doc filenames under docs/ and the list of markdown links
 * found in docs/README.md, return doc files not referenced from the index.
 */
export function checkUnreferencedDocs(docFiles: string[], readmeLinks: string[]): string[] {
  const referenced = new Set(
    readmeLinks
      .map((l) => l.split('/').pop() ?? l)
      .filter((s) => s.length > 0)
  );
  const problems: string[] = [];
  for (const doc of docFiles) {
    if (doc === 'README.md') continue;
    if (!referenced.has(doc)) {
      problems.push(`docs/${doc}: not referenced from docs/README.md`);
    }
  }
  return problems;
}

/**
 * Extract relative markdown links `[text](path)` from a README's content.
 * Only returns links that look like local doc paths (not URLs).
 */
export function extractReadmeLinks(readmeContent: string): string[] {
  const links: string[] = [];
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(readmeContent)) !== null) {
    const href = m[1] ?? '';
    if (/^https?:/.test(href)) continue;
    links.push(href.replace(/^\.\//, '').replace(/^docs\//, ''));
  }
  return links;
}

/**
 * Every design-token class name found in the design-system doc must be present
 * in the provided set of token class definitions (from CSS). Returns names in
 * the doc that are missing from the CSS.
 */
export function checkDesignTokensDocumented(
  docTokenNames: string[],
  cssTokenNames: string[]
): string[] {
  const have = new Set(cssTokenNames);
  return docTokenNames.filter((n) => !have.has(n)).map((n) => `token '${n}' documented but not defined`);
}

/** Convenience: collect markdown fenced class usages like `class="btn"`. */
export function extractClassTokens(html: string): string[] {
  const out = new Set<string>();
  const re = /class="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    for (const cls of (m[1] ?? '').split(/\s+/)) {
      if (cls.startsWith('btn') || cls.startsWith('card') || cls.startsWith('chip')) {
        out.add(cls);
      }
    }
  }
  return [...out];
}
