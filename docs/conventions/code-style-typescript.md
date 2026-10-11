---
title: Code style (TypeScript)
status: stable
last_updated: 2026-10-11
updated_by: P0-T2
code_paths:
  - packages/protocol/src/commands.ts
  - packages/client/src/transport.ts
---

# Code style (TypeScript)

> How TypeScript reads in this repo. The compiler options are in
> `tsconfig.base.json`; this file covers everything the compiler cannot
> enforce.

## Compiler settings

`tsconfig.base.json` is shared by every package. The load-bearing ones are
`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and
`verbatimModuleSyntax`. A package may tighten, never loosen.

## Rules

| Rule                 | Detail                                                                                                                                                              |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `any`             | Use `unknown` and narrow. `// eslint-disable` needs a reason comment on the line above.                                                                             |
| Named exports        | Default exports only where a framework requires them (Next.js `page.tsx`, `layout.tsx`, `route.ts`, the Worker's `index.ts`).                                       |
| File names           | `kebab-case.ts(x)`. Exceptions: Next.js route files (`page.tsx`, `layout.tsx`, `not-found.tsx`, `route.ts`).                                                        |
| React components     | `PascalCase` export.                                                                                                                                                |
| Types                | `PascalCase`. Constants `SCREAMING_SNAKE_CASE`.                                                                                                                     |
| Imports              | Node builtins → external → `@downstash/*` → `@/` → relative, one blank line between groups.                                                                         |
| Extension in imports | `./foo.ts`, not `./foo`. `allowImportingTsExtensions` is on, which keeps the packages honest without a bundler alias.                                               |
| Null vs undefined    | `undefined` for "not provided"; `null` only when a wire format demands it (a Redis nil reply, a nullable column).                                                   |
| Errors               | One error class per package boundary (`ProtocolError`, `DownstashError`, `StorageUnavailableError`). Throw with structured fields, never with a stringified object. |

## Shape of a module

```ts
/**
 * @file packages/client/src/transport.ts
 * One-line summary, then the §-reference that specified it.
 */
import { ... } from 'external';
import { ... } from '@downstash/protocol';

// module-level constants, SCREAMING_SNAKE_CASE
const DEFAULT_TIMEOUT_MS = 5000;

/** TSDoc: summary, then @param/@returns/@throws where non-obvious. */
export function doThing(input: string): number {
  ...
}
```

## Comments

Explain why, invariants and gotchas. Do not narrate what the next line does.
Where behaviour comes from a spec section, reference it (`§9.7`); where it comes
from a bug, say which one (`// pg_local_reset creates the role, not postgres`).

## Testing

Vitest, colocated in `test/` inside the package. See
[testing.md](./testing.md).

## Related

- [code-style-sql.md](./code-style-sql.md) · [code-style-react.md](./code-style-react.md)
