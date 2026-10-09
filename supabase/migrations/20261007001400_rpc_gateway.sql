-- @file RPC surface (§7.5.3–7.5.4): the functions the gateway and the client
-- failover path call over PostgREST. `downstash_gw_*` are service_role only and
-- take a pre-hashed token; `downstash_exec/_pipeline/_multi` are the anon-facing
-- failover endpoints and take a raw token.
-- @see docs/engine/rpc.md

-- ---------------------------------------------------------------------------
-- 7.5.3 public.downstash_gw_run — the gateway hot path.
-- ---------------------------------------------------------------------------
create or replace function public.downstash_gw_run(
  p_token_hash text,
  p_mode text,
  p_commands jsonb,
  p_l1_hits integer default 0,
  p_bytes_in bigint default 0,
  p_bytes_out bigint default 0
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id        uuid;
  v_kind      text;
  v_l1        integer;
  v_ro        boolean;
  v_results   jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'Unauthorized');
  end if;
  if p_mode not in ('single', 'pipeline', 'multi') then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'ERR Downstash: invalid mode');
  end if;

  select d.id, t.kind, d.l1_ttl_ms
    into v_id, v_kind, v_l1
  from downstash.tokens t
  join downstash.databases d on d.id = t.db_id
  where t.token_hash = decode(p_token_hash, 'hex')
    and t.revoked_at is null;

  if not found then
    return jsonb_build_object('ok', false, 'status', 401, 'error', 'Unauthorized');
  end if;

  if p_mode = 'single' and jsonb_array_length(p_commands) <> 1 then
    return jsonb_build_object('ok', false, 'status', 400, 'error', 'ERR Downstash: invalid mode');
  end if;

  v_ro := (v_kind = 'readonly');

  begin
    v_results := downstash.run(v_id, v_ro, p_commands, 'gateway', p_l1_hits, p_bytes_in, p_bytes_out);
  exception
    when sqlstate 'DS000' then
      return jsonb_build_object('ok', false, 'status', 400, 'error', SQLERRM);
  end;

  return jsonb_build_object(
    'ok', true,
    'db', v_id,
    'readonly', v_ro,
    'l1TtlMs', v_l1,
    'results', v_results
  );
end;
$$;

comment on function public.downstash_gw_run(text, text, jsonb, integer, bigint, bigint)
  is 'Gateway hot path: run commands for a token hash, recording gateway usage. service_role only.';

-- ---------------------------------------------------------------------------
-- 7.5.3 public.downstash_gw_ping — health check reachability from the gateway.
-- ---------------------------------------------------------------------------
create or replace function public.downstash_gw_ping()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object('ok', true, 'now', to_jsonb(now()))
  where exists (select 1 from downstash.databases limit 1);
$$;

comment on function public.downstash_gw_ping() is 'Gateway health ping. service_role only.';

-- ---------------------------------------------------------------------------
-- 7.5.4 Failover endpoints (ADR 0003). Anon/authenticated; token in args.
-- ---------------------------------------------------------------------------
create or replace function public.downstash_exec(
  p_token text,
  p_cmd text,
  p_args jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_ro   boolean;
  v_json jsonb;
begin
  if p_token is null or p_token !~ '^ds[kr]_[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('error', 'Unauthorized');
  end if;
  select d.id, (t.kind = 'readonly') into v_id, v_ro
  from downstash.tokens t join downstash.databases d on d.id = t.db_id
  where t.token_hash = extensions.digest(p_token, 'sha256') and t.revoked_at is null;
  if not found then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  begin
    v_json := downstash.run(
      v_id, v_ro,
      jsonb_build_array(to_jsonb(array[p_cmd]) || coalesce(p_args, '[]'::jsonb)),
      'failover'
    );
  exception
    when sqlstate 'DS000' then
      return jsonb_build_object('error', SQLERRM);
  end;
  return v_json -> 0;
end;
$$;

create or replace function public.downstash_pipeline(
  p_token text,
  p_commands jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_ro   boolean;
  v_json jsonb;
begin
  if p_token is null or p_token !~ '^ds[kr]_[A-Za-z0-9_-]{43}$' then
    return jsonb_build_object('error', 'Unauthorized');
  end if;
  select d.id, (t.kind = 'readonly') into v_id, v_ro
  from downstash.tokens t join downstash.databases d on d.id = t.db_id
  where t.token_hash = extensions.digest(p_token, 'sha256') and t.revoked_at is null;
  if not found then
    return jsonb_build_object('error', 'Unauthorized');
  end if;

  begin
    v_json := downstash.run(v_id, v_ro, p_commands, 'failover');
  exception
    when sqlstate 'DS000' then
      return jsonb_build_array(jsonb_build_object('error', SQLERRM));
  end;
  return v_json;
end;
$$;

create or replace function public.downstash_multi(
  p_token text,
  p_commands jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- MULTI is a transactional pipeline in Downstash; same semantics as pipeline.
  return public.downstash_pipeline(p_token, p_commands);
end;
$$;

-- Grants (§7.5.3–7.5.4).
revoke all on function public.downstash_gw_run(text, text, jsonb, integer, bigint, bigint) from public, anon, authenticated;
grant execute on function public.downstash_gw_run(text, text, jsonb, integer, bigint, bigint) to service_role;
revoke all on function public.downstash_gw_ping() from public, anon, authenticated;
grant execute on function public.downstash_gw_ping() to service_role;
revoke all on function public.downstash_exec(text, text, jsonb) from public;
grant execute on function public.downstash_exec(text, text, jsonb) to anon, authenticated, service_role;
revoke all on function public.downstash_pipeline(text, jsonb) from public;
grant execute on function public.downstash_pipeline(text, jsonb) to anon, authenticated, service_role;
revoke all on function public.downstash_multi(text, jsonb) from public;
grant execute on function public.downstash_multi(text, jsonb) to anon, authenticated, service_role;
notify pgrst, 'reload schema';

