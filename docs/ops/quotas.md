---
title: Quotas
status: stable
last_updated: 2026-10-11
updated_by: P1-T10
code_paths:
  - supabase/migrations/20261007001200_ops_cron_stats.sql
---

# Quotas

> The free-tier ceilings, what happens at each, and where the console shows it.

## Cloudflare Workers (free)

| Limit    | Value           |
| -------- | --------------- |
| Requests | 100 000 / day   |
| CPU      | 10 ms / request |

At the daily cap Cloudflare returns `429`. `@downstash/client` treats 429 as a
failover trigger and routes to Supabase's REST endpoint until the reset. The
gateway itself just reports what it gets.

## Supabase (free)

| Limit            | Value                       |
| ---------------- | --------------------------- |
| Database size    | 500 MB                      |
| Inactivity pause | after 7 days of no activity |

The pause is the dangerous one: a paused project answers nothing, and the gateway
returns `503`. A Cron Trigger in the gateway pings the database every 6 hours
through the REST API (`src/scheduled.ts`), which Supabase counts as project
activity (ADR [0010](../adr/0010-keep-alive.md)). Internal pg_cron jobs alone do
not prove activity through the API, so the Worker trigger is not optional.

## Clerk (free)

Monthly active users, and organizations. No Downstash-side ceiling.

## Where you see it

`/quotas` in the console shows:

- **Gateway requests today** — `sum(requests)` across all databases since 00:00
  UTC, over 100 000, with the time to reset. Over the limit, the copy points at
  `@downstash/client`'s failover.
- **Database size** — `pg_database_size(current_database())` over 500 MB.
- **Keys (all databases)** — a count, no bar.
- **Background jobs** — `cron.job` joined to the latest
  `cron.job_run_details`, with a `SUCCEEDED` / `FAILED` badge per job.
- A black note card: Supabase pauses free projects after 7 days of inactivity;
  the gateway pings every 6 hours to prevent it.

The progress bars change colour at the thresholds in the design system
(secondary below 70 %, accent 70–90 %, accent with stripes above 90 %).

## Going over

1. **Gateway requests**: failover covers it, but only for `@downstash/client`
   users. `@upstash/redis` alone will see 429s until the reset.
2. **Database size**: flush a database, or shorten TTLs so the sweeper can
   reclaim. `KEYS` and `STORAGE` per database on `/redis` show where the bytes
   are.
3. **CPU per request**: keep pipelines under the 1 MB body cap and the
   1000-command cap; JSON work is O(n).

## Related

- [durability.md](./durability.md) · [runbook.md](./runbook.md) ·
  [../adr/0010-keep-alive.md](../adr/0010-keep-alive.md)
