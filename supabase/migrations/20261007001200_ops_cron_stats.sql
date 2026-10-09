-- ---------------------------------------------------------------------------
-- Migration 00800: ops functions, pg_cron jobs, and stats (§7.11, P1-T10)
-- ---------------------------------------------------------------------------

-- TTL sweeper: delete up to p_batch expired keys, prune stale scan_cursors.
-- Loops at most 20 batches. Returns the number of keys deleted.
create or replace function downstash.sweep_expired(p_batch int default 5000)
returns int
language plpgsql volatile set search_path = '' as $$
declare
  v_total int := 0;
  v_batch int;
  v_iter  int := 0;
begin
  loop
    exit when v_iter >= 20;
    with del as (
      delete from downstash.kv
      where expires_at is not null
        and expires_at <= now()
        and ctid in (
          select ctid from downstash.kv
          where expires_at is not null and expires_at <= now()
          limit p_batch
        )
      returning 1
    )
    select count(*) into v_batch from del;
    v_total := v_total + v_batch;
    v_iter := v_iter + 1;
    exit when v_batch = 0;
  end loop;

  -- Delete scan cursors older than 10 minutes.
  delete from downstash.scan_cursors
  where created_at < now() - interval '10 minutes';

  return v_total;
end;
$$;
comment on function downstash.sweep_expired(int) is 'Delete expired keys (up to p_batch) and stale scan cursors';

-- Daily stats rollup: per-database key count and byte size at UTC date.
create or replace function downstash.compute_stats()
returns void
language plpgsql volatile set search_path = '' as $$
begin
  insert into downstash.db_stats_daily as d (db_id, day, keys, bytes)
  select
    db_id,
    (now() at time zone 'utc')::date,
    count(*)::bigint,
    coalesce(sum(octet_length(key) + pg_column_size(val)), 0)::bigint
  from downstash.kv
  group by db_id
  on conflict (db_id, day) do update set
    keys = excluded.keys,
    bytes = excluded.bytes,
    computed_at = now();
end;
$$;
comment on function downstash.compute_stats() is 'Upsert db_stats_daily for every database';

-- ---------------------------------------------------------------------------
-- Scheduled jobs (pg_cron). Guarded: only created when pg_cron is available.
-- In Supabase these run automatically; locally they are no-ops if absent.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('downstash-ttl-sweeper', '* * * * *',
      $cron$ select downstash.sweep_expired(); $cron$);
    perform cron.schedule('downstash-stats', '*/10 * * * *',
      $cron$ select downstash.compute_stats(); $cron$);
  end if;
exception when others then
  -- pg_cron roles/schema may not exist in some environments; ignore.
  null;
end $$;
