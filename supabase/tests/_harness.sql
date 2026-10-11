-- @file supabase/tests/_harness.sql
-- Assertion helpers for the SQL engine test suite. Loaded before every test
-- file (see run-sql.mjs). Any failed assertion raises `ASSERTION FAILED: ...`,
-- which makes psql (ON_ERROR_STOP=1) abort the file and the runner marks it red.

create schema if not exists tests;

-- The seeded test database id (see 01300_seed.sql).
create or replace function tests.db() returns uuid
language sql stable as $$ select '00000000-0000-4000-8000-000000000001'::uuid $$;

-- tests.run(argv) → jsonb result via downstash.dispatch (standard token).
create or replace function tests.run(p_argv text[]) returns jsonb
language sql volatile as $$
  select o_result from downstash.dispatch(tests.db(), false, p_argv)
$$;

-- tests.run_ro(argv) → jsonb result via dispatch with a readonly token.
create or replace function tests.run_ro(p_argv text[]) returns jsonb
language sql volatile as $$
  select o_result from downstash.dispatch(tests.db(), true, p_argv)
$$;

-- tests.eq(got, want, msg) — assert equality.
create or replace function tests.eq(p_got jsonb, p_want jsonb, p_msg text)
returns void
language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'ASSERTION FAILED: % (got %, want %)', p_msg, p_got::text, p_want::text;
  end if;
end $$;

-- tests.eq_t(got, want, msg) — assert text equality (for error strings).
create or replace function tests.eq_t(p_got text, p_want text, p_msg text)
returns void
language plpgsql as $$
begin
  if p_got is distinct from p_want then
    raise exception 'ASSERTION FAILED: % (got "%", want "%")', p_msg, p_got, p_want;
  end if;
end $$;

-- tests.raises(argv, expect, msg) — assert a command raises DS000 with exactly `expect`.
create or replace function tests.raises(p_argv text[], p_expect text, p_msg text)
returns void
language plpgsql as $$
declare v jsonb;
begin
  begin
    v := tests.run(p_argv);
  exception
    when sqlstate 'DS000' then
      if SQLERRM <> p_expect then
        raise exception 'ASSERTION FAILED: % (got error "%", want "%")', p_msg, SQLERRM, p_expect;
      end if;
      return; -- expected error matched
    when others then
      raise exception 'ASSERTION FAILED: % raised unexpected %: %', p_msg, sqlstate, SQLERRM;
  end;
  -- No error was raised — that is a failure.
  raise exception 'ASSERTION FAILED: % expected error "%" but got result %', p_msg, p_expect, coalesce(v::text, 'null');
end $$;

-- tests.true(cond, msg).
create or replace function tests.true(p_cond boolean, p_msg text)
returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'ASSERTION FAILED: % (expected true)', p_msg;
  end if;
end $$;

-- tests.reset() — wipe the keyspace between test files.
create or replace function tests.reset() returns void
language plpgsql as $$
begin
  delete from downstash.kv where db_id = tests.db();
  delete from downstash.scan_cursors where db_id = tests.db();
end $$;

