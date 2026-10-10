-- @file 20261007000600_cmd_hashes.sql
-- Hash commands (§7.8). Hash values are stored as a JSONB object mapping
-- field -> string value. Field order is JSONB object order.
create or replace function downstash.cmd_hset(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val jsonb;
  v_added int := 0;
  i int := 2;
begin
  if mod(array_length(p_args, 1) - 1, 2) <> 0 then
    perform downstash.raise_err('ERR wrong number of arguments for ''hset'' command');
  end if;
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'hash', '{}'::jsonb);
  v_val := coalesce((v_slot.o_row).val, '{}'::jsonb);
  while i <= array_length(p_args, 1) loop
    if not (v_val ? p_args[i]) then
      v_added := v_added + 1;
    end if;
    v_val := jsonb_set(v_val, array[p_args[i]], to_jsonb(p_args[i + 1]));
    i := i + 2;
  end loop;
  perform downstash.set_val(p_db, p_args[1], v_val);
  return to_jsonb(v_added);
end;
$$;
comment on function downstash.cmd_hset(uuid, text[]) is 'HSET key field value [field value ...]';

create or replace function downstash.cmd_hmset(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val jsonb;
  i int := 2;
begin
  if mod(array_length(p_args, 1) - 1, 2) <> 0 then
    perform downstash.raise_err('ERR wrong number of arguments for ''hmset'' command');
  end if;
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'hash', '{}'::jsonb);
  v_val := coalesce((v_slot.o_row).val, '{}'::jsonb);
  while i <= array_length(p_args, 1) loop
    v_val := jsonb_set(v_val, array[p_args[i]], to_jsonb(p_args[i + 1]));
    i := i + 2;
  end loop;
  perform downstash.set_val(p_db, p_args[1], v_val);
  return '"OK"'::jsonb;
end;
$$;
comment on function downstash.cmd_hmset(uuid, text[]) is 'HMSET key field value [field value ...]';

create or replace function downstash.cmd_hsetnx(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val jsonb;
begin
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'hash', '{}'::jsonb);
  v_val := coalesce((v_slot.o_row).val, '{}'::jsonb);
  if v_val ? p_args[2] then
    return to_jsonb(0);
  end if;
  v_val := jsonb_set(v_val, array[p_args[2]], to_jsonb(p_args[3]));
  perform downstash.set_val(p_db, p_args[1], v_val);
  return to_jsonb(1);
end;
$$;
comment on function downstash.cmd_hsetnx(uuid, text[]) is 'HSETNX key field value';

create or replace function downstash.cmd_hget(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.read_live(p_db, p_args[1], 'hash');
begin
  if v_row.key is null then
    return 'null'::jsonb;
  end if;
  return v_row.val -> p_args[2];
end;
$$;
comment on function downstash.cmd_hget(uuid, text[]) is 'HGET key field';

create or replace function downstash.cmd_hmget(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.read_live(p_db, p_args[1], 'hash');
  v_out jsonb := '[]'::jsonb;
  i int := 2;
begin
  while i <= array_length(p_args, 1) loop
    if v_row.key is not null and (v_row.val ? p_args[i]) then
      v_out := v_out || jsonb_build_array(v_row.val -> p_args[i]);
    else
      v_out := v_out || jsonb_build_array('null'::jsonb);
    end if;
    i := i + 1;
  end loop;
  return v_out;
end;
$$;
comment on function downstash.cmd_hmget(uuid, text[]) is 'HMGET key field [field ...]';

create or replace function downstash.cmd_hgetall(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.read_live(p_db, p_args[1], 'hash');
  v_out jsonb := '[]'::jsonb;
  v_k text;
begin
  if v_row.key is null then
    return '[]'::jsonb;
  end if;
  for v_k in select key from jsonb_each(v_row.val) loop
    v_out := v_out || jsonb_build_array(to_jsonb(v_k), v_row.val -> v_k);
  end loop;
  return v_out;
end;
$$;
comment on function downstash.cmd_hgetall(uuid, text[]) is 'HGETALL key';

create or replace function downstash.cmd_hdel(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.lock_live(p_db, p_args[1], 'hash');
  v_val jsonb;
  v_removed int := 0;
  i int := 2;
begin
  if v_row.key is null then
    return to_jsonb(0);
  end if;
  v_val := v_row.val;
  while i <= array_length(p_args, 1) loop
    if v_val ? p_args[i] then
      v_val := v_val - p_args[i];
      v_removed := v_removed + 1;
    end if;
    i := i + 1;
  end loop;
  if v_val = '{}'::jsonb then
    perform downstash.del_key(p_db, p_args[1]);
  else
    perform downstash.set_val(p_db, p_args[1], v_val);
  end if;
  return to_jsonb(v_removed);
end;
$$;
comment on function downstash.cmd_hdel(uuid, text[]) is 'HDEL key field [field ...]';

create or replace function downstash.cmd_hlen(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.read_live(p_db, p_args[1], 'hash');
begin
  if v_row.key is null then
    return to_jsonb(0);
  end if;
  return to_jsonb((select count(*) from jsonb_each(v_row.val)));
end;
$$;
comment on function downstash.cmd_hlen(uuid, text[]) is 'HLEN key';

create or replace function downstash.cmd_hexists(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.read_live(p_db, p_args[1], 'hash');
begin
  if v_row.key is not null and (v_row.val ? p_args[2]) then
    return to_jsonb(1);
  end if;
  return to_jsonb(0);
end;
$$;
comment on function downstash.cmd_hexists(uuid, text[]) is 'HEXISTS key field';

create or replace function downstash.cmd_hkeys(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.read_live(p_db, p_args[1], 'hash');
  v_out jsonb := '[]'::jsonb;
  v_k text;
begin
  if v_row.key is null then
    return '[]'::jsonb;
  end if;
  for v_k in select key from jsonb_each(v_row.val) loop
    v_out := v_out || jsonb_build_array(to_jsonb(v_k));
  end loop;
  return v_out;
end;
$$;
comment on function downstash.cmd_hkeys(uuid, text[]) is 'HKEYS key';

create or replace function downstash.cmd_hvals(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.read_live(p_db, p_args[1], 'hash');
  v_out jsonb := '[]'::jsonb;
  v_k text;
begin
  if v_row.key is null then
    return '[]'::jsonb;
  end if;
  for v_k in select key from jsonb_each(v_row.val) loop
    v_out := v_out || jsonb_build_array(v_row.val -> v_k);
  end loop;
  return v_out;
end;
$$;
comment on function downstash.cmd_hvals(uuid, text[]) is 'HVALS key';


-- HINCRBY key field increment → integer; 'ERR hash value is not an integer'.
create or replace function downstash.cmd_hincrby(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val jsonb;
  v_cur numeric;
  v_inc numeric;
  v_new numeric;
begin
  begin
    v_inc := p_args[3]::numeric;
  exception when others then
    perform downstash.raise_err('ERR value is not an integer or out of range');
  end;
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'hash', '{}'::jsonb);
  v_val := coalesce((v_slot.o_row).val, '{}'::jsonb);
  if v_val ? p_args[2] then
    begin
      v_cur := (v_val ->> p_args[2])::numeric;
    exception when others then
      perform downstash.raise_err('ERR hash value is not an integer');
    end;
    if v_cur <> trunc(v_cur) then
      perform downstash.raise_err('ERR hash value is not an integer');
    end if;
  else
    v_cur := 0;
  end if;
  v_new := v_cur + v_inc;
  if abs(v_new) > 9223372036854775807 then
    perform downstash.raise_err('ERR increment or decrement would overflow');
  end if;
  v_val := jsonb_set(v_val, array[p_args[2]], to_jsonb(v_new::bigint::text));
  perform downstash.set_val(p_db, p_args[1], v_val);
  return to_jsonb(v_new::bigint);
end;
$$;
comment on function downstash.cmd_hincrby(uuid, text[]) is 'HINCRBY key field increment';

create or replace function downstash.cmd_hincrbyfloat(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val jsonb;
  v_cur double precision;
  v_inc double precision;
begin
  begin
    v_inc := p_args[3]::double precision;
  exception when others then
    perform downstash.raise_err('ERR value is not a float');
  end;
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'hash', '{}'::jsonb);
  v_val := coalesce((v_slot.o_row).val, '{}'::jsonb);
  if v_val ? p_args[2] then
    begin
      v_cur := (v_val ->> p_args[2])::double precision;
    exception when others then
      perform downstash.raise_err('ERR hash value is not a float');
    end;
  else
    v_cur := 0;
  end if;
  v_val := jsonb_set(v_val, array[p_args[2]], to_jsonb(downstash.fmt_float(v_cur + v_inc)));
  perform downstash.set_val(p_db, p_args[1], v_val);
  return to_jsonb(downstash.fmt_float(v_cur + v_inc));
end;
$$;
comment on function downstash.cmd_hincrbyfloat(uuid, text[]) is 'HINCRBYFLOAT key field increment';

-- HSTRLEN key field → byte length or 0.
create or replace function downstash.cmd_hstrlen(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.read_live(p_db, p_args[1], 'hash');
begin
  if v_row.key is null or not (v_row.val ? p_args[2]) then
    return to_jsonb(0);
  end if;
  return to_jsonb(octet_length(v_row.val ->> p_args[2]));
end;
$$;
comment on function downstash.cmd_hstrlen(uuid, text[]) is 'HSTRLEN key field';


-- HRANDFIELD key [count [WITHVALUES]].
create or replace function downstash.cmd_hrandfield(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv := downstash.read_live(p_db, p_args[1], 'hash');
  v_count int;
  v_with boolean := false;
  v_elems text[];
  v_out jsonb := '[]'::jsonb;
  v_len int;
  i int;
  v_sel int;
  v_taken text[] := '{}';
begin
  if v_row.key is null then
    return case when array_length(p_args, 1) >= 2 then '[]'::jsonb else 'null'::jsonb end;
  end if;
  v_elems := (select array_agg(k order by ord) from jsonb_each(v_row.val) with ordinality e(k, v, ord));
  v_len := coalesce(array_length(v_elems, 1), 0);
  if array_length(p_args, 1) = 1 then
    if v_len = 0 then return 'null'::jsonb; end if;
    return to_jsonb(v_elems[1 + floor(random() * v_len)::int]);
  end if;
  v_count := downstash.to_int(p_args[2]);
  if array_length(p_args, 1) >= 3 and upper(p_args[3]) = 'WITHVALUES' then
    v_with := true;
  end if;
  if v_count >= 0 then
    -- Distinct fields, capped at the number present; random selection.
    for i in 1..least(v_count, v_len) loop
      loop
        v_sel := 1 + floor(random() * v_len)::int;
        exit when not (v_elems[v_sel] = any(v_taken));
      end loop;
      v_taken := v_taken || v_elems[v_sel];
      v_out := v_out || jsonb_build_array(to_jsonb(v_elems[v_sel]));
      if v_with then
        v_out := v_out || jsonb_build_array(v_row.val -> v_elems[v_sel]);
      end if;
    end loop;
  else
    -- Negative count: repeats allowed.
    for i in 1..(-v_count) loop
      v_sel := 1 + floor(random() * v_len)::int;
      v_out := v_out || jsonb_build_array(to_jsonb(v_elems[v_sel]));
      if v_with then
        v_out := v_out || jsonb_build_array(v_row.val -> v_elems[v_sel]);
      end if;
    end loop;
  end if;
  return v_out;
end;
$$;
comment on function downstash.cmd_hrandfield(uuid, text[]) is 'HRANDFIELD key [count [WITHVALUES]]';


-- ---------------------------------------------------------------------------
-- Registry (§7.8 hashes). All use key spec 1,1,1.
-- ---------------------------------------------------------------------------
insert into downstash.command_registry (name, handler, arity, flags, first_key, last_key, key_step, family, summary)
values
  ('HSET',       'downstash.cmd_hset',       -4, '{write}',       1, 1, 1, 'hashes', 'Set hash fields'),
  ('HMSET',      'downstash.cmd_hmset',      -4, '{write}',       1, 1, 1, 'hashes', 'Set multiple hash fields'),
  ('HSETNX',     'downstash.cmd_hsetnx',      4, '{write}',       1, 1, 1, 'hashes', 'Set the value of a hash field, only if the field does not exist'),
  ('HGET',       'downstash.cmd_hget',       3, '{cacheable,read}', 1, 1, 1, 'hashes', 'Get the value of a hash field'),
  ('HMGET',      'downstash.cmd_hmget',     -3, '{cacheable,read}', 1, 1, 1, 'hashes', 'Get the values of all the given hash fields'),
  ('HGETALL',    'downstash.cmd_hgetall',    2, '{cacheable,read}', 1, 1, 1, 'hashes', 'Get all the fields and values in a hash'),
  ('HDEL',       'downstash.cmd_hdel',      -3, '{write}',       1, 1, 1, 'hashes', 'Delete one or more hash fields'),
  ('HLEN',       'downstash.cmd_hlen',       2, '{read}',        1, 1, 1, 'hashes', 'Get the number of fields in a hash'),
  ('HEXISTS',    'downstash.cmd_hexists',    3, '{read}',        1, 1, 1, 'hashes', 'Determine if a hash field exists'),
  ('HKEYS',      'downstash.cmd_hkeys',      2, '{read}',        1, 1, 1, 'hashes', 'Get all the fields in a hash'),
  ('HVALS',      'downstash.cmd_hvals',      2, '{read}',        1, 1, 1, 'hashes', 'Get all the values in a hash'),
  ('HINCRBY',    'downstash.cmd_hincrby',    4, '{write}',       1, 1, 1, 'hashes', 'Increment the integer value of a hash field by the given number'),
  ('HINCRBYFLOAT','downstash.cmd_hincrbyfloat', 4, '{write}',    1, 1, 1, 'hashes', 'Increment the float value of a hash field by the given amount'),
  ('HSTRLEN',    'downstash.cmd_hstrlen',    3, '{read}',        1, 1, 1, 'hashes', 'Get the length of the value of a hash field'),
  ('HRANDFIELD', 'downstash.cmd_hrandfield',-2, '{read}',        1, 1, 1, 'hashes', 'Get one or multiple random fields from a hash')
on conflict (name) do update set
  handler = excluded.handler, arity = excluded.arity, flags = excluded.flags,
  first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step,
  family = excluded.family, summary = excluded.summary;


