---
title: Web routes
status: draft
last_updated: 2026-10-11
updated_by: P7-T1
code_paths:
  - apps/web/app
---

# Web routes

> The Next.js 15 App Router tree, what each route renders, and where its data
> comes from. `draft` until P7-T7 lands; the tree and the data sources are fixed
> by plan §12.2.

## Route tree

```text
apps/web/app/
├── layout.tsx                    # html/body, fonts, ClerkProvider(appearance), Toaster
├── globals.css                   # Neo-brutalism tokens
├── icon.svg
├── not-found.tsx                 # brutalist 404
├── error.tsx                     # brutalist error boundary ('use client')
├── (marketing)/
│   ├── layout.tsx                # MarketingNav + MarketingFooter
│   └── page.tsx                  # Landing (§12.11)
├── (auth)/
│   ├── layout.tsx                # 60/40 split: brand panel + form panel
│   ├── sign-in/[[...sign-in]]/page.tsx
│   └── sign-up/[[...sign-up]]/page.tsx
└── (console)/
    ├── layout.tsx                # ConsoleTopBar + bg-grid canvas + Container
    ├── redis/
    │   ├── page.tsx              # Database list
    │   ├── loading.tsx
    │   └── [dbId]/
    │       ├── layout.tsx        # requireDatabase, DatabaseHeader, NavTabs
    │       ├── page.tsx          # Details
    │       ├── usage/page.tsx    # Usage charts
    │       ├── browser/page.tsx  # Data browser
    │       ├── cli/page.tsx      # Web terminal
    │       ├── settings/page.tsx # Rename, L1, credentials, flush, delete
    │       └── not-found.tsx
    ├── quotas/page.tsx
    └── account/[[...rest]]/page.tsx
```

## Upstash → Downstash

| Upstash console         | Downstash route                                         |
| ----------------------- | ------------------------------------------------------- |
| Redis database list     | `/redis`                                                |
| Create database modal   | Dialog on `/redis`                                      |
| Details / connect       | `/redis/[dbId]`                                         |
| Usage                   | `/redis/[dbId]/usage`                                   |
| Data browser            | `/redis/[dbId]/browser`                                 |
| CLI                     | `/redis/[dbId]/cli`                                     |
| Settings                | `/redis/[dbId]/settings`                                |
| Account / team switcher | Clerk `OrganizationSwitcher` + `UserButton`, `/account` |
| Billing / usage limits  | `/quotas`                                               |

## Data sources

| Route                    | Reads                                                                      | Mutations                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/redis`                 | `features/databases/queries.ts` → `listDatabases(workspaceId)`             | `createDatabase`                                                                                           |
| `/redis/[dbId]`          | `requireDatabase` + details queries                                        | —                                                                                                          |
| `/redis/[dbId]/usage`    | range buckets from `usage_hourly` and `db_stats_daily`, zero-filled in SQL | —                                                                                                          |
| `/redis/[dbId]/browser`  | `SCAN`-driven `scanKeys`, `getKey`                                         | `saveString`, `hashSet`, `listPush`, `setAdd`, `zsetAdd`, `setTtl`, `persistKey`, `deleteKey`, `createKey` |
| `/redis/[dbId]/cli`      | —                                                                          | `execCli` → `tokenizeCli` → `runCommands`                                                                  |
| `/redis/[dbId]/settings` | settings queries                                                           | `renameDatabase`, `updateL1`, `rotateToken`, `flushDatabase`, `deleteDatabase`                             |
| `/quotas`                | cron + size + requests                                                     | —                                                                                                          |
| `/account`               | —                                                                          | —                                                                                                          |

## Middleware

```ts
const isProtected = createRouteMatcher(['/redis(.*)', '/quotas(.*)', '/account(.*)']);
export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});
```

## Related

- [data-access.md](./data-access.md) · [auth.md](./auth.md) ·
  [features.md](./features.md) · [../design/patterns.md](../design/patterns.md)
