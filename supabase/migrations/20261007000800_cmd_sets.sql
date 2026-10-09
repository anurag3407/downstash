-- ---------------------------------------------------------------------------
-- 00800 — Set command handlers (§7.8 sets family). Value = JSON object of
-- members with value true. Set ops via JSONB key set algebra.
-- ---------------------------------------------------------------------------

create or replace function downstash.cmd_sadd(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val jsonb;
  v_added int := 0;
  i int := 2;
begin
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'set', '{}'::jsonb);
  v_val := coalesce((v_slot.o_row).val, '{}'::jsonb);
  while i <= array_length(p_args, 1) loop
    if not (v_val ? p_args[i]) then
      v_val := jsonb_set(v_val, array[p_args[i]], 'true'::jsonb);
      v_added := v_added + 1;
    end if;
    i := i + 1;
  end loop;
  perform downstash.set_val(p_db, p_args[1], v_val);
  return to_jsonb(v_added);
end;
$$;
comment on function downstash.cmd_sadd(uuid, text[]) is 'SADD key member [member ...]';

create or replace function downstash.cmd_srem(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv;
  v_val jsonb;
  v_removed int := 0;
  i int := 2;
begin
  v_row := downstash.lock_live(p_db, p_args[1], 'set');
  if v_row.key is null then return to_jsonb(0); end if;
  v_val := v_row.val;
  while i <= array_length(p_args, 1) loop
    if v_val ? p_args[i] then v_val := v_val - p_args[i]; v_removed := v_removed + 1; end if;
    i := i + 1;
  end loop;
  if v_val = '{}'::jsonb then perform downstash.del_key(p_db, p_args[1]); else perform downstash.set_val(p_db, p_args[1], v_val); end if;
  return to_jsonb(v_removed);
end;
$$;
comment on function downstash.cmd_srem(uuid, text[]) is 'SREM key member [member ...]';

create or replace function downstash.cmd_smembers(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
  v_out jsonb := '[]'::jsonb;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'set');
  if v_row.key is null then return '[]'::jsonb; end if;
  select jsonb_agg(to_jsonb(k) order by k) into v_out from jsonb_object_keys(v_row.val) k;
  return coalesce(v_out, '[]'::jsonb);
end;
$$;
comment on function downstash.cmd_smembers(uuid, text[]) is 'SMEMBERS key';

create or replace function downstash.cmd_sismember(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'set');
  if v_row.key is null or not (v_row.val ? p_args[2]) then return to_jsonb(0); end if;
  return to_jsonb(1);
end;
$$;
comment on function downstash.cmd_sismember(uuid, text[]) is 'SISMEMBER key member';

create or replace function downstash.cmd_smismember(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
  v_out jsonb := '[]'::jsonb;
  i int := 2;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'set');
  while i <= array_length(p_args, 1) loop
    if v_row.key is not null and (v_row.val ? p_args[i]) then v_out := v_out || to_jsonb(1); else v_out := v_out || to_jsonb(0); end if;
    i := i + 1;
  end loop;
  return v_out;
end;
$$;
comment on function downstash.cmd_smismember(uuid, text[]) is 'SMISMEMBER key member [member ...]';

create or replace function downstash.cmd_scard(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'set');
  if v_row.key is null then return to_jsonb(0); end if;
  return to_jsonb((select count(*) from jsonb_object_keys(v_row.val) k));
end;
$$;
comment on function downstash.cmd_scard(uuid, text[]) is 'SCARD key';

create or replace function downstash.cmd_spop(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv;
  v_val jsonb;
  v_cnt int;
  v_arr text[];
  v_sel text[];
  v_out jsonb := '[]'::jsonb;
begin
  v_row := downstash.lock_live(p_db, p_args[1], 'set');
  if v_row.key is null then
    if array_length(p_args, 1) >= 2 then return 'null'::jsonb; end if;
    return 'null'::jsonb;
  end if;
  v_val := v_row.val;
  select array_agg(k order by ord) into v_arr from (select k, random() as ord from jsonb_object_keys(v_val) k) s;
  v_cnt := cardinality(v_arr);
  if array_length(p_args, 1) >= 2 then
    declare v_n int := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range'); begin
      if v_n < 0 then perform downstash.raise_err('ERR value is out of range, must be positive'); end if;
      if v_n > v_cnt then v_n := v_cnt; end if;
      v_sel := v_arr[1:v_n];
    end;
    for i in 1..cardinality(v_sel) loop
      v_out := v_out || to_jsonb(v_sel[i]);
      v_val := v_val - v_sel[i];
    end loop;
    if v_val = '{}'::jsonb then perform downstash.del_key(p_db, p_args[1]); else perform downstash.set_val(p_db, p_args[1], v_val); end if;
    return v_out;
  else
    perform downstash.set_val(p_db, p_args[1], v_val - v_arr[1]);
    return to_jsonb(v_arr[1]);
  end if;
end;
$$;
comment on function downstash.cmd_spop(uuid, text[]) is 'SPOP key [count]';

create or replace function downstash.cmd_srandmember(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv;
  v_arr text[];
  v_cnt int;
  v_n int;
  v_out jsonb := '[]'::jsonb;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'set');
  if v_row.key is null then
    if array_length(p_args, 1) >= 2 then return '[]'::jsonb; end if;
    return 'null'::jsonb;
  end if;
  select array_agg(k) into v_arr from jsonb_object_keys(v_row.val) k;
  v_cnt := cardinality(v_arr);
  if array_length(p_args, 1) >= 2 then
    v_n := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
    if v_n >= 0 then
      for i in 1..least(v_n, v_cnt) loop v_out := v_out || to_jsonb(v_arr[floor(random()*v_cnt)+1]); end loop;
    else
      for i in 1..abs(v_n) loop v_out := v_out || to_jsonb(v_arr[floor(random()*v_cnt)+1]); end loop;
    end if;
    return v_out;
  else
    return to_jsonb(v_arr[floor(random()*v_cnt)+1]);
  end if;
end;
$$;
comment on function downstash.cmd_srandmember(uuid, text[]) is 'SRANDMEMBER key [count]';

create or replace function downstash.cmd_sinter(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_acc jsonb;
  v_row downstash.kv;
  i int := 2;
  v_out jsonb := '[]'::jsonb;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'set');
  if v_row.key is null then return '[]'::jsonb; end if;
  v_acc := v_row.val;
  while i <= array_length(p_args, 1) loop
    v_row := downstash.read_live(p_db, p_args[i], 'set');
    if v_row.key is null then return '[]'::jsonb; end if;
    select jsonb_object_agg(k, 'true') into v_acc from jsonb_object_keys(v_acc) k where v_row.val ? k;
    if v_acc is null then return '[]'::jsonb; end if;
    i := i + 1;
  end loop;
  select jsonb_agg(to_jsonb(k) order by k) into v_out from jsonb_object_keys(v_acc) k;
  return coalesce(v_out, '[]'::jsonb);
end;
$$;
comment on function downstash.cmd_sinter(uuid, text[]) is 'SINTER key [key ...]';

create or replace function downstash.cmd_sunion(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_acc jsonb := '{}'::jsonb;
  v_row downstash.kv;
  i int := 1;
  v_out jsonb := '[]'::jsonb;
begin
  while i <= array_length(p_args, 1) loop
    v_row := downstash.read_live(p_db, p_args[i], 'set');
    if v_row.key is not null then v_acc := v_acc || v_row.val; end if;
    i := i + 1;
  end loop;
  select jsonb_agg(to_jsonb(k) order by k) into v_out from jsonb_object_keys(v_acc) k;
  return coalesce(v_out, '[]'::jsonb);
end;
$$;
comment on function downstash.cmd_sunion(uuid, text[]) is 'SUNION key [key ...]';

create or replace function downstash.cmd_sdiff(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
  v_acc jsonb;
  i int := 2;
  v_out jsonb := '[]'::jsonb;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'set');
  if v_row.key is null then return '[]'::jsonb; end if;
  v_acc := v_row.val;
  while i <= array_length(p_args, 1) loop
    v_row := downstash.read_live(p_db, p_args[i], 'set');
    if v_row.key is not null then
      v_acc := (select jsonb_object_agg(k, 'true') from jsonb_object_keys(v_acc) k where not (v_row.val ? k));
      if v_acc is null then return '[]'::jsonb; end if;
    end if;
    i := i + 1;
  end loop;
  select jsonb_agg(to_jsonb(k) order by k) into v_out from jsonb_object_keys(v_acc) k;
  return coalesce(v_out, '[]'::jsonb);
end;
$$;
comment on function downstash.cmd_sdiff(uuid, text[]) is 'SDIFF key [key ...]';

-- Registry (§7.8 sets). All use key spec 1,1,1 (set ops use 1,-1,1).
insert into downstash.command_registry (name, handler, arity, flags, first_key, last_key, key_step, family, summary)
values
  ('SADD',       'downstash.cmd_sadd',       -3, '{write}', 1, 1, 1, 'sets', 'Add one or more members to a set'),
  ('SREM',       'downstash.cmd_srem',       -3, '{write}', 1, 1, 1, 'sets', 'Remove one or more members from a set'),
  ('SMEMBERS',   'downstash.cmd_smembers',    2, '{read,cacheable}', 1, 1, 1, 'sets', 'Get all the members in a set'),
  ('SISMEMBER',  'downstash.cmd_sismember',   3, '{read,cacheable}', 1, 1, 1, 'sets', 'Determine if a given value is a member of a set'),
  ('SMISMEMBER', 'downstash.cmd_smismember', -3, '{read}', 1, 1, 1, 'sets', 'Returns the membership associated with the given elements for a set'),
  ('SCARD',      'downstash.cmd_scard',       2, '{read}', 1, 1, 1, 'sets', 'Get the number of members in a set'),
  ('SPOP',       'downstash.cmd_spop',       -2, '{write}', 1, 1, 1, 'sets', 'Remove and return one or multiple random members from a set'),
  ('SRANDMEMBER','downstash.cmd_srandmember',-2, '{read}', 1, 1, 1, 'sets', 'Get one or multiple random members from a set'),
  ('SINTER',     'downstash.cmd_sinter',     -2, '{read}', 1, -1, 1, 'sets', 'Intersect multiple sets'),
  ('SUNION',     'downstash.cmd_sunion',     -2, '{read}', 1, -1, 1, 'sets', 'Add multiple sets'),
  ('SDIFF',      'downstash.cmd_sdiff',      -2, '{read}', 1, -1, 1, 'sets', 'Subtract multiple sets')
on conflict (name) do update set
  handler = excluded.handler, arity = excluded.arity, flags = excluded.flags,
  first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step,
  family = excluded.family, summary = excluded.summary;
