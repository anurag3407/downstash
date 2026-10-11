---
title: Runbook
status: stable
last_updated: 2026-10-11
updated_by: P1-T10
code_paths:
  - apps/gateway/src/storage/postgrest-storage.ts
  - supabase/migrations/20261007001200_ops_cron_stats.sql
---

# Runbook

> Symptom → diagnosis → fix. Start at the top of the table.

| Symptom                                                  | Diagnosis                                                                                                                            | Fix                                                                                                                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway returns `503 ERR Downstash: storage unavailable` | Supabase paused, wrong keys, or a 5xx after two retries. Check `GET /health`: it reports `storage: unavailable` when the ping fails. | Confirm the project is not paused. Re-check `SUPABASE_URL` / `SUPABASE_SECRET_KEY` (`wrangler secret list`). Restart the project from the Supabase dashboard.    |
| `401 Unauthorized` for a token you know is valid         | Revoked, rotated and the cache has not expired (up to 60 s), or the token is for another database.                                   | Check `downstash.tokens.revoked_at`. Wait 60 s. Re-issue from Settings.                                                                                          |
| `401` immediately, for every token                       | The gateway cannot reach the RPC, so the cache was populated with a negative entry.                                                  | Same as the 503 row; confirm the anon-facing functions are reachable.                                                                                            |
| Cloudflare returns `429` all day                         | The 100 000/day free cap is hit.                                                                                                     | Check `/quotas` for the reset time. Point the client at `@downstash/client` so it fails over to Supabase.                                                        |
| Database near 500 MB                                     | Many keys, or large values.                                                                                                          | `/redis` shows `KEYS` and `STORAGE` per database. Flush the ones you do not need, shorten TTLs so the sweeper reclaims.                                          |
| Expired keys still present                               | The pg_cron sweeper is failing.                                                                                                      | `select jobname, status from cron.job_run_details where status <> 'succeeded' order by start_time desc limit 10;` then look at `cron.job` for a disabled job.    |
| Background jobs are all `FAILED`                         | pg_cron not scheduled or the migration did not run.                                                                                  | `select jobname from cron.job;` should list `downstash-ttl-sweeper`, `downstash-stats`, `downstash-retention`. Re-apply the migration if not.                    |
| All keys vanished                                        | An unclean Postgres restart truncated the `UNLOGGED` keyspace.                                                                       | Expected for cache-grade data. See [durability.md](./durability.md); run `pnpm db:durable` if this cannot recur.                                                 |
| `ERR deadlock detected` from a pipeline                  | Two transactions locked keys in opposite order.                                                                                      | The gateway retries `40P01` twice. If it persists, look for a client issuing overlapping key sets in one pipeline — report it, the engine locks in sorted order. |
| A command returns `WRONGTYPE` where you expected a value | The key holds a different type.                                                                                                      | `TYPE key` in the console CLI. `DEL` and recreate, or use a different key.                                                                                       |
| The CLI says `(error) ERR unknown command`               | The command is not in the registry.                                                                                                  | `docs/engine/commands.md` lists what v1.0 supports. BYLEX, Pub/Sub, Streams and RESP are out of scope.                                                           |

## Logs

- Gateway: `pnpm --filter @downstash/gateway exec wrangler tail` — one-line JSON
  for 5xx and cron only. Tokens, hashes, keys and values are never logged.
- Web: server-side `console.error('[module] message', { safeFields })`.
- Postgres: `select * from cron.job_run_details order by start_time desc limit 20;`
  for scheduled work.

## Related

- [quotas.md](./quotas.md) · [deploy.md](./deploy.md) ·
  [../gateway/auth.md](../gateway/auth.md)
