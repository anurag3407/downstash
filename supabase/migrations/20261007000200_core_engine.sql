-- @file Core engine: parsing helpers, keyspace primitives, dispatch/run and the RPC surface.
-- @see docs/engine/concurrency.md
-- Every function is `set search_path = ''` and fully schema-qualified.

-- ---------------------------------------------------------------------------
-- Error helpers (§7.5). Command errors always use errcode 'DS000'.
-- ---------------------------------------------------------------------------
create or replace function downstash.raise_err(p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using message = p_message, errcode = 'DS000';
end;
$$;

create or replace function downstash.err_args(p_cmd text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform downstash.raise_err(format('ERR wrong number of arguments for ''%s'' command', lower(p_cmd)));
end;
$$;

-- ---------------------------------------------------------------------------
-- Numeric parsing (§7.5). No exception blocks: accept-by-regex then range check.
-- ---------------------------------------------------------------------------
create or replace function downstash.to_int(
  p_text text,
  p_message text default 'ERR value is not an integer or out of range'
) returns bigint
language plpgsql
immutable
set search_path = ''
as $$
declare
  v bigint;
begin
  if p_text !~ '^(0|-?[1-9][0-9]{0,18})$' then
    perform downstash.raise_err(p_message);
  end if;
  v := p_text::bigint;
  if v < -9223372036854775808 or v > 9223372036854775807 then
    perform downstash.raise_err(p_message);
  end if;
  return v;
end;
$$;

create or replace function downstash.to_float(
  p_text text,
  p_allow_inf boolean default false,
  p_message text default 'ERR value is not a valid float'
) returns double precision
language plpgsql
immutable
set search_path = ''
as $$
declare
  v double precision;
begin
  if p_allow_inf and p_text ~* '^(inf|\+inf|-inf)$' then
    if lower(p_text) = 'inf' or lower(p_text) = '+inf' then return 'infinity'::double precision; end if;
    return '-infinity'::double precision;
  end if;
  if p_text ~* '^(inf|\+inf|-inf|nan)$' then
    perform downstash.raise_err(p_message);
  end if;
  if p_text !~ '^[+-]?([0-9]+(\.[0-9]*)?|\.[0-9]+)([eE][+-]?[0-9]+)?$' then
    perform downstash.raise_err(p_message);
  end if;
  v := p_text::double precision;
  if v is null or v <> v then
    perform downstash.raise_err(p_message);
  end if;
  return v;
end;
$$;

-- Float formatting: shortest round-trip; integral values print without a decimal point.
create or replace function downstash.fmt_float(p_value double precision)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_value = 'infinity'::double precision then return 'inf'; end if;
  if p_value = '-infinity'::double precision then return '-inf'; end if;
  return p_value::text;
end;
$$;

-- Key length guard: max 2000 UTF-8 bytes (btree index entry limit).
create or replace function downstash.check_key(p_key text)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_key is null then
    perform downstash.raise_err('ERR Downstash: key exceeds 2000 bytes');
  end if;
  if octet_length(p_key) > 2000 then
    perform downstash.raise_err('ERR Downstash: key exceeds 2000 bytes');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Keyspace primitives (§7.5).
-- ---------------------------------------------------------------------------

-- Non-locking read. Missing/expired → a null row (check r.key is null).
create or replace function downstash.read_live(p_db uuid, p_key text, p_type text)
returns downstash.kv
language plpgsql
stable
set search_path = ''
as $$
declare
  r downstash.kv;
begin
  select * into r from downstash.kv
    where db_id = p_db and key = p_key
      and (expires_at is null or expires_at > now());
  if r.key is not null and p_type is not null and r.type <> p_type then
    perform downstash.raise_err('WRONGTYPE Operation against a key holding the wrong kind of value');
  end if;
  return r;
end;
$$;

-- Locking read (`for update`). Expired → delete and return a null row.
create or replace function downstash.lock_live(p_db uuid, p_key text, p_type text)
returns downstash.kv
language plpgsql
volatile
set search_path = ''
as $$
declare
  r downstash.kv;
begin
  select * into r from downstash.kv
    where db_id = p_db and key = p_key
    for update;
  if r.key is not null and r.expires_at is not null and r.expires_at <= now() then
    delete from downstash.kv where db_id = p_db and key = p_key;
    return r; -- caller must treat this as missing (expires_at set, but logically gone)
  end if;
  if r.key is not null and p_type is not null and r.type <> p_type then
    perform downstash.raise_err('WRONGTYPE Operation against a key holding the wrong kind of value');
  end if;
  return r;
end;
$$;

-- Read-modify-write primitive for keys that may not exist yet (INCR, HSET, ...).
create or replace function downstash.lock_or_create(
  p_db uuid, p_key text, p_type text, p_init jsonb,
  out o_row downstash.kv, out o_created boolean
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  i int := 0;
begin
  loop
    i := i + 1;
    o_row := downstash.lock_live(p_db, p_key, p_type);
    if o_row.key is not null then
      o_created := false;
      return;
    end if;
    begin
      insert into downstash.kv (db_id, key, type, val)
        values (p_db, p_key, p_type, p_init)
      on conflict do nothing
      returning * into o_row;
      if o_row.key is not null then
        o_created := true;
        return;
      end if;
    exception when unique_violation then
      -- Lost the race; retry.
    end;
    if i >= 5 then
      raise exception using message = 'lock_or_create retry limit', errcode = '40001';
    end if;
  end loop;
end;
$$;

-- Update the value of an already-locked key (keeps TTL).
create or replace function downstash.set_val(p_db uuid, p_key text, p_val jsonb)
returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  update downstash.kv set val = p_val, updated_at = now()
    where db_id = p_db and key = p_key;
end;
$$;

-- Full upsert (blind overwrite).
create or replace function downstash.put(
  p_db uuid, p_key text, p_type text, p_val jsonb, p_expires_at timestamptz
) returns void
language plpgsql
volatile
set search_path = ''
as $$
begin
  insert into downstash.kv (db_id, key, type, val, expires_at, updated_at)
    values (p_db, p_key, p_type, p_val, p_expires_at, now())
  on conflict (db_id, key) do update
    set type = excluded.type, val = excluded.val, expires_at = excluded.expires_at,
        updated_at = now();
end;
$$;

-- Delete one live key. An expired row is removed but returns false.
create or replace function downstash.del_key(p_db uuid, p_key text)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_was_live boolean;
begin
  delete from downstash.kv
    where db_id = p_db and key = p_key
      and (expires_at is null or expires_at > now());
  get diagnostics v_was_live = row_count;
  return v_was_live > 0;
end;
$$;

-- ---------------------------------------------------------------------------
-- argv parsing (§7.5 to_argv). Null bytes are rejected before reaching a handler.
-- ---------------------------------------------------------------------------
create or replace function downstash.to_argv(p_cmd jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_len int := jsonb_array_length(p_cmd);
  v_out text[] := array[]::text[];
  v_el  jsonb;
  v_s   text;
begin
  if p_cmd is null or jsonb_typeof(p_cmd) <> 'array' or v_len = 0 then
    perform downstash.raise_err('ERR Downstash: each command must be a JSON array of strings');
  end if;
  for i in 0 .. v_len - 1 loop
    v_el := p_cmd -> i;
    case jsonb_typeof(v_el)
      when 'string' then v_s := v_el #>> '{}';
      when 'number' then v_s := v_el #>> '{}';
      when 'boolean' then v_s := case when (v_el #>> '{}') = 'true' then 'true' else 'false' end;
      else
        perform downstash.raise_err('ERR Downstash: each command must be a JSON array of strings');
    end case;
    if position(chr(0) in v_s) > 0 then
      perform downstash.raise_err('ERR Downstash: command contains null bytes');
    end if;
    v_out := array_append(v_out, v_s);
  end loop;
  return v_out;
end;
$$;

-- Redis-style args preview: up to 3 args, each truncated to 128 chars.
create or replace function downstash.args_preview(p_args text[])
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text := '';
  v_arg text;
begin
  if p_args is null then return ''; end if;
  for i in 1 .. least(array_length(p_args, 1), 3) loop
    v_arg := left(p_args[i], 128);
    v_out := v_out || '''' || v_arg || ''' ';
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Glob → regex helpers (§7.5). * → .*, ? → ., [...] kept; everything else escaped.
-- ---------------------------------------------------------------------------
create or replace function downstash.glob_to_regex(p_pattern text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_out text := '^';
  v_len int := length(p_pattern);
  i int := 1;
  c text;
begin
  while i <= v_len loop
    c := substr(p_pattern, i, 1);
    if c = '*' then
      v_out := v_out || '.*';
    elsif c = '?' then
      v_out := v_out || '.';
    elsif c = '[' then
      v_out := v_out || '[';
    elsif c = ']' then
      v_out := v_out || ']';
    elsif c = '\' then
      -- Escaped char: take the next character literally.
      if i < v_len then
        v_out := v_out || regexp_replace(substr(p_pattern, i + 1, 1), '([.\+*?\(\)\[\]\{\}\|\^\$\\])', '\\\1', 'g');
        i := i + 1;
      end if;
    else
      v_out := v_out || regexp_replace(c, '([.\+*?\(\)\[\]\{\}\|\^\$\\])', '\\\1', 'g');
    end if;
    i := i + 1;
  end loop;
  return v_out || '$';
end;
$$;

-- Literal prefix before the first unescaped glob metacharacter (for btree range scans).
create or replace function downstash.glob_prefix(p_pattern text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_len int := length(p_pattern);
  i int := 1;
  c text;
begin
  while i <= v_len loop
    c := substr(p_pattern, i, 1);
    if c = '\' then
      i := i + 2;  -- skip escaped char
      continue;
    end if;
    if c = '*' or c = '?' or c = '[' then
      return left(p_pattern, i - 1);
    end if;
    i := i + 1;
  end loop;
  return p_pattern;
end;
$$;

-- Escape text for LIKE ... escape '\'.
create or replace function downstash.like_escape(p_text text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  return replace(replace(replace(p_text, '\', '\\'), '%', '\%'), '_', '\_');
end;
$$;

-- ---------------------------------------------------------------------------
-- Usage accounting (§7.5 record_usage). One row per database per UTC hour.
-- ---------------------------------------------------------------------------
create or replace function downstash.record_usage(
  p_db uuid, p_source text, p_commands int, p_reads int, p_writes int,
  p_errors int, p_l1_hits int, p_bytes_in bigint, p_bytes_out bigint
) returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_hour timestamptz := date_trunc('hour', now() at time zone 'utc') at time zone 'utc';
begin
  insert into downstash.usage_hourly as u
    (db_id, hour, requests, commands, reads, writes, errors, l1_hits,
     failover_requests, console_commands, bytes_in, bytes_out)
  values
    (p_db, v_hour,
     case when p_source in ('gateway', 'failover') then 1 else 0 end,
     p_commands, p_reads, p_writes, p_errors, p_l1_hits,
     case when p_source = 'failover' then 1 else 0 end,
     case when p_source = 'console' then p_commands else 0 end,
     p_bytes_in, p_bytes_out)
  on conflict (db_id, hour) do update set
    requests          = u.requests + excluded.requests,
    commands          = u.commands + excluded.commands,
    reads             = u.reads + excluded.reads,
    writes            = u.writes + excluded.writes,
    errors            = u.errors + excluded.errors,
    l1_hits           = u.l1_hits + excluded.l1_hits,
    failover_requests = u.failover_requests + excluded.failover_requests,
    console_commands  = u.console_commands + excluded.console_commands,
    bytes_in          = u.bytes_in + excluded.bytes_in,
    bytes_out         = u.bytes_out + excluded.bytes_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatch (§7.5.1). p_argv INCLUDES the command name (p_argv[1]); handlers
-- receive p_argv[2:v_n] (args only). Returns the reply and the command flags.
-- ---------------------------------------------------------------------------
create or replace function downstash.dispatch(
  p_db uuid, p_readonly boolean, p_argv text[],
  out o_result jsonb, out o_flags text[]
)
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_n    int := coalesce(array_length(p_argv, 1), 0);
  v_name text;
  r      record;
  i      int;
  v_last int;
begin
  if v_n = 0 then
    perform downstash.raise_err('ERR empty command');
  end if;
  v_name := upper(p_argv[1]);
  select * into r from downstash.command_registry where name = v_name;
  if not found then
    perform downstash.raise_err(format(
      'ERR unknown command ''%s'', with args beginning with: %s',
      p_argv[1], downstash.args_preview(p_argv[2:v_n])));
  end if;
  if (r.arity > 0 and v_n <> r.arity) or (r.arity < 0 and v_n < -r.arity) then
    perform downstash.err_args(v_name);
  end if;
  if p_readonly and 'write' = any(r.flags) then
    perform downstash.raise_err(format(
      'NOPERM this token has no permissions to run the ''%s'' command', lower(v_name)));
  end if;
  if 'script' = any(r.flags) then
    perform set_config('downstash.readonly', p_readonly::text, true);
  end if;
  if r.first_key > 0 then
    v_last := case when r.last_key < 0 then v_n + r.last_key + 1 else r.last_key + 1 end;
    i := r.first_key + 1;
    while i <= v_last loop
      perform downstash.check_key(p_argv[i]);
      i := i + r.key_step;
    end loop;
  end if;
  execute format('select %s($1, $2)', r.handler) into o_result using p_db, p_argv[2:v_n];
  o_flags := r.flags;
end;
$$;

-- ---------------------------------------------------------------------------
-- Run (§7.5.2). Executes a pipeline atomically; each command in its own
-- sub-transaction so a failure doesn't roll back the others (Redis MULTI).
-- ---------------------------------------------------------------------------
create or replace function downstash.run(
  p_db uuid, p_readonly boolean, p_commands jsonb, p_source text,
  p_l1_hits int default 0, p_bytes_in bigint default 0, p_bytes_out bigint default 0
) returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_items    jsonb := '[]'::jsonb;
  v_commands int := 0;
  v_reads    int := 0;
  v_writes   int := 0;
  v_errors   int := 0;
  v_cmd      jsonb;
  v_argv     text[];
  v_result   jsonb;
  v_flags    text[];
begin
  if p_commands is null or jsonb_typeof(p_commands) <> 'array'
     or jsonb_array_length(p_commands) < 1 or jsonb_array_length(p_commands) > 1000 then
    perform downstash.raise_err('ERR Downstash: pipeline must contain 1..1000 commands');
  end if;

  for v_cmd in select value from jsonb_array_elements(p_commands) loop
    begin
      v_argv := downstash.to_argv(v_cmd);
      v_result := null;
      v_flags := null;
      downstash.dispatch(p_db, p_readonly, v_argv, v_result, v_flags);
      v_items := v_items || jsonb_build_array(jsonb_build_object('result', v_result));
      v_commands := v_commands + 1;
      if v_flags is not null and 'read' = any(v_flags) then v_reads := v_reads + 1; end if;
      if v_flags is not null and 'write' = any(v_flags) then v_writes := v_writes + 1; end if;
    exception
      when sqlstate '40P01' then raise;   -- deadlock: caller retries the whole request
      when sqlstate '40001' then raise;   -- serialization / retry-limit: same
      when sqlstate 'DS000' then
        v_items := v_items || jsonb_build_array(jsonb_build_object('error', SQLERRM));
        v_commands := v_commands + 1;
        v_errors := v_errors + 1;
      when others then
        v_items := v_items || jsonb_build_array(jsonb_build_object('error', 'ERR ' || SQLERRM));
        v_commands := v_commands + 1;
        v_errors := v_errors + 1;
    end;
  end loop;

  perform downstash.record_usage(p_db, p_source, v_commands, v_reads, v_writes, v_errors,
                                 p_l1_hits, p_bytes_in, p_bytes_out);
  return v_items;
end;
$$;

-- Console entry point: always a standard (read-write) token, records 'console'.
create or replace function downstash.console_run(p_db uuid, p_commands jsonb)
returns jsonb
language plpgsql
volatile
set search_path = ''
as $$
begin
  return downstash.run(p_db, false, p_commands, 'console');
end;
$$;


