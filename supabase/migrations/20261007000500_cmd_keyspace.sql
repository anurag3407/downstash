-- @file Keyspace & expiry commands (§7.8). DEL/EXISTS/TYPE/KEYS/SCAN/RENAME/
-- RANDOMKEY/EXPIRE*/TTL/PERSIST.
-- @see docs/engine/commands.md

-- ---------------------------------------------------------------------------
-- DEL key [key ...] / UNLINK (identical here: same atomic delete)
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_del(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_removed int := 0;
begin
  -- Lock in sorted key order to avoid deadlocks across multi-key writes.
  for i in 1 .. array_length(p_args, 1) loop
    if downstash.del_key(p_db, p_args[i]) then
      v_removed := v_removed + 1;
    end if;
  end loop;
  return to_jsonb(v_removed);
end;
$$;
comment on function downstash.cmd_del(uuid, text[]) is 'DEL key [key ...]';

create or replace function downstash.cmd_unlink(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  return downstash.cmd_del(p_db, p_args);
end;
$$;
comment on function downstash.cmd_unlink(uuid, text[]) is 'UNLINK key [key ...]';

-- ---------------------------------------------------------------------------
-- EXISTS key [key ...]  (repeated keys count repeatedly)
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_exists(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_count int := 0;
  r downstash.kv;
begin
  for i in 1 .. array_length(p_args, 1) loop
    r := downstash.read_live(p_db, p_args[i], null);
    if r.key is not null then
      v_count := v_count + 1;
    end if;
  end loop;
  return to_jsonb(v_count);
end;
$$;
comment on function downstash.cmd_exists(uuid, text[]) is 'EXISTS key [key ...]';

-- ---------------------------------------------------------------------------
-- TYPE key
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_type(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  r downstash.kv;
begin
  r := downstash.read_live(p_db, p_args[1], null);
  if r.key is null then
    return '"none"'::jsonb;
  end if;
  return to_jsonb(r.type);
end;
$$;
comment on function downstash.cmd_type(uuid, text[]) is 'TYPE key';

-- ---------------------------------------------------------------------------
-- KEYS pattern  (hard cap 10000 → error advising SCAN)
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_keys(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_pattern text := p_args[1];
  v_prefix  text := downstash.glob_prefix(v_pattern);
  v_regex   text := downstash.glob_to_regex(v_pattern);
  v_like    text;
  v_keys    jsonb := '[]'::jsonb;
  v_count   int := 0;
  v_key     text;
begin
  -- btree range via prefix; LIKE pre-filter; anchored regex final match.
  v_like := downstash.like_escape(v_prefix) || '%';
  for v_key in
    select key from downstash.kv
      where db_id = p_db
        and (expires_at is null or expires_at > now())
        and key collate "C" like v_like escape '\'
      order by key collate "C"
  loop
    if v_key ~ v_regex then
      v_count := v_count + 1;
      if v_count > 10000 then
        perform downstash.raise_err('ERR Downstash: KEYS matched more than 10000 keys, use SCAN');
      end if;
      v_keys := v_keys || to_jsonb(v_key);
    end if;
  end loop;
  return v_keys;
end;
$$;
comment on function downstash.cmd_keys(uuid, text[]) is 'KEYS pattern';

-- ---------------------------------------------------------------------------
-- SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]
-- Cursor "0" starts a new scan; a non-zero cursor is a scan_cursors.id that
-- must belong to p_db (unknown → ["0",[]]). Returns ["<next>",[keys]].
-- ---------------------------------------------------------------------------
create or replace function downstash.cmd_scan(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_cursor_id bigint;
  v_last_key  text;
  v_match     text;
  v_type      text;
  v_count     int := 10;
  v_n         int := array_length(p_args, 1);
  i           int := 2;
  v_keys      jsonb := '[]'::jsonb;
  v_seen      int := 0;
  v_next      bigint := 0;
  v_has_more  boolean := false;
  v_regex     text;
  v_prefix    text;
  v_like      text;
  v_key       text;
begin
  -- Parse options first.
  while i <= v_n loop
    case upper(p_args[i])
      when 'MATCH' then
        if i + 1 > v_n then perform downstash.err_args('scan'); end if;
        v_match := p_args[i + 1]; i := i + 2;
      when 'COUNT' then
        if i + 1 > v_n then perform downstash.err_args('scan'); end if;
        v_count := downstash.to_int(p_args[i + 1]);
        if v_count < 1 then perform downstash.raise_err('ERR syntax error'); end if;
        v_count := least(v_count, 1000); i := i + 2;
      when 'TYPE' then
        if i + 1 > v_n then perform downstash.err_args('scan'); end if;
        v_type := lower(p_args[i + 1]); i := i + 2;
      else
        perform downstash.raise_err('ERR syntax error');
    end case;
  end loop;

  -- Resolve cursor.
  if p_args[1] = '0' then
    v_last_key := '';
  else
    begin
      v_cursor_id := p_args[1]::bigint;
    exception when others then
      return jsonb_build_array('0', '[]'::jsonb);
    end;
    select last_key into v_last_key from downstash.scan_cursors
      where id = v_cursor_id and db_id = p_db;
    if not found then
      return jsonb_build_array('0', '[]'::jsonb);
    end if;
  end if;

  -- Build a range scan starting after v_last_key.
  v_regex := null; v_prefix := null; v_like := null;
  if v_match is not null then
    v_prefix := downstash.glob_prefix(v_match);
    v_regex := downstash.glob_to_regex(v_match);
    v_like := downstash.like_escape(v_prefix) || '%';
  end if;

  for v_key in
    select key from downstash.kv
      where db_id = p_db
        and key collate "C" > v_last_key
        and (expires_at is null or expires_at > now())
        and (v_type is null or type = v_type)
      order by key collate "C"
  loop
    if v_regex is not null then
      if not (v_key like v_like escape '\' and v_key ~ v_regex) then
        continue;
      end if;
    end if;
    if v_seen < v_count then
      v_keys := v_keys || to_jsonb(v_key);
      v_seen := v_seen + 1;
    else
      -- One more exists → open a new cursor at the previous key.
      v_has_more := true;
      exit;
    end if;
  end loop;

  if v_has_more then
    insert into downstash.scan_cursors (db_id, last_key)
      values (p_db, (v_keys::jsonb #>> '[-1]'))
      returning id into v_next;
  end if;

  return jsonb_build_array(v_next::text, v_keys);
end;
$$;
comment on function downstash.cmd_scan(uuid, text[]) is 'SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]';

-- ---------------------------------------------------------------------------
-- Shared expiry setter with NX/XX/GT/LT guards (§7.8).
-- ---------------------------------------------------------------------------
create or replace function downstash.apply_expire(
  p_db uuid, p_key text, p_expires_at timestamptz,
  p_nx boolean, p_xx boolean, p_gt boolean, p_lt boolean
) returns int
language plpgsql
volatile
set search_path = ''
as $$
declare
  r downstash.kv;
begin
  r := downstash.lock_live(p_db, p_key, null);
  if r.key is null then
    return 0;
  end if;
  if p_nx and r.expires_at is not null then return 0; end if;
  if p_xx and r.expires_at is null then return 0; end if;
  if p_gt and (r.expires_at is null or p_expires_at <= r.expires_at) then return 0; end if;
  if p_lt and (r.expires_at is not null and p_expires_at >= r.expires_at) then return 0; end if;
  update downstash.kv set expires_at = p_expires_at, updated_at = now()
    where db_id = p_db and key = p_key;
  return 1;
end;
$$;

-- Parse [NX|XX|GT|LT] options from p_args[start].
create or replace function downstash.parse_expire_opts(
  p_args text[], p_start int,
  out o_nx boolean, out o_xx boolean, out o_gt boolean, out o_lt boolean
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  i int;
begin
  o_nx := false; o_xx := false; o_gt := false; o_lt := false;
  for i in p_start .. coalesce(array_length(p_args, 1), p_start - 1) loop
    case upper(p_args[i])
      when 'NX' then o_nx := true;
      when 'XX' then o_xx := true;
      when 'GT' then o_gt := true;
      when 'LT' then o_lt := true;
      else perform downstash.raise_err('ERR syntax error');
    end case;
  end loop;
end;
$$;

-- EXPIRE key seconds [NX|XX|GT|LT]
create or replace function downstash.cmd_expire(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_seconds bigint;
  v_opts record;
begin
  v_seconds := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  v_opts := downstash.parse_expire_opts(p_args, 3);
  if v_seconds <= 0 then
    -- Non-positive expiry deletes the key (returns 1 if it existed, else 0).
    if downstash.del_key(p_db, p_args[1]) then
      return to_jsonb(1);
    end if;
    return to_jsonb(0);
  end if;
  return to_jsonb(downstash.apply_expire(
    p_db, p_args[1], now() + v_seconds * interval '1 second',
    v_opts.o_nx, v_opts.o_xx, v_opts.o_gt, v_opts.o_lt));
end;
$$;
comment on function downstash.cmd_expire(uuid, text[]) is 'EXPIRE key seconds [NX|XX|GT|LT]';

-- PEXPIRE key ms [NX|XX|GT|LT]
create or replace function downstash.cmd_pexpire(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_ms bigint;
  v_opts record;
begin
  v_ms := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  v_opts := downstash.parse_expire_opts(p_args, 3);
  if v_ms <= 0 then
    if downstash.del_key(p_db, p_args[1]) then
      return to_jsonb(1);
    end if;
    return to_jsonb(0);
  end if;
  return to_jsonb(downstash.apply_expire(
    p_db, p_args[1], now() + v_ms * interval '1 millisecond',
    v_opts.o_nx, v_opts.o_xx, v_opts.o_gt, v_opts.o_lt));
end;
$$;
comment on function downstash.cmd_pexpire(uuid, text[]) is 'PEXPIRE key ms [NX|XX|GT|LT]';

-- EXPIREAT key unix-seconds [NX|XX|GT|LT]
create or replace function downstash.cmd_expireat(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_ts bigint;
  v_opts record;
begin
  v_ts := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  v_opts := downstash.parse_expire_opts(p_args, 3);
  if v_ts <= (extract(epoch from now()))::bigint then
    if downstash.del_key(p_db, p_args[1]) then
      return to_jsonb(1);
    end if;
    return to_jsonb(0);
  end if;
  return to_jsonb(downstash.apply_expire(
    p_db, p_args[1], to_timestamp(v_ts),
    v_opts.o_nx, v_opts.o_xx, v_opts.o_gt, v_opts.o_lt));
end;
$$;
comment on function downstash.cmd_expireat(uuid, text[]) is 'EXPIREAT key unix-seconds [NX|XX|GT|LT]';

-- PEXPIREAT key unix-ms [NX|XX|GT|LT]
create or replace function downstash.cmd_pexpireat(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_ms bigint;
  v_opts record;
begin
  v_ms := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  v_opts := downstash.parse_expire_opts(p_args, 3);
  if v_ms <= (extract(epoch from now()) * 1000)::bigint then
    if downstash.del_key(p_db, p_args[1]) then
      return to_jsonb(1);
    end if;
    return to_jsonb(0);
  end if;
  return to_jsonb(downstash.apply_expire(
    p_db, p_args[1], to_timestamp(v_ms / 1000.0),
    v_opts.o_nx, v_opts.o_xx, v_opts.o_gt, v_opts.o_lt));
end;
$$;
comment on function downstash.cmd_pexpireat(uuid, text[]) is 'PEXPIREAT key unix-ms [NX|XX|GT|LT]';

-- RENAME key newkey  /  RENAMENX key newkey
create or replace function downstash.cmd_rename(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_src downstash.kv;
begin
  v_src := downstash.lock_live(p_db, p_args[1], null);
  if v_src.key is null then
    perform downstash.raise_err('ERR no such key');
  end if;
  delete from downstash.kv where db_id = p_db and key = p_args[2];
  update downstash.kv
    set key = p_args[2], updated_at = now()
    where db_id = p_db and key = p_args[1];
  return '"OK"'::jsonb;
end;
$$;
comment on function downstash.cmd_rename(uuid, text[]) is 'RENAME key newkey';

create or replace function downstash.cmd_renamenx(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_src downstash.kv;
  v_exists boolean;
begin
  v_src := downstash.lock_live(p_db, p_args[1], null);
  if v_src.key is null then
    perform downstash.raise_err('ERR no such key');
  end if;
  select exists(
    select 1 from downstash.kv
      where db_id = p_db and key = p_args[2]
        and (expires_at is null or expires_at > now())
  ) into v_exists;
  if v_exists then
    return to_jsonb(0);
  end if;
  update downstash.kv
    set key = p_args[2], updated_at = now()
    where db_id = p_db and key = p_args[1];
  return to_jsonb(1);
end;
$$;
comment on function downstash.cmd_renamenx(uuid, text[]) is 'RENAMENX key newkey';

-- RANDOMKEY
create or replace function downstash.cmd_randomkey(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_key text;
begin
  select key into v_key from downstash.kv
    where db_id = p_db and (expires_at is null or expires_at > now())
    offset floor(random() * (
      select count(*) from downstash.kv
        where db_id = p_db and (expires_at is null or expires_at > now())
    ))
    limit 1;
  return to_jsonb(v_key);
end;
$$;
comment on function downstash.cmd_randomkey(uuid, text[]) is 'RANDOMKEY';

-- TTL key → remaining seconds (round(ms/1000)), -1 no TTL, -2 missing.
create or replace function downstash.cmd_ttl(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  r downstash.kv;
begin
  r := downstash.read_live(p_db, p_args[1], null);
  if r.key is null then
    return to_jsonb((-2)::bigint);
  end if;
  if r.expires_at is null then
    return to_jsonb((-1)::bigint);
  end if;
  return to_jsonb(round(extract(epoch from (r.expires_at - now())))::bigint);
end;
$$;
comment on function downstash.cmd_ttl(uuid, text[]) is 'TTL key';

-- PTTL key → remaining milliseconds, -1 no TTL, -2 missing.
create or replace function downstash.cmd_pttl(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  r downstash.kv;
begin
  r := downstash.read_live(p_db, p_args[1], null);
  if r.key is null then
    return to_jsonb((-2)::bigint);
  end if;
  if r.expires_at is null then
    return to_jsonb((-1)::bigint);
  end if;
  return to_jsonb(greatest(0, ceil(extract(epoch from (r.expires_at - now())) * 1000))::bigint);
end;
$$;
comment on function downstash.cmd_pttl(uuid, text[]) is 'PTTL key';

-- PERSIST key → 1 if a TTL was removed, else 0.
create or replace function downstash.cmd_persist(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  r downstash.kv;
begin
  r := downstash.lock_live(p_db, p_args[1], null);
  if r.key is null or r.expires_at is null then
    return to_jsonb(0::bigint);
  end if;
  update downstash.kv set expires_at = null, updated_at = now()
    where db_id = p_db and key = p_args[1];
  return to_jsonb(1::bigint);
end;
$$;
comment on function downstash.cmd_persist(uuid, text[]) is 'PERSIST key';

insert into downstash.command_registry (name, handler, arity, flags, first_key, last_key, key_step, family, summary) values
  ('DEL',       'downstash.cmd_del',       -2, '{write}',        1, -1, 1, 'keyspace', 'Delete a key'),
  ('UNLINK',    'downstash.cmd_unlink',    -2, '{write}',        1, -1, 1, 'keyspace', 'Delete a key asynchronously in another thread'),
  ('EXISTS',    'downstash.cmd_exists',    -2, '{read}',         1, -1, 1, 'keyspace', 'Determine if a key exists'),
  ('TYPE',      'downstash.cmd_type',      2,  '{read}',         1, 1, 1, 'keyspace', 'Determine the type stored at key'),
  ('KEYS',      'downstash.cmd_keys',      2,  '{read}',         0, 0, 0, 'keyspace', 'Find all keys matching the given pattern'),
  ('SCAN',      'downstash.cmd_scan',      -2, '{read}',         0, 0, 0, 'keyspace', 'Incrementally iterate the keys space'),
  ('RENAME',    'downstash.cmd_rename',    3,  '{write}',        1, 2, 1, 'keyspace', 'Rename a key'),
  ('RENAMENX',  'downstash.cmd_renamenx',  3,  '{write}',        1, 2, 1, 'keyspace', 'Rename a key, only if the new key does not exist'),
  ('RANDOMKEY', 'downstash.cmd_randomkey', 1,  '{read}',         0, 0, 0, 'keyspace', 'Return a random key from the keyspace'),
  ('EXPIRE',    'downstash.cmd_expire',    -3, '{write}',        1, 1, 1, 'keyspace', 'Set a seconds time to live on a key'),
  ('PEXPIRE',   'downstash.cmd_pexpire',   -3, '{write}',        1, 1, 1, 'keyspace', 'Set a milliseconds time to live on a key'),
  ('EXPIREAT',  'downstash.cmd_expireat',  -3, '{write}',        1, 1, 1, 'keyspace', 'Set the expiration for a key as a Unix timestamp'),
  ('PEXPIREAT', 'downstash.cmd_pexpireat', -3, '{write}',        1, 1, 1, 'keyspace', 'Set the expiration for a key as a Unix milliseconds timestamp'),
  ('TTL',       'downstash.cmd_ttl',       2,  '{read}',         1, 1, 1, 'keyspace', 'Get the time to live for a key in seconds'),
  ('PTTL',      'downstash.cmd_pttl',      2,  '{read}',         1, 1, 1, 'keyspace', 'Get the time to live for a key in milliseconds'),
  ('PERSIST',   'downstash.cmd_persist',   2,  '{write}',        1, 1, 1, 'keyspace', 'Remove the expiration from a key')
on conflict (name) do update set
  handler = excluded.handler, arity = excluded.arity, flags = excluded.flags,
  first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step,
  family = excluded.family, summary = excluded.summary;



