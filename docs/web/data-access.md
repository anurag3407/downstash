---
title: Web data access
status: draft
last_updated: 2026-10-11
updated_by: P6-T5
code_paths:
  - apps/web/lib/db.ts
---

# Web data access

> How the console reaches Postgres, and why it does not use PostgREST or the
> gateway. `draft` until P6-T5 lands; the shape is fixed by plan §12.4.

## Why direct SQL

The `downstash` schema is private, so PostgREST cannot see it
(ADR [0002](../adr/0002-private-schema.md)). Going through the gateway would mean
holding the user's token server-side and losing per-workspace authorisation. The
console therefore uses the `postgres` driver against the **transaction pooler**
(ADR [0012](../adr/0012-console-direct-sql.md)).

## `apps/web/lib`

| File               | Exports                                                                    | Notes                                                                                                                                                                                                 |
| ------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db.ts`            | `sql`                                                                      | `postgres(env.DATABASE_URL, { prepare: false, max: 5, idle_timeout: 20, connect_timeout: 10 })`, cached on `globalThis` in development. `prepare: false` is **required** with the transaction pooler. |
| `crypto.ts`        | `encryptToken`, `decryptToken`                                             | AES-256-GCM, 12-byte random IV, `v1:<iv_b64>:<ct+tag_b64>`. Throws on a bad format.                                                                                                                   |
| `tokens.ts`        | `issueTokenPair`                                                           | `{standard, readonly}`, each `{token, hash, enc, hint}`                                                                                                                                               |
| `engine.ts`        | `runCommands`, `runCommand`                                                | `select downstash.console_run($1, $2::jsonb)`. Callers must have called `requireDatabase`.                                                                                                            |
| `auth.ts`          | `getWorkspace`, `requireWorkspace`, `requireDatabase`                      | `workspaceId = orgId ?? userId`; `requireDatabase` validates the uuid shape then `where id = $1 and workspace_id = $2`                                                                                |
| `action-result.ts` | `ActionResult<T>`, `ok`, `fail`, `fieldErrors`                             | codes `UNAUTHENTICATED`, `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `LIMIT`, `INTERNAL`                                                                                                                   |
| `format.ts`        | `formatBytes`, `formatNumber`, `formatTtl`, `formatDate`, `formatRelative` | uppercase where displayed as a label                                                                                                                                                                  |
| `utils.ts`         | `cn`                                                                       | `twMerge(clsx(inputs))`                                                                                                                                                                               |
| `shiki.ts`         | `highlight`                                                                | singleton highlighter, neo theme                                                                                                                                                                      |

## Feature module shape

```text
features/<feature>/
├── queries.ts      # server-only reads ('server-only')
├── actions.ts      # 'use server' mutations returning ActionResult<T>
├── schemas.ts      # zod, shared by forms and actions
├── components/     # feature components (client ones marked 'use client')
└── README.md
```

Components never call `fetch` against our own API routes. Everything goes through
a server action.

## Server action rules

```ts
'use server';
export async function renameDatabase(
  input: unknown
): Promise<ActionResult<{ name: string }>> {
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success)
    return fail(
      'VALIDATION',
      'Check the highlighted fields.',
      fieldErrors(parsed.error)
    );
  const ws = await getWorkspace();
  if (!ws) return fail('UNAUTHENTICATED', 'Sign in again.');
  const db = await findDatabase(parsed.data.dbId, ws.workspaceId);
  if (!db) return fail('NOT_FOUND', 'Database not found.');
  try {
    /* sql */
  } catch (e) {
    if (isUniqueViolation(e))
      return fail('CONFLICT', 'A database with this name already exists.');
    console.error('[settings] rename failed', { dbId: db.id });
    return fail('INTERNAL', 'Something broke. Try again.');
  }
  revalidatePath(`/redis/${db.id}`);
  return ok({ name: parsed.data.name });
}
```

Never throw across the action boundary. The client form runs the action in a
`useTransition`, shows `Button loading`, maps `fieldErrors` onto `Field error`,
and toasts `message`.

## Authorisation invariant

**Every query and action that takes a `dbId` calls `requireDatabase` first.**
That single call is what stops one workspace reading another's keys. There is no
second check, so there is no second place to forget.

## Related

- [routes.md](./routes.md) · [auth.md](./auth.md) ·
  [../architecture/security-model.md](../architecture/security-model.md) ·
  [../adr/0012-console-direct-sql.md](../adr/0012-console-direct-sql.md)
