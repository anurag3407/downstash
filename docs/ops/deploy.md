---
title: Deploy
status: stable
last_updated: 2026-10-11
updated_by: P9-T2
code_paths:
  - .github/workflows/deploy-gateway.yml
  - apps/gateway/wrangler.jsonc
---

# Deploy

> Production install, in dependency order. Budget: $0.00 / month.

## 1. Supabase

```bash
pnpm supabase login
pnpm supabase link --project-ref <ref>
pnpm db:push                          # apply migrations
psql "$DATABASE_URL" -c "select jobname from cron.job;"
# expect: downstash-ttl-sweeper, downstash-stats, downstash-retention
```

Then copy, from the dashboard:

| What                      | Used by                              |
| ------------------------- | ------------------------------------ |
| Project URL               | gateway, web, snippets               |
| Secret key                | gateway (`SUPABASE_SECRET_KEY`)      |
| Publishable key           | client failover and connect snippets |
| Transaction pooler string | web (`DATABASE_URL`), port 6543      |

Pick the free region closest to your users and note it for
`NEXT_PUBLIC_STORAGE_REGION_LABEL`.

## 2. Cloudflare

```bash
pnpm --filter @downstash/gateway exec wrangler login
pnpm --filter @downstash/gateway exec wrangler secret put SUPABASE_URL
pnpm --filter @downstash/gateway exec wrangler secret put SUPABASE_SECRET_KEY
pnpm --filter @downstash/gateway run deploy

curl https://<worker>.workers.dev/health
```

CI deploys automatically on a push to `main` that touches `apps/gateway/**` or
`packages/protocol/**` (`.github/workflows/deploy-gateway.yml`), using the
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repository secrets.

**Database migrations are not auto-applied.** `db:push` stays manual so a bad
migration cannot deploy itself. Run it, verify, then deploy the worker.

## 3. Clerk

Create an application (email + Google), optionally enable Organizations, then
create a production instance and set the domains. Copy the keys.

## 4. Vercel

Import the repository with the root directory `apps/web`. Framework: Next.js.
Install command: `pnpm i --frozen-lockfile` (Vercel detects the pnpm workspace).
Set every variable from [env-vars.md](./env-vars.md) § web.

## 5. Smoke test

1. Sign up.
2. Create a database.
3. Copy the token from the Details tab.
4. `curl -X POST https://<worker>/ -H "Authorization: Bearer <token>" -d '["PING"]'`.
5. Run the ratelimit snippet from the connect tab.

## 6. Alternative web hosting

The plan targets Vercel Hobby. Cloudflare Workers via `@opennextjs/cloudflare` is
the free, commercial-friendly alternative; it is documented here as an appendix,
not implemented in v1.

## Rollback

- Gateway: `wrangler rollback`, or redeploy the previous commit's worker.
- Web: Vercel's instant rollback.
- Database: migrations are append-only. Fix forward with a new migration; there
  is no down.

## Related

- [local-dev.md](./local-dev.md) · [env-vars.md](./env-vars.md) ·
  [../gateway/configuration.md](../gateway/configuration.md)
