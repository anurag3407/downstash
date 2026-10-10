-- @file 20261007000900_cmd_zsets.sql
-- Sorted-set commands (§7.8). ZSETs are stored as a JSONB object mapping
-- member -> numeric score (JSONB number). Ordering is by score, then member
-- in byte order (collate "C").

-- 0-based rank of a member in a zset JSONB object (score asc, then member byte
-- order). p_rev ranks from high to low.
create or replace function downstash.zset_rank_of(p_val jsonb, p_member text, p_rev boolean default false)
returns bigint
language plpgsql stable set search_path = '' as $$
declare
  v_dir text := case when p_rev then 'desc' else 'asc' end;
  v_rank bigint;
begin
  execute format(
    'select r from (select key as m, row_number() over (order by (value #>> %L)::numeric %s, key %s) as r from jsonb_each($1) e(key, value)) t where m = $2',
    '{}', v_dir, v_dir)
    into v_rank using p_val, p_member;
  return v_rank;
end;
$$;
comment on function downstash.zset_rank_of(jsonb, text, boolean) is '0-based rank (returned 1-based) of a zset member; subtract 1';


create or replace function downstash.cmd_zadd(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val jsonb;
  v_nx boolean := false;
  v_xx boolean := false;
  v_gt boolean := false;
  v_lt boolean := false;
  v_ch boolean := false;
  v_incr boolean := false;
  i int := 2;
  v_added int := 0;
  v_changed int := 0;
  v_score numeric;
  v_cur numeric;
  v_new numeric;
begin
  while i <= array_length(p_args, 1) loop
    if upper(p_args[i]) = 'NX' then v_nx := true; i := i + 1;
    elsif upper(p_args[i]) = 'XX' then v_xx := true; i := i + 1;
    elsif upper(p_args[i]) = 'GT' then v_gt := true; i := i + 1;
    elsif upper(p_args[i]) = 'LT' then v_lt := true; i := i + 1;
    elsif upper(p_args[i]) = 'CH' then v_ch := true; i := i + 1;
    elsif upper(p_args[i]) = 'INCR' then v_incr := true; i := i + 1;
    else exit; end if;
  end loop;
  if (v_nx and v_xx) or (v_gt and v_lt) then
    perform downstash.raise_err('ERR GT, LT, and/or NX options at the same time are not compatible');
  end if;
  if (array_length(p_args, 1) - i + 1) < 2 then
    perform downstash.raise_err('ERR syntax error');
  end if;
  if v_incr and (array_length(p_args, 1) - i + 1) <> 2 then
    perform downstash.raise_err('ERR INCR option supports a single increment-element pair');
  end if;
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'zset', '{}'::jsonb);
  v_val := coalesce((v_slot.o_row).val, '{}'::jsonb);
  if v_incr then
    v_score := downstash.to_float(p_args[i], true, 'ERR value is not a valid float');
    if v_nx and (v_val ? p_args[i+1]) then return 'null'::jsonb; end if;
    if v_xx and not (v_val ? p_args[i+1]) then return 'null'::jsonb; end if;
    if v_val ? p_args[i+1] then
      v_cur := (v_val ->> p_args[i+1])::numeric;
    else
      v_cur := 0;
    end if;
    v_new := v_cur + v_score;
    if (v_gt and v_new <= v_cur) or (v_lt and v_new >= v_cur) then return 'null'::jsonb; end if;
    v_val := jsonb_set(v_val, array[p_args[i+1]], to_jsonb(v_new));
    perform downstash.set_val(p_db, p_args[1], v_val);
    return to_jsonb(downstash.fmt_float(v_new));
  end if;
  while i <= array_length(p_args, 1) loop
    v_score := downstash.to_float(p_args[i], true, 'ERR value is not a valid float');
    if v_nx and (v_val ? p_args[i+1]) then i := i + 2; continue; end if;
    if v_xx and not (v_val ? p_args[i+1]) then i := i + 2; continue; end if;
    if v_val ? p_args[i+1] then
      v_cur := (v_val ->> p_args[i+1])::numeric;
      if (v_gt and v_score <= v_cur) or (v_lt and v_score >= v_cur) then i := i + 2; continue; end if;
      if v_score <> v_cur then v_changed := v_changed + 1; end if;
    else
      v_added := v_added + 1;
    end if;
    v_val := jsonb_set(v_val, array[p_args[i+1]], to_jsonb(v_score));
    i := i + 2;
  end loop;
  perform downstash.set_val(p_db, p_args[1], v_val);
  if v_ch then return to_jsonb(v_changed); end if;
  return to_jsonb(v_added);
end;
$$;
comment on function downstash.cmd_zadd(uuid, text[]) is 'ZADD key [NX|XX] [GT|LT] [CH] [INCR] score member ...';

create or replace function downstash.cmd_zincrby(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val jsonb;
  v_inc numeric;
  v_cur numeric;
  v_new numeric;
begin
  v_inc := downstash.to_float(p_args[2], true, 'ERR value is not a valid float');
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'zset', '{}'::jsonb);
  v_val := coalesce((v_slot.o_row).val, '{}'::jsonb);
  if v_val ? p_args[3] then v_cur := (v_val ->> p_args[3])::numeric; else v_cur := 0; end if;
  v_new := v_cur + v_inc;
  v_val := jsonb_set(v_val, array[p_args[3]], to_jsonb(v_new));
  perform downstash.set_val(p_db, p_args[1], v_val);
  return to_jsonb(downstash.fmt_float(v_new));
end;
$$;
comment on function downstash.cmd_zincrby(uuid, text[]) is 'ZINCRBY key increment member';

create or replace function downstash.cmd_zscore(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'zset');
  if v_row.key is null or not (v_row.val ? p_args[2]) then return 'null'::jsonb; end if;
  return to_jsonb(downstash.fmt_float((v_row.val ->> p_args[2])::numeric));
end;
$$;
comment on function downstash.cmd_zscore(uuid, text[]) is 'ZSCORE key member';

create or replace function downstash.cmd_zmscore(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
  v_out jsonb := '[]'::jsonb;
  i int := 2;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'zset');
  while i <= array_length(p_args, 1) loop
    if v_row.key is not null and (v_row.val ? p_args[i]) then
      v_out := v_out || to_jsonb(downstash.fmt_float((v_row.val ->> p_args[i])::numeric));
    else
      v_out := v_out || 'null'::jsonb;
    end if;
    i := i + 1;
  end loop;
  return v_out;
end;
$$;
comment on function downstash.cmd_zmscore(uuid, text[]) is 'ZMSCORE key member [member ...]';

create or replace function downstash.cmd_zrem(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv;
  v_val jsonb;
  v_removed int := 0;
  i int := 2;
begin
  v_row := downstash.lock_live(p_db, p_args[1], 'zset');
  if v_row.key is null then return to_jsonb(0); end if;
  v_val := v_row.val;
  while i <= array_length(p_args, 1) loop
    if v_val ? p_args[i] then v_removed := v_removed + 1; v_val := v_val - p_args[i]; end if;
    i := i + 1;
  end loop;
  if v_val = '{}'::jsonb then perform downstash.del_key(p_db, p_args[1]); else perform downstash.set_val(p_db, p_args[1], v_val); end if;
  return to_jsonb(v_removed);
end;
$$;
comment on function downstash.cmd_zrem(uuid, text[]) is 'ZREM key member [member ...]';

create or replace function downstash.cmd_zcard(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'zset');
  if v_row.key is null then return to_jsonb(0); end if;
  return to_jsonb((select count(*) from jsonb_object_keys(v_row.val) k));
end;
$$;
comment on function downstash.cmd_zcard(uuid, text[]) is 'ZCARD key';
-- score_in_range: handles leading `(` (exclusive), `-inf`/`+inf`.
create or replace function downstash.score_in_range(p_score double precision, p_min text, p_max text)
returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  v_min_ex boolean := p_min like '(%';
  v_max_ex boolean := p_max like '(%';
  v_min_v double precision;
  v_max_v double precision;
begin
  v_min_v := downstash.to_float(case when v_min_ex then substring(p_min from 2) else p_min end, true, 'ERR min or max is not a float');
  v_max_v := downstash.to_float(case when v_max_ex then substring(p_max from 2) else p_max end, true, 'ERR min or max is not a float');
  if v_min_ex then
    if p_score <= v_min_v then return false; end if;
  else
    if p_score < v_min_v then return false; end if;
  end if;
  if v_max_ex then
    if p_score >= v_max_v then return false; end if;
  else
    if p_score > v_max_v then return false; end if;
  end if;
  return true;
end;
$$;

-- ZRANGE key start stop [BYSCORE] [REV] [LIMIT off cnt] [WITHSCORES]
create or replace function downstash.cmd_zrange(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
  v_n int := array_length(p_args, 1);
  v_byscore boolean := false;
  v_rev boolean := false;
  v_withscores boolean := false;
  v_limit boolean := false;
  v_off int := 0;
  v_cnt int := 0;
  i int := 4;
  v_out jsonb := '[]'::jsonb;
  v_rec record;
  v_kept int := 0;
  v_len int;
begin
  while i <= v_n loop
    if p_args[i] = 'BYSCORE' then v_byscore := true;
    elsif p_args[i] = 'REV' then v_rev := true;
    elsif p_args[i] = 'WITHSCORES' then v_withscores := true;
    elsif p_args[i] = 'BYLEX' then perform downstash.raise_err('ERR Downstash: BYLEX is not supported');
    elsif p_args[i] = 'LIMIT' then v_limit := true; v_off := p_args[i+1]::int; v_cnt := p_args[i+2]::int; i := i + 2;
    end if;
    i := i + 1;
  end loop;
  v_row := downstash.read_live(p_db, p_args[1], 'zset');
  if v_row.key is null then return '[]'::jsonb; end if;
  v_len := (select count(*) from jsonb_each(v_row.val));
  if v_byscore then
    if v_rev then
      for v_rec in
        select key as m, (value #>> '{}')::numeric as s from jsonb_each(v_row.val) e(key, value)
        where downstash.score_in_range((value #>> '{}')::double precision, p_args[3], p_args[2])
        order by (value #>> '{}')::numeric desc, key desc
      loop
        exit when v_limit and v_cnt >= 0 and v_kept >= v_off + v_cnt;
        if (not v_limit) or (v_kept >= v_off) then
          v_out := v_out || to_jsonb(v_rec.m);
          if v_withscores then v_out := v_out || to_jsonb(downstash.fmt_float(v_rec.s)); end if;
        end if;
        v_kept := v_kept + 1;
      end loop;
    else
      for v_rec in
        select key as m, (value #>> '{}')::numeric as s from jsonb_each(v_row.val) e(key, value)
        where downstash.score_in_range((value #>> '{}')::double precision, p_args[2], p_args[3])
        order by (value #>> '{}')::numeric asc, key
      loop
        exit when v_limit and v_cnt >= 0 and v_kept >= v_off + v_cnt;
        if (not v_limit) or (v_kept >= v_off) then
          v_out := v_out || to_jsonb(v_rec.m);
          if v_withscores then v_out := v_out || to_jsonb(downstash.fmt_float(v_rec.s)); end if;
        end if;
        v_kept := v_kept + 1;
      end loop;
    end if;
  else
    declare
      v_start int := p_args[2]::int;
      v_stop int := p_args[3]::int;
      v_ord text := case when v_rev then 'desc' else 'asc' end;
      v_rank int;
    begin
      if v_start < 0 then v_start := v_len + v_start; end if;
      if v_stop < 0 then v_stop := v_len + v_stop; end if;
      if v_start < 0 then v_start := 0; end if;
      if v_stop >= v_len then v_stop := v_len - 1; end if;
      for v_rec in
        execute format(
          'select key as m, (value #>> %L)::numeric as s, row_number() over (order by (value #>> %L)::numeric %s, key %s) as r from jsonb_each($1) e(key, value) order by r',
          '{}', '{}', v_ord, v_ord)
        using v_row.val
      loop
        v_rank := v_rec.r - 1;
        if v_rank >= v_start and v_rank <= v_stop then
          v_out := v_out || to_jsonb(v_rec.m);
          if v_withscores then v_out := v_out || to_jsonb(downstash.fmt_float(v_rec.s)); end if;
        end if;
      end loop;
    end;
  end if;
  return v_out;
end;
$$;
comment on function downstash.cmd_zrange(uuid, text[]) is 'ZRANGE key start stop [BYSCORE] [REV] [LIMIT off cnt] [WITHSCORES]';

-- ZCOUNT key min max
create or replace function downstash.cmd_zcount(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_row downstash.kv;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'zset');
  if v_row.key is null then return to_jsonb(0); end if;
  return to_jsonb((select count(*) from jsonb_each(v_row.val) e(key, value)
    where downstash.score_in_range((value #>> '{}')::double precision, p_args[2], p_args[3])));
end;
$$;
comment on function downstash.cmd_zcount(uuid, text[]) is 'ZCOUNT key min max';

create or replace function downstash.cmd_zrank(p_db uuid, p_args text[], p_rev boolean default false)
returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_row downstash.kv; v_rows text[]; v_idx int;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'zset');
  if v_row.key is null or not (v_row.val ? p_args[2]) then return 'null'::jsonb; end if;
  if p_rev then
    select array_agg(m order by ((v_row.val ->> m)::numeric) desc, m desc) into v_rows from jsonb_object_keys(v_row.val) m;
  else
    select array_agg(m order by ((v_row.val ->> m)::numeric) asc, m) into v_rows from jsonb_object_keys(v_row.val) m;
  end if;
  v_idx := array_position(v_rows, p_args[2]);
  return to_jsonb(v_idx - 1);
end;
$$;
comment on function downstash.cmd_zrank(uuid, text[], boolean) is 'ZRANK key member (rev flag)';

create or replace function downstash.cmd_zrevrank(p_db uuid, p_args text[])
returns jsonb language plpgsql stable set search_path = '' as $$
begin return downstash.cmd_zrank(p_db, p_args, true); end;
$$;
comment on function downstash.cmd_zrevrank(uuid, text[]) is 'ZREVRANK key member';

create or replace function downstash.cmd_zremrangebyscore(p_db uuid, p_args text[])
returns jsonb language plpgsql volatile set search_path = '' as $$
declare v_row downstash.kv; v_val jsonb; v_removed int := 0; v_m text;
begin
  v_row := downstash.lock_live(p_db, p_args[1], 'zset');
  if v_row.key is null then return to_jsonb(0); end if;
  v_val := v_row.val;
  for v_m in select jsonb_object_keys(v_val) loop
    if downstash.score_in_range((v_val ->> v_m)::double precision, p_args[2], p_args[3]) then
      v_val := v_val - v_m; v_removed := v_removed + 1;
    end if;
  end loop;
  if v_val = '{}'::jsonb then perform downstash.del_key(p_db, p_args[1]); else perform downstash.set_val(p_db, p_args[1], v_val); end if;
  return to_jsonb(v_removed);
end;
$$;
comment on function downstash.cmd_zremrangebyscore(uuid, text[]) is 'ZREMRANGEBYSCORE key min max';

create or replace function downstash.cmd_zremrangebyrank(p_db uuid, p_args text[])
returns jsonb language plpgsql volatile set search_path = '' as $$
declare v_row downstash.kv; v_val jsonb; v_rows text[]; v_len int; v_start int; v_stop int; v_removed int := 0; v_m text;
begin
  v_row := downstash.lock_live(p_db, p_args[1], 'zset');
  if v_row.key is null then return to_jsonb(0); end if;
  v_val := v_row.val;
  select array_agg(m order by ((v_val ->> m)::numeric) asc, m) into v_rows from jsonb_object_keys(v_val) m;
  v_start := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  v_stop := downstash.to_int(p_args[3], 'ERR value is not an integer or out of range');
  v_len := array_length(v_rows, 1);
  if v_start < 0 then v_start := greatest(v_len + v_start, 0); end if;
  if v_stop < 0 then v_stop := v_len + v_stop; end if;
  v_stop := least(v_stop, v_len - 1);
  if v_start > v_stop then return to_jsonb(0); end if;
  for v_m in select unnest(v_rows[v_start + 1 : v_stop + 1]) loop
    v_val := v_val - v_m; v_removed := v_removed + 1;
  end loop;
  if v_val = '{}'::jsonb then perform downstash.del_key(p_db, p_args[1]); else perform downstash.set_val(p_db, p_args[1], v_val); end if;
  return to_jsonb(v_removed);
end;
$$;
comment on function downstash.cmd_zremrangebyrank(uuid, text[]) is 'ZREMRANGEBYRANK key start stop';
insert into downstash.command_registry (name, handler, arity, flags, first_key, last_key, key_step, family, summary)
values
  ('ZADD',            'downstash.cmd_zadd',            -4, '{write}', 1, 1, 1, 'zsets', 'Add one or more members to a sorted set'),
  ('ZINCRBY',         'downstash.cmd_zincrby',         4, '{write}', 1, 1, 1, 'zsets', 'Increment the score of a member in a sorted set'),
  ('ZSCORE',          'downstash.cmd_zscore',          3, '{cacheable,read}', 1, 1, 1, 'zsets', 'Get the score of a member in a sorted set'),
  ('ZMSCORE',         'downstash.cmd_zmscore',        -3, '{read}', 1, 1, 1, 'zsets', 'Get the score of one or more members in a sorted set'),
  ('ZREM',            'downstash.cmd_zrem',           -3, '{write}', 1, 1, 1, 'zsets', 'Remove one or more members from a sorted set'),
  ('ZCARD',           'downstash.cmd_zcard',           2, '{read}',  1, 1, 1, 'zsets', 'Get the number of members in a sorted set'),
  ('ZCOUNT',          'downstash.cmd_zcount',          4, '{read}',  1, 1, 1, 'zsets', 'Count the members in a sorted set with scores within the given values'),
  ('ZRANGE',          'downstash.cmd_zrange',         -4, '{read}',  1, 1, 1, 'zsets', 'Return a range of members in a sorted set'),
  ('ZRANK',           'downstash.cmd_zrank',           3, '{read}',  1, 1, 1, 'zsets', 'Determine the index of a member in a sorted set'),
  ('ZREVRANK',        'downstash.cmd_zrevrank',        3, '{read}',  1, 1, 1, 'zsets', 'Determine the index of a member in a sorted set, ordered from high to low'),
  ('ZREMRANGEBYSCORE','downstash.cmd_zremrangebyscore', 4, '{write}', 1, 1, 1, 'zsets', 'Remove all members in a sorted set within the given scores'),
  ('ZREMRANGEBYRANK', 'downstash.cmd_zremrangebyrank', 4, '{write}', 1, 1, 1, 'zsets', 'Remove all members in a sorted set within the given indexes')

on conflict (name) do update set handler = excluded.handler, arity = excluded.arity, flags = excluded.flags, first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step, family = excluded.family, summary = excluded.summary;
