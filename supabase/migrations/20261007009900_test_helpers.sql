-- @file Test-only helpers used by supabase/tests (SQL & compat suites).
-- dispatch_safe wraps downstash.dispatch and never raises: it returns the
-- result and (optionally) the command error string, mirroring downstash.run's
-- per-command error capture. Not loaded in production; only referenced by tests.

create or replace function downstash.dispatch_safe(
  p_db uuid, p_readonly boolean, p_argv text[],
  out o_result jsonb, out o_error text
)
language plpgsql
volatile
set search_path = ''
as $$
begin
  begin
    select d.o_result into o_result from downstash.dispatch(p_db, p_readonly, p_argv) d;
    o_error := null;
  exception
    when sqlstate 'DS000' then
      o_result := null;
      o_error := SQLERRM;
    when others then
      o_result := null;
      o_error := 'ERR ' || SQLERRM;
  end;
end;
$$;

revoke all on function downstash.dispatch_safe(uuid, boolean, text[]) from public, anon, authenticated;
grant execute on function downstash.dispatch_safe(uuid, boolean, text[]) to service_role;
