---
title: Web auth
status: draft
last_updated: 2026-10-11
updated_by: P6-T4
code_paths:
  - apps/web/lib/auth.ts
---

# Web auth

> Clerk: users, organizations as workspaces, and the middleware that protects the
> console. `draft` until P6-T4 lands; the shape is fixed by plan §12.2–§12.4.

## Middleware

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

const isProtected = createRouteMatcher(['/redis(.*)', '/quotas(.*)', '/account(.*)']);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)'
  ]
};
```

An unauthenticated request to a protected route becomes a redirect to
`/sign-in?redirect_url=…` and comes back after signing in.

## Workspace resolution

```ts
const workspaceId = orgId ?? userId;
```

`OrganizationSwitcher` sits in the console top bar with
`afterSelectOrganizationUrl="/redis"`, so switching workspaces re-lists the
databases. `hidePersonal={false}` keeps a personal workspace available.

A database row belongs to one `workspace_id`, and `requireDatabase` filters on
it. That is the whole tenancy model.

## Appearance

`lib/clerk-appearance.ts` passes the Neo-brutalism tokens to
`<ClerkProvider appearance={…}>`: canvas background, ink text, accent primary,
`borderRadius: '0rem'`, Space Grotesk, and class overrides for the card, buttons,
inputs and switcher. Clerk renames variables between majors, so every key is
checked against the installed `@clerk/types` before it is used — keep the intent,
adjust the name.

## Environment

| Var                                               | Notes      |
| ------------------------------------------------- | ---------- |
| `CLERK_SECRET_KEY`                                | server     |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`               | client     |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL`                   | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL`                   | `/sign-up` |
| `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` | `/redis`   |
| `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` | `/redis`   |

In development Clerk runs in keyless mode, so no keys are required to develop the
console.

## E2E

`apps/web/e2e` uses `@clerk/testing` (`clerkSetup()` in global setup) with a
dedicated test user. The Settings e2e test sets the gateway's
`AUTH_CACHE_TTL_MS=1000` so token rotation can be observed within the test.

## Related

- [routes.md](./routes.md) · [data-access.md](./data-access.md) ·
  [../architecture/security-model.md](../architecture/security-model.md)
