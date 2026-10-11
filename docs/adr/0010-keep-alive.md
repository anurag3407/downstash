---
title: Keep-alive
status: stable
last_updated: 2026-10-11
updated_by: P3-T6
---

# 0010. Keep-alive

- **Status:** Accepted
- **Date:** 2026-10-07
- **Related tasks:** P3-T6

## Context

The PRD claims pg_cron prevents the 7-day Supabase pause. Supabase measures
activity through its **API**, and an internal `cron.schedule` job runs inside the
database — it may not count. A paused project is a total outage.

## Decision

Two independent mechanisms:

1. `pg_cron` jobs for the actual work: `downstash-ttl-sweeper` (every minute),
   `downstash-stats` (every 10 minutes), `downstash-retention` (daily).
2. A **Worker Cron Trigger** every 6 hours that calls
   `public.downstash_gw_ping` over PostgREST (`apps/gateway/src/scheduled.ts`),
   logging one line of JSON.

Verified locally with `wrangler dev --test-scheduled` and
`curl ':8787/__scheduled?cron=0+*/6+*+*'`, which logs
`{"level":"info","msg":"keepalive","ok":true,...}`.

## Consequences

**Positive**

- The free project stays awake through a real API call, not a guess.
- The ping is also the gateway's health signal: `GET /health` reports
  `storage: unavailable` when it fails.

**Negative**

- One more scheduled thing that can fail, and a Cron Trigger to keep configured.
- 4 pings a day is enough for the pause rule but means a real outage can look
  like a pause for up to 6 hours if the trigger is silent.

## Alternatives considered

| Alternative                | Why not                            |
| -------------------------- | ---------------------------------- |
| pg_cron only               | Untested against the pause rule    |
| An external uptime service | A paid or account-gated dependency |
