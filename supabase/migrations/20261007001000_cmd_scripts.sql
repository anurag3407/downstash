-- ---------------------------------------------------------------------------
-- Migration 00700: scripting commands + known-script registry (P4-T1)
-- ---------------------------------------------------------------------------

-- Compute the SHA-1 of a Lua body (matches what clients send for EVAL).
create or replace function downstash.script_sha(p_body text)
returns text
language sql immutable set search_path = '' as $$
  select encode(extensions.digest(p_body, 'sha1'), 'hex');
$$;

create or replace function downstash.resolve_script(p_sha text)
returns setof downstash.scripts
language sql stable set search_path = '' as $$
  select * from downstash.scripts where sha1 = lower(p_sha);
$$;

-- Split EVAL argv into keys[] and argv[] per numkeys.
create or replace function downstash.split_eval(p_args text[], out o_keys text[], out o_argv text[])
language plpgsql immutable set search_path = '' as $$
declare
  v_numkeys int;
  v_len int := coalesce(array_length(p_args, 1), 0);
begin
  v_numkeys := downstash.to_int(p_args[2], 'ERR value is not an integer or out of range');
  if v_numkeys < 0 then
    perform downstash.raise_err('ERR Downstash: numkeys must be non-negative');
  end if;
  -- args[1] = script body/sha, args[2] = numkeys, args[3..] = keys then argv.
  if v_len < 2 + v_numkeys then
    perform downstash.raise_err('ERR Downstash: number of keys can''t be greater than number of args');
  end if;
  o_keys := p_args[3 : 2 + v_numkeys];
  o_argv := p_args[3 + v_numkeys : v_len];
end;
$$;

create or replace function downstash.cmd_eval(p_db uuid, p_args text[], p_readonly boolean default false, p_by_sha boolean default false)
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_sha text;
  v_keys text[];
  v_argv text[];
  v_script downstash.scripts;
  v_res jsonb;
begin
  -- Extract keys/argv (validates numkeys).
  select * into v_keys, v_argv from downstash.split_eval(p_args);

  if p_by_sha then
    v_sha := lower(p_args[1]);
  else
    v_sha := downstash.script_sha(p_args[1]);
  end if;

  select * into v_script from downstash.resolve_script(v_sha);
  if not found then
    if p_by_sha then
      perform downstash.raise_err('NOSCRIPT No matching script. Please use EVAL.');
    else
      perform downstash.raise_err(format('ERR Downstash: arbitrary Lua is not supported (script %s is not in the registry)', v_sha));
    end if;
  end if;

  -- Write-permission checks (§7.8).
  if p_readonly and v_script.is_write then
    perform downstash.raise_err('ERR Write commands are not allowed from read-only scripts');
  end if;
  if v_script.is_write and current_setting('downstash.readonly', true) = 'true' then
    perform downstash.raise_err('NOPERM this token has no permissions to run the ''EVAL'' command');
  end if;

  execute format('select downstash.%I($1, $2, $3)', v_script.name)
    into v_res using p_db, v_keys, v_argv;
  return v_res;
end;
$$;
comment on function downstash.cmd_eval(uuid, text[], boolean, boolean) is 'EVAL dispatcher for registered scripts';

create or replace function downstash.cmd_eval_cmd(p_db uuid, p_args text[]) returns jsonb
language plpgsql volatile set search_path = '' as $$ begin return downstash.cmd_eval(p_db, p_args, false, false); end; $$;
create or replace function downstash.cmd_eval_ro(p_db uuid, p_args text[]) returns jsonb
language plpgsql volatile set search_path = '' as $$ begin return downstash.cmd_eval(p_db, p_args, true, false); end; $$;
create or replace function downstash.cmd_evalsha(p_db uuid, p_args text[]) returns jsonb
language plpgsql volatile set search_path = '' as $$ begin return downstash.cmd_eval(p_db, p_args, false, true); end; $$;
create or replace function downstash.cmd_evalsha_ro(p_db uuid, p_args text[]) returns jsonb
language plpgsql volatile set search_path = '' as $$ begin return downstash.cmd_eval(p_db, p_args, true, true); end; $$;

-- SCRIPT LOAD | EXISTS | FLUSH (arity -2).
create or replace function downstash.cmd_script(p_db uuid, p_args text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_sub text := upper(p_args[1]);
  v_out jsonb := '[]'::jsonb;
  v_sha text;
  i int := 2;
  v_len int := coalesce(array_length(p_args, 1), 0);
begin
  if v_sub = 'LOAD' then
    if v_len <> 2 then perform downstash.raise_err('ERR syntax error'); end if;
    v_sha := downstash.script_sha(p_args[2]);
    if exists(select 1 from downstash.resolve_script(v_sha)) then return to_jsonb(v_sha); end if;
    perform downstash.raise_err(format('ERR Downstash: arbitrary Lua is not supported (script %s is not in the registry)', v_sha));
  elsif v_sub = 'EXISTS' then
    while i <= v_len loop
      if exists(select 1 from downstash.resolve_script(p_args[i])) then v_out := v_out || '1'::jsonb;
      else v_out := v_out || '0'::jsonb; end if;
      i := i + 1;
    end loop;
    return v_out;
  elsif v_sub = 'FLUSH' then
    return '"OK"'::jsonb;  -- no-op (registry is static)
  else
    perform downstash.raise_err(format('ERR Unknown subcommand or wrong number of arguments for ''%s''. Try SCRIPT HELP.', v_sub));
  end if;
end;
$$;
comment on function downstash.cmd_script(uuid, text[]) is 'SCRIPT LOAD|EXISTS|FLUSH';

insert into downstash.command_registry (name, handler, arity, flags, first_key, last_key, key_step, family, summary)
values
  ('EVAL',       'downstash.cmd_eval_cmd',  -3, '{script}', 0, 0, 0, 'scripting', 'Execute a registered script'),
  ('EVAL_RO',    'downstash.cmd_eval_ro',   -3, '{script}', 0, 0, 0, 'scripting', 'Execute a registered script in read-only mode'),
  ('EVALSHA',    'downstash.cmd_evalsha',   -3, '{script}', 0, 0, 0, 'scripting', 'Execute a registered script by SHA'),
  ('EVALSHA_RO', 'downstash.cmd_evalsha_ro', -3, '{script}', 0, 0, 0, 'scripting', 'Execute a registered script by SHA in read-only mode'),
  ('SCRIPT',     'downstash.cmd_script',    -2, '{script}', 0, 0, 0, 'scripting', 'Manage the script cache')
on conflict (name) do update set
  handler = excluded.handler, arity = excluded.arity, flags = excluded.flags,
  first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step,
  family = excluded.family, summary = excluded.summary;

-- known-scripts table populated by seed/port migration (see docs/engine/scripts.md)
