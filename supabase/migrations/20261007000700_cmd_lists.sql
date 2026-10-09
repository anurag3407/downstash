-- ---------------------------------------------------------------------------
-- 00700 — List command handlers (§7.8 lists family). Value = JSON array of
-- elements (index 0 = head). LPUSH prepends; RPUSH appends.
-- ---------------------------------------------------------------------------

create or replace function downstash.cmd_lpush(p_db uuid, p_args text[], p_left boolean default true, p_xx boolean default false)
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_slot record;
  v_val jsonb;
  i int := 2;
  v_head text[] := '{}';
begin
  select * into v_slot from downstash.lock_or_create(p_db, p_args[1], 'list', '[]'::jsonb);
  v_val := coalesce((v_slot.o_row).val, '[]'::jsonb);
  if p_xx and not v_slot.o_created and v_val = '[]'::jsonb then
    return to_jsonb(0);
  end if;
  if p_xx and v_slot.o_created then
    -- key did not exist; LPUSHX/RPUSHX return 0
    return to_jsonb(0);
  end if;
  -- collect pushed elements in argv order
  while i <= array_length(p_args, 1) loop
    v_head := v_head || p_args[i];
    i := i + 1;
  end loop;
  if p_left then
    -- LPUSH a b c => [c, b, a]: each element becomes the new head, in argv order
    for i in 1..array_length(v_head, 1) loop
      v_val := to_jsonb(v_head[i])::jsonb || v_val;
    end loop;
  else
    v_val := v_val || to_jsonb(v_head)::jsonb;
  end if;
  perform downstash.set_val(p_db, p_args[1], v_val);
  return to_jsonb(jsonb_array_length(v_val));
end;
$$;
comment on function downstash.cmd_lpush(uuid, text[], boolean, boolean) is 'LPUSH/RPUSH/LPUSHX/RPUSHX';

create or replace function downstash.cmd_rpush(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  return downstash.cmd_lpush(p_db, p_args, false, false);
end;
$$;
comment on function downstash.cmd_rpush(uuid, text[]) is 'RPUSH key element [element ...]';

create or replace function downstash.cmd_lpushx(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  return downstash.cmd_lpush(p_db, p_args, true, true);
end;
$$;
comment on function downstash.cmd_lpushx(uuid, text[]) is 'LPUSHX key element [element ...]';

create or replace function downstash.cmd_rpushx(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  return downstash.cmd_lpush(p_db, p_args, false, true);
end;
$$;
comment on function downstash.cmd_rpushx(uuid, text[]) is 'RPUSHX key element [element ...]';

create or replace function downstash.cmd_lpop(p_db uuid, p_args text[], p_left boolean default true)
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv;
  v_val jsonb;
  v_len int;
  v_cnt int;
  v_out jsonb;
begin
  v_row := downstash.lock_live(p_db, p_args[1], 'list');
  if v_row.key is null then
    if array_length(p_args, 1) >= 2 then return 'null'::jsonb; end if;
    return 'null'::jsonb;
  end if;
  v_val := v_row.val;
  v_len := jsonb_array_length(v_val);
  if array_length(p_args, 1) >= 2 then
    v_cnt := least(downstash.to_int(p_args[2], 'ERR value is not an integer or out of range'), v_len);
    if p_left then
      v_out := (select jsonb_agg(e) from (select jsonb_array_elements(v_val) as e limit v_cnt) t);
      v_val := (select jsonb_agg(e) from (select jsonb_array_elements(v_val) as e offset v_cnt) t);
    else
      v_out := (select jsonb_agg(e) from (select e from jsonb_array_elements(v_val) with ordinality as t(e, ord) order by ord desc limit v_cnt) s);
      v_out := (select jsonb_agg(e) from (select e from (select jsonb_array_elements(v_val) as e) sub order by 1) z);
      v_val := (select jsonb_agg(e) from (select jsonb_array_elements(v_val) as e limit v_len - v_cnt) t);
    end if;
    v_val := coalesce(v_val, '[]'::jsonb);
    if v_val = '[]'::jsonb then perform downstash.del_key(p_db, p_args[1]); else perform downstash.set_val(p_db, p_args[1], v_val); end if;
    return v_out;
  else
    if p_left then
      v_out := v_val -> 0;
      v_val := v_val - 0;
    else
      v_out := v_val -> (v_len - 1);
      v_val := v_val - (v_len - 1);
    end if;
    if jsonb_array_length(v_val) = 0 then perform downstash.del_key(p_db, p_args[1]); else perform downstash.set_val(p_db, p_args[1], v_val); end if;
    return v_out;
  end if;
end;
$$;
comment on function downstash.cmd_lpop(uuid, text[], boolean) is 'LPOP/RPOP key [count]';

create or replace function downstash.cmd_rpop(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  return downstash.cmd_lpop(p_db, p_args, false);
end;
$$;
comment on function downstash.cmd_rpop(uuid, text[]) is 'RPOP key [count]';

create or replace function downstash.cmd_lrange(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
  v_val jsonb;
  v_start int;
  v_stop int;
  v_len int;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'list');
  if v_row.key is null then return '[]'::jsonb; end if;
  v_val := v_row.val;
  v_len := jsonb_array_length(v_val);
  v_start := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  v_stop := downstash.to_int(p_args[3], 'ERR value is not an integer or out of range');
  if v_start < 0 then v_start := greatest(v_len + v_start, 0); end if;
  if v_stop < 0 then v_stop := v_len + v_stop; end if;
  v_stop := least(v_stop, v_len - 1);
  if v_start > v_stop then return '[]'::jsonb; end if;
  return (select jsonb_agg(e) from (select jsonb_array_elements(v_val) as e offset v_start limit v_stop - v_start + 1) t);
end;
$$;
comment on function downstash.cmd_lrange(uuid, text[]) is 'LRANGE key start stop';

create or replace function downstash.cmd_llen(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'list');
  if v_row.key is null then return to_jsonb(0); end if;
  return to_jsonb(jsonb_array_length(v_row.val));
end;
$$;
comment on function downstash.cmd_llen(uuid, text[]) is 'LLEN key';

create or replace function downstash.cmd_lindex(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
  v_idx int;
  v_len int;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'list');
  if v_row.key is null then return 'null'::jsonb; end if;
  v_len := jsonb_array_length(v_row.val);
  v_idx := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  if v_idx < 0 then v_idx := v_len + v_idx; end if;
  if v_idx < 0 or v_idx >= v_len then return 'null'::jsonb; end if;
  return v_row.val -> v_idx;
end;
$$;
comment on function downstash.cmd_lindex(uuid, text[]) is 'LINDEX key index';

create or replace function downstash.cmd_lset(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv;
  v_idx int;
  v_len int;
begin
  v_row := downstash.lock_live(p_db, p_args[1], 'list');
  if v_row.key is null then perform downstash.raise_err('ERR no such key'); end if;
  v_len := jsonb_array_length(v_row.val);
  v_idx := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  if v_idx < 0 then v_idx := v_len + v_idx; end if;
  if v_idx < 0 or v_idx >= v_len then perform downstash.raise_err('ERR index out of range'); end if;
  perform downstash.set_val(p_db, p_args[1], jsonb_set(v_row.val, array[v_idx::text], to_jsonb(p_args[3])));
  return '"OK"'::jsonb;
end;
$$;
comment on function downstash.cmd_lset(uuid, text[]) is 'LSET key index element';

create or replace function downstash.cmd_lrem(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv;
  v_val jsonb;
  v_cnt int;
  v_elem text;
  v_removed int := 0;
  v_arr jsonb[];
  v_out jsonb[] := '{}';
begin
  v_row := downstash.lock_live(p_db, p_args[1], 'list');
  if v_row.key is null then return to_jsonb(0); end if;
  v_val := v_row.val;
  v_cnt := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  v_elem := p_args[3];
  select array_agg(e) into v_arr from jsonb_array_elements(v_val) e;
  -- Redis: count>0 head->tail, <0 tail->head, 0 all
  if v_cnt >= 0 then
    for i in 1..cardinality(v_arr) loop
      if (v_cnt = 0 or v_removed < v_cnt) and v_arr[i] = to_jsonb(v_elem) then
        v_removed := v_removed + 1;
      else
        v_out := v_out || v_arr[i];
      end if;
    end loop;
  else
    for i in reverse cardinality(v_arr)..1 loop
      if (v_removed < abs(v_cnt)) and v_arr[i] = to_jsonb(v_elem) then
        v_removed := v_removed + 1;
      else
        v_out := v_arr[i] || v_out;
      end if;
    end loop;
  end if;
  v_val := coalesce(array_to_json(v_out)::jsonb, '[]'::jsonb);
  if v_val = '[]'::jsonb then perform downstash.del_key(p_db, p_args[1]); else perform downstash.set_val(p_db, p_args[1], v_val); end if;
  return to_jsonb(v_removed);
end;
$$;
comment on function downstash.cmd_lrem(uuid, text[]) is 'LREM key count element';

create or replace function downstash.cmd_ltrim(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_row downstash.kv;
  v_val jsonb;
  v_start int;
  v_stop int;
  v_len int;
begin
  v_row := downstash.lock_live(p_db, p_args[1], 'list');
  if v_row.key is null then return '"OK"'::jsonb; end if;
  v_val := v_row.val;
  v_len := jsonb_array_length(v_val);
  v_start := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  v_stop := downstash.to_int(p_args[3], 'ERR value is not an integer or out of range');
  if v_start < 0 then v_start := greatest(v_len + v_start, 0); end if;
  if v_stop < 0 then v_stop := v_len + v_stop; end if;
  v_stop := least(v_stop, v_len - 1);
  if v_start > v_stop then perform downstash.del_key(p_db, p_args[1]); return '"OK"'::jsonb; end if;
  v_val := (select jsonb_agg(e) from (select jsonb_array_elements(v_val) as e offset v_start limit v_stop - v_start + 1) t);
  perform downstash.set_val(p_db, p_args[1], v_val);
  return '"OK"'::jsonb;
end;
$$;
comment on function downstash.cmd_ltrim(uuid, text[]) is 'LTRIM key start stop';

create or replace function downstash.cmd_lpos(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
  v_elem text;
  v_rank int := 1;
  v_count int := 1;
  v_maxlen int := 0;
  v_arr jsonb[];
  v_matches int := 0;
  v_out jsonb := '[]'::jsonb;
  i int;
begin
  v_row := downstash.read_live(p_db, p_args[1], 'list');
  if v_row.key is null then return 'null'::jsonb; end if;
  v_elem := p_args[2];
  i := 3;
  while i <= array_length(p_args, 1) loop
    if upper(p_args[i]) = 'RANK' then v_rank := downstash.to_int(p_args[i+1], 'ERR value is not an integer or out of range'); i := i + 1;
    elsif upper(p_args[i]) = 'COUNT' then v_count := downstash.to_int(p_args[i+1], 'ERR value is not an integer or out of range'); i := i + 1;
    elsif upper(p_args[i]) = 'MAXLEN' then v_maxlen := downstash.to_int(p_args[i+1], 'ERR value is not an integer or out of range'); i := i + 1;
    else perform downstash.raise_err('ERR syntax error');
    end if;
    i := i + 1;
  end loop;
  if v_rank = 0 then perform downstash.raise_err('ERR RANK can''t be zero: use 1 to start searching from the first match. Negative to search backward.'); end if;
  select array_agg(e) into v_arr from jsonb_array_elements(v_row.val) e;
  if v_rank > 0 then
    for i in 1..cardinality(v_arr) loop
      exit when v_maxlen > 0 and i > v_maxlen;
      if v_arr[i] = to_jsonb(v_elem) then
        v_matches := v_matches + 1;
        if v_matches >= v_rank then
          v_out := v_out || to_jsonb(i - 1);
          exit when v_count > 0 and jsonb_array_length(v_out) >= v_count;
        end if;
      end if;
    end loop;
  else
    for i in reverse cardinality(v_arr)..1 loop
      exit when v_maxlen > 0 and (cardinality(v_arr) - i + 1) > v_maxlen;
      if v_arr[i] = to_jsonb(v_elem) then
        v_matches := v_matches + 1;
        if v_matches >= abs(v_rank) then
          v_out := v_out || to_jsonb(i - 1);
          exit when v_count > 0 and jsonb_array_length(v_out) >= v_count;
        end if;
      end if;
    end loop;
  end if;
  if v_count = 0 then return coalesce(v_out, '[]'::jsonb); end if;
  if jsonb_array_length(v_out) = 0 then return 'null'::jsonb; end if;
  if v_count = 1 then return v_out -> 0; end if;
  return v_out;
end;
$$;
comment on function downstash.cmd_lpos(uuid, text[]) is 'LPOS key element [RANK rank] [COUNT num-matches] [MAXLEN len]';

-- Registry (§7.8 lists). All use key spec 1,1,1.
insert into downstash.command_registry (name, handler, arity, flags, first_key, last_key, key_step, family, summary)
values
  ('LPUSH',  'downstash.cmd_lpush',  -3, '{write}', 1, 1, 1, 'lists', 'Prepend one or more elements to a list'),
  ('RPUSH',  'downstash.cmd_rpush',  -3, '{write}', 1, 1, 1, 'lists', 'Append one or more elements to a list'),
  ('LPUSHX', 'downstash.cmd_lpushx', -3, '{write}', 1, 1, 1, 'lists', 'Prepend an element to a list, only if the list exists'),
  ('RPUSHX', 'downstash.cmd_rpushx', -3, '{write}', 1, 1, 1, 'lists', 'Append an element to a list, only if the list exists'),
  ('LPOP',   'downstash.cmd_lpop',   -2, '{write}', 1, 1, 1, 'lists', 'Remove and return elements from the beginning of a list'),
  ('RPOP',   'downstash.cmd_rpop',   -2, '{write}', 1, 1, 1, 'lists', 'Remove and return elements from the end of a list'),
  ('LRANGE', 'downstash.cmd_lrange', 4,  '{read,cacheable}', 1, 1, 1, 'lists', 'Get a range of elements from a list'),
  ('LLEN',   'downstash.cmd_llen',   2,  '{read}', 1, 1, 1, 'lists', 'Get the length of a list'),
  ('LINDEX', 'downstash.cmd_lindex', 3,  '{read}', 1, 1, 1, 'lists', 'Get an element from a list by its index'),
  ('LSET',   'downstash.cmd_lset',   4,  '{write}', 1, 1, 1, 'lists', 'Set the value of an element in a list by its index'),
  ('LREM',   'downstash.cmd_lrem',   4,  '{write}', 1, 1, 1, 'lists', 'Remove elements from a list'),
  ('LTRIM',  'downstash.cmd_ltrim',  4,  '{write}', 1, 1, 1, 'lists', 'Trim a list to the specified range'),
  ('LPOS',   'downstash.cmd_lpos',   -3, '{read}', 1, 1, 1, 'lists', 'Return the index of matching elements on a list')
on conflict (name) do update set
  handler = excluded.handler, arity = excluded.arity, flags = excluded.flags,
  first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step,
  family = excluded.family, summary = excluded.summary;
