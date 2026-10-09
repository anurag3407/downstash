-- @file String commands (§7.8). GET/SET family + counters + APPEND/STRLEN.
-- @see docs/engine/commands.md
-- String values are always stored as a JSON string in kv.val (§7.3).

-- ---------------------------------------------------------------------------
-- GET key
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_get(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  r downstash.kv;
begin
  r := downstash.read_live(p_db, p_args[1], 'string');
  return coalesce(r.val, 'null'::jsonb);
end;
$$;
comment on function downstash.cmd_get(uuid, text[]) is 'GET key';

-- ---------------------------------------------------------------------------
-- SET key value [NX|XX] [GET] [EX s|PX ms|EXAT ts|PXAT ms|KEEPTTL]
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_set(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_key    text := p_args[1];
  v_value  text := p_args[2];
  v_n      int  := array_length(p_args, 1);
  i        int  := 3;
  v_nx     boolean := false;
  v_xx     boolean := false;
  v_get    boolean := false;
  v_keep   boolean := false;
  v_exp_at timestamptz;
  v_exp_set boolean := false;
  v_opt    text;
  v_num    bigint;
  v_row    downstash.kv;
  v_old    jsonb;
  v_has    boolean;
begin
  while i <= v_n loop
    v_opt := upper(p_args[i]);
    if v_opt = 'NX' then
      v_nx := true;
    elsif v_opt = 'XX' then
      v_xx := true;
    elsif v_opt = 'GET' then
      v_get := true;
    elsif v_opt = 'KEEPTTL' then
      v_keep := true;
    elsif v_opt in ('EX', 'PX', 'EXAT', 'PXAT') then
      if v_exp_set then perform downstash.raise_err('ERR syntax error'); end if;
      if i + 1 > v_n then perform downstash.err_args('set'); end if;
      v_num := downstash.to_int(p_args[i + 1], 'ERR value is not an integer or out of range');
      if v_num <= 0 then
        perform downstash.raise_err("ERR invalid expire time in 'set' command");
      end if;
      if v_opt = 'EX' then
        v_exp_at := now() + make_interval(secs => v_num);
      elsif v_opt = 'PX' then
        v_exp_at := now() + make_interval(secs => (v_num::numeric / 1000));
      elsif v_opt = 'EXAT' then
        v_exp_at := to_timestamp(v_num);
      else
        v_exp_at := to_timestamp(v_num::numeric / 1000);
      end if;
      v_exp_set := true;
      i := i + 1;
    else
      perform downstash.raise_err('ERR syntax error');
    end if;
    i := i + 1;
  end loop;

  if (v_nx and v_xx) or (v_keep and v_exp_set) then
    perform downstash.raise_err('ERR syntax error');
  end if;

  -- Lock current row to make NX/XX atomic.
  select * into v_row from downstash.kv
    where db_id = p_db and key = v_key
    for update;
  -- Treat an already-expired row as absent.
  if v_row.key is not null and v_row.expires_at is not null and v_row.expires_at <= now() then
    delete from downstash.kv where db_id = p_db and key = v_key;
    v_row.key := null;
  end if;
  v_has := v_row.key is not null;
  v_old := coalesce(v_row.val, 'null'::jsonb);

  if (v_nx and v_has) or (v_xx and not v_has) then
    if v_get then return v_old; end if;
    return 'null'::jsonb;
  end if;

  if v_keep and v_has then
    v_exp_at := v_row.expires_at;
  end if;

  perform downstash.put(p_db, v_key, 'string', to_jsonb(v_value), v_exp_at);
  if v_get then return v_old; end if;
  return '"OK"'::jsonb;
end;
$$;
comment on function downstash.cmd_set(uuid, text[]) is 'SET key value [NX|XX] [GET] [EX seconds|PX ms|EXAT ts|PXAT ms|KEEPTTL]';

-- ---------------------------------------------------------------------------
-- SETNX key value
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_setnx(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv;
begin
  select * into v_row from downstash.kv
    where db_id = p_db and key = p_args[1]
      and (expires_at is null or expires_at > now())
    for update;
  if v_row.key is not null then
    return '0'::jsonb;
  end if;
  perform downstash.put(p_db, p_args[1], 'string', to_jsonb(p_args[2]), null);
  return '1'::jsonb;
end;
$$;
comment on function downstash.cmd_setnx(uuid, text[]) is 'SETNX key value';

-- ---------------------------------------------------------------------------
-- SETEX key seconds value  /  PSETEX key ms value
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_setex(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  perform downstash.put(p_db, p_args[1], 'string', to_jsonb(p_args[3]),
    now() + make_interval(secs => downstash.to_int(p_args[2], "ERR invalid expire time in 'setex' command")));
  return '"OK"'::jsonb;
end;
$$;
comment on function downstash.cmd_setex(uuid, text[]) is 'SETEX key seconds value';

create or replace function downstash.cmd_psetex(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  perform downstash.put(p_db, p_args[1], 'string', to_jsonb(p_args[3]),
    now() + make_interval(secs => (downstash.to_int(p_args[2], "ERR invalid expire time in 'psetex' command")::numeric / 1000)));
  return '"OK"'::jsonb;
end;
$$;
comment on function downstash.cmd_psetex(uuid, text[]) is 'PSETEX key ms value';

-- ---------------------------------------------------------------------------
-- GETSET key value  (clears TTL)
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_getset(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_old jsonb;
begin
  v_old := coalesce(downstash.read_live(p_db, p_args[1], 'string').val, 'null'::jsonb);
  perform downstash.put(p_db, p_args[1], 'string', to_jsonb(p_args[2]), null);
  return v_old;
end;
$$;
comment on function downstash.cmd_getset(uuid, text[]) is 'GETSET key value';

-- ---------------------------------------------------------------------------
-- GETDEL key
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_getdel(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_old jsonb;
  v_deleted boolean;
begin
  select val into v_old from downstash.kv
    where db_id = p_db and key = p_args[1] and type = 'string'
      and (expires_at is null or expires_at > now())
    for update;
  if v_old is null then
    -- Might be a wrong-type key; surface WRONGTYPE.
    perform downstash.read_live(p_db, p_args[1], 'string');
    return 'null'::jsonb;
  end if;
  v_deleted := downstash.del_key(p_db, p_args[1]);
  return v_old;
end;
$$;
comment on function downstash.cmd_getdel(uuid, text[]) is 'GETDEL key';

-- ---------------------------------------------------------------------------
-- MGET key [key ...]  (wrong-type keys → null, as in Redis)
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_mget(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_row downstash.kv;
begin
  for i in 1 .. array_length(p_args, 1) loop
    v_row := downstash.read_live(p_db, p_args[i], null);
    if v_row.key is null or v_row.type <> 'string' then
      v_out := v_out || 'null'::jsonb;
    else
      v_out := v_out || v_row.val;
    end if;
  end loop;
  return v_out;
end;
$$;
comment on function downstash.cmd_mget(uuid, text[]) is 'MGET key [key ...]';

-- ---------------------------------------------------------------------------
-- MSET key value [key value ...]  (odd pair count → arity error already handled;
-- clears TTLs). Multi-key write: lock in sorted order to avoid deadlocks.
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_mset(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  i int;
begin
  perform downstash.check_key(p_args[1]);
  for i in 1 .. array_length(p_args, 1) by 2 loop
    perform downstash.check_key(p_args[i]);
    perform downstash.put(p_db, p_args[i], 'string', to_jsonb(p_args[i + 1]), null);
  end loop;
  return '"OK"'::jsonb;
end;
$$;
comment on function downstash.cmd_mset(uuid, text[]) is 'MSET key value [key value ...]';

-- ---------------------------------------------------------------------------
-- MSETNX key value [key value ...]  1 if all set, 0 if any exists (none set)
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_msetnx(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  i int;
  v_exists boolean;
begin
  for i in 1 .. array_length(p_args, 1) by 2 loop
    perform downstash.check_key(p_args[i]);
    if exists (select 1 from downstash.kv
      where db_id = p_db and key = p_args[i]
        and (expires_at is null or expires_at > now())) then
      v_exists := true;
    end if;
  end loop;
  if v_exists then
    return '0'::jsonb;
  end if;
  for i in 1 .. array_length(p_args, 1) by 2 loop
    perform downstash.put(p_db, p_args[i], 'string', to_jsonb(p_args[i + 1]), null);
  end loop;
  return '1'::jsonb;
end;
$$;
comment on function downstash.cmd_msetnx(uuid, text[]) is 'MSETNX key value [key value ...]';

-- ---------------------------------------------------------------------------
-- Integer helper. Math in numeric; overflow → error.
-- ---------------------------------------------------------------------------
create or replace function downstash.incr_by(p_db uuid, p_key text, p_delta numeric)
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_cur numeric;
  v_new numeric;
begin
  select * into v_slot from downstash.lock_or_create(p_db, p_key, 'string', '"0"'::jsonb);
  v_cur := downstash.to_int((v_slot.o_row).val #>> '{}')::numeric;
  v_new := v_cur + p_delta;
  if v_new < -9223372036854775808 or v_new > 9223372036854775807 then
    perform downstash.raise_err('ERR increment or decrement would overflow');
  end if;
  perform downstash.set_val(p_db, p_key, to_jsonb(v_new::bigint::text));
  return to_jsonb(v_new::bigint);
end;
$$;

create or replace function downstash.cmd_incr(p_db uuid, p_args text[])
returns jsonb language plpgsql volatile set search_path = '' as $$
begin return downstash.incr_by(p_db, p_args[1], 1); end; $$;
comment on function downstash.cmd_incr(uuid, text[]) is 'INCR key';

create or replace function downstash.cmd_decr(p_db uuid, p_args text[])
returns jsonb language plpgsql volatile set search_path = '' as $$
begin return downstash.incr_by(p_db, p_args[1], -1); end; $$;
comment on function downstash.cmd_decr(uuid, text[]) is 'DECR key';

create or replace function downstash.cmd_incrby(p_db uuid, p_args text[])
returns jsonb language plpgsql volatile set search_path = '' as $$
begin return downstash.incr_by(p_db, p_args[1], downstash.to_int(p_args[2])::numeric); end; $$;
comment on function downstash.cmd_incrby(uuid, text[]) is 'INCRBY key increment';

create or replace function downstash.cmd_decrby(p_db uuid, p_args text[])
returns jsonb language plpgsql volatile set search_path = '' as $$
begin return downstash.incr_by(p_db, p_args[1], -downstash.to_int(p_args[2])::numeric); end; $$;
comment on function downstash.cmd_decrby(uuid, text[]) is 'DECRBY key decrement';

-- INCRBYFLOAT: float math, reply via fmt_float.
create or replace function downstash.cmd_incrbyfloat(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_cur double precision;
  v_new double precision;
begin
  v_new := downstash.to_float(p_args[2], false, 'ERR value is not a valid float');
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'string', '"0"'::jsonb);
  v_cur := downstash.to_float((v_slot.o_row).val #>> '{}', false, 'ERR value is not a valid float');
  v_new := v_cur + v_new;
  perform downstash.set_val(p_db, p_args[1], to_jsonb(downstash.fmt_float(v_new)));
  return to_jsonb(downstash.fmt_float(v_new));
end;
$$;
comment on function downstash.cmd_incrbyfloat(uuid, text[]) is 'INCRBYFLOAT key increment';

-- ---------------------------------------------------------------------------
-- APPEND key value → new UTF-8 byte length
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_append(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val text;
begin
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'string', '""'::jsonb);
  v_val := coalesce((v_slot.o_row).val #>> '{}', '') || p_args[2];
  perform downstash.set_val(p_db, p_args[1], to_jsonb(v_val));
  return to_jsonb(octet_length(v_val));
end;
$$;
comment on function downstash.cmd_append(uuid, text[]) is 'APPEND key value';

-- ---------------------------------------------------------------------------
-- STRLEN key → byte length or 0
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_strlen(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'string');
  if v_row.key is null then
    return '0'::jsonb;
  end if;
  return to_jsonb(octet_length(v_row.val #>> '{}'));
end;
$$;
comment on function downstash.cmd_strlen(uuid, text[]) is 'STRLEN key';

-- ---------------------------------------------------------------------------
-- Register string commands (§7.8).
-- ---------------------------------------------------------------------------
insert into downstash.command_registry (name, handler, arity, flags, first_key, last_key, key_step, family, summary) values
  ('GET',  'downstash.cmd_get',  2,  '{read,cacheable}', 1, 1, 1, 'strings', 'Get the value of a key'),
  ('SET',  'downstash.cmd_set',  -3, '{write}',          1, 1, 1, 'strings', 'Set the string value of a key'),
  ('SETNX','downstash.cmd_setnx', 3, '{write}',          1, 1, 1, 'strings', 'Set the value of a key, only if the key does not exist'),
  ('SETEX','downstash.cmd_setex', 4, '{write}',          1, 1, 1, 'strings', 'Set the value and expiration of a key'),
  ('PSETEX','downstash.cmd_psetex', 4, '{write}',        1, 1, 1, 'strings', 'Set the value and time to live in milliseconds of a key'),
  ('GETSET','downstash.cmd_getset', 3, '{write}',        1, 1, 1, 'strings', 'Set the string value of a key and return its old value'),
  ('GETDEL','downstash.cmd_getdel', 2, '{write}',        1, 1, 1, 'strings', 'Get the value of a key and delete it'),
  ('MGET', 'downstash.cmd_mget', -2, '{read,cacheable}', 1, -1, 1, 'strings', 'Get the values of all the given keys'),
  ('MSET', 'downstash.cmd_mset', -3, '{write}',          1, -1, 2, 'strings', 'Set multiple keys to multiple values'),
  ('MSETNX','downstash.cmd_msetnx', -3, '{write}',       1, -1, 2, 'strings', 'Set multiple keys to multiple values, only if none exist'),
  ('INCR', 'downstash.cmd_incr', 2,  '{write}',          1, 1, 1, 'strings', 'Increment the integer value of a key by one'),
  ('DECR', 'downstash.cmd_decr', 2,  '{write}',          1, 1, 1, 'strings', 'Decrement the integer value of a key by one'),
  ('INCRBY','downstash.cmd_incrby', 3, '{write}',        1, 1, 1, 'strings', 'Increment the integer value of a key by the given amount'),
  ('DECRBY','downstash.cmd_decrby', 3, '{write}',        1, 1, 1, 'strings', 'Decrement the integer value of a key by the given number'),
  ('INCRBYFLOAT','downstash.cmd_incrbyfloat', 3, '{write}', 1, 1, 1, 'strings', 'Increment the float value of a key by the given amount'),
  ('APPEND','downstash.cmd_append', 3, '{write}',        1, 1, 1, 'strings', 'Append a value to a key'),
  ('STRLEN','downstash.cmd_strlen', 2, '{read}',         1, 1, 1, 'strings', 'Get the length of the value stored in a key')
on conflict (name) do update set
  handler = excluded.handler, arity = excluded.arity, flags = excluded.flags,
  first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step,
  family = excluded.family, summary = excluded.summary;



