-- @file Server commands: PING, ECHO, DBSIZE, FLUSHDB, FLUSHALL, TIME (§7.8).
-- @see docs/engine/commands.md

-- PING [message] → "PONG" or the echoed message.
create or replace function downstash.cmd_ping(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_n int := coalesce(array_length(p_args, 1), 0);
begin
  if v_n = 0 then return '"PONG"'::jsonb; end if;
  return to_jsonb(p_args[1]);
end;
$$;
comment on function downstash.cmd_ping(uuid, text[]) is 'PING [message]';

-- ECHO message → the message.
create or replace function downstash.cmd_echo(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  return to_jsonb(p_args[1]);
end;
$$;
comment on function downstash.cmd_echo(uuid, text[]) is 'ECHO message';

-- DBSIZE → number of live keys in this database.
create or replace function downstash.cmd_dbsize(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_n bigint;
begin
  select count(*) into v_n from downstash.kv
    where db_id = p_db and (expires_at is null or expires_at > now());
  return to_jsonb(v_n);
end;
$$;
comment on function downstash.cmd_dbsize(uuid, text[]) is 'DBSIZE';

-- FLUSHDB / FLUSHALL [ASYNC|SYNC] → "OK". Deletes this database's keys and cursors.
create or replace function downstash.cmd_flushdb(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare v_n int := coalesce(array_length(p_args, 1), 0);
begin
  for i in 1 .. v_n loop
    if upper(p_args[i]) not in ('ASYNC', 'SYNC') then
      perform downstash.raise_err('ERR syntax error');
    end if;
  end loop;
  delete from downstash.kv where db_id = p_db;
  delete from downstash.scan_cursors where db_id = p_db;
  return '"OK"'::jsonb;
end;
$$;
comment on function downstash.cmd_flushdb(uuid, text[]) is 'FLUSHDB [ASYNC|SYNC]';

create or replace function downstash.cmd_flushall(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
begin
  -- In Downstash every logical database is isolated, so FLUSHALL == FLUSHDB.
  return downstash.cmd_flushdb(p_db, p_args);
end;
$$;
comment on function downstash.cmd_flushall(uuid, text[]) is 'FLUSHALL [ASYNC|SYNC]';

-- TIME → ["<unix s>", "<micros>"].
create or replace function downstash.cmd_time(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare v_s bigint; v_us bigint;
begin
  select extract(epoch from clock_timestamp())::bigint,
         (extract(microseconds from clock_timestamp()) - floor(extract(seconds from clock_timestamp())) * 1000000)::bigint
    into v_s, v_us;
  return jsonb_build_array(v_s::text, v_us::text);
end;
$$;
comment on function downstash.cmd_time(uuid, text[]) is 'TIME';

insert into downstash.command_registry (name, handler, arity, flags, first_key, last_key, key_step, family, summary) values
  ('PING',    'downstash.cmd_ping',    -1, '{read}',        0, 0, 0, 'server', 'Ping the server'),
  ('ECHO',    'downstash.cmd_echo',    2,  '{read}',        0, 0, 0, 'server', 'Echo the given string'),
  ('DBSIZE',  'downstash.cmd_dbsize',  1,  '{read}',        0, 0, 0, 'server', 'Return the number of keys in the database'),
  ('FLUSHDB', 'downstash.cmd_flushdb', -1, '{write,admin}', 0, 0, 0, 'server', 'Remove all keys from the current database'),
  ('FLUSHALL','downstash.cmd_flushall',-1, '{write,admin}', 0, 0, 0, 'server', 'Remove all keys from all databases'),
  ('TIME',    'downstash.cmd_time',    1,  '{read}',        0, 0, 0, 'server', 'Return the current server time')
on conflict (name) do update set
  handler = excluded.handler, arity = excluded.arity, flags = excluded.flags,
  first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step,
  family = excluded.family, summary = excluded.summary;
