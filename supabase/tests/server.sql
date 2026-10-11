-- @file supabase/tests/server.sql — server + scripting families (§7.8).
select tests.reset();

-- PING
select tests.eq(tests.run(array['PING']), '"PONG"', 'PING → PONG');
select tests.eq(tests.run(array['PING','hello']), '"hello"', 'PING echoes arg');

-- ECHO
select tests.eq(tests.run(array['ECHO','hi']), '"hi"', 'ECHO');

-- DBSIZE reflects live keys
select tests.run(array['SET','d1','1']);
select tests.run(array['SET','d2','2']);
select tests.eq(tests.run(array['DBSIZE']), '2', 'DBSIZE → 2');

-- TIME returns [seconds, microseconds]
-- Time returns [seconds, microseconds]
select tests.eq(to_jsonb((select jsonb_array_length(tests.run(array['TIME'])))), '2', 'TIME → 2-element array');

-- FLUSHDB clears this database's keys
select tests.eq(tests.run(array['FLUSHDB']), '"OK"', 'FLUSHDB → OK');
select tests.eq(tests.run(array['DBSIZE']), '0', 'DBSIZE after FLUSHDB → 0');

-- Scripting: an unknown EVAL body is rejected with the registry error (§7.9).
do $$
declare v jsonb;
begin
  begin
    v := tests.run(array['EVAL','return redis.call("GET", KEYS[1])','1','k']);
  exception when sqlstate 'DS000' then
    if SQLERRM not like 'ERR Downstash: arbitrary Lua is not supported (script %' then
      raise exception 'ASSERTION FAILED: EVAL unknown script (got "%")', SQLERRM;
    end if;
    return;
  end;
  raise exception 'ASSERTION FAILED: EVAL unknown expected error but got %', v::text;
end $$;

-- EVALSHA of an unknown sha → NOSCRIPT
do $$
declare v jsonb;
begin
  begin
    v := tests.run(array['EVALSHA','0000000000000000000000000000000000000000','0']);
  exception when sqlstate 'DS000' then
    if SQLERRM <> 'NOSCRIPT No matching script. Please use EVAL.' then
      raise exception 'ASSERTION FAILED: EVALSHA unknown (got "%")', SQLERRM;
    end if;
    return;
  end;
  raise exception 'ASSERTION FAILED: EVALSHA unknown expected error but got %', v::text;
end $$;
select tests.reset();

