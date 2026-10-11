-- ---------------------------------------------------------------------------
-- Migration 01100: native ports of the @upstash/ratelimit Lua scripts (P4-T1)
--
-- Every entry below is a byte-exact port of a script captured in
-- tests/capture/scripts.json. The registry key is the SHA-1 of the Lua body,
-- which is what the SDK sends in EVAL; EVALSHA is answered with NOSCRIPT for
-- unknown hashes so the client falls back to EVAL (see docs/engine/scripts.md).
--
-- Lua -> PL/pgSQL rules (§7.9):
--   * numbers are doubles; integral doubles print without a decimal point
--   * a bulk-string reply of `false` (a missing key) becomes SQL NULL
--   * Lua tables become JSON arrays, stopping at the first nil
--   * redis.call is executed through downstash.dispatch with p_readonly=false,
--     because cmd_eval has already enforced the write permission
-- ---------------------------------------------------------------------------

-- Run one Redis command inside a script and return its jsonb result.
create or replace function downstash.script_call(p_db uuid, p_argv text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_result jsonb;
  v_flags  text[];
begin
  select o_result, o_flags into v_result, v_flags
    from downstash.dispatch(p_db, false, p_argv);
  return v_result;
end;
$$;
comment on function downstash.script_call(uuid, text[]) is 'Run one command from inside a script port';

-- Redis integer reply (INCR/INCRBY/...) as a bigint.
create or replace function downstash.script_int_reply(p_reply jsonb)
returns bigint
language sql immutable set search_path = '' as $$
  select (p_reply #>> '{}')::bigint;
$$;

-- Lua tonumber() on a bulk-string reply. SQL NULL = Lua false/nil.
create or replace function downstash.script_tonum(p_reply jsonb)
returns double precision
language sql immutable set search_path = '' as $$
  select case
    when p_reply is null or jsonb_typeof(p_reply) <> 'string' then null::double precision
    else (p_reply #>> '{}')::double precision
  end;
$$;

-- Lua number -> jsonb number. Integral doubles print as integers.
create or replace function downstash.script_num(p_value double precision)
returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when p_value is null then 'null'::jsonb
    when p_value = trunc(p_value) then to_jsonb(trunc(p_value)::numeric)
    else to_jsonb(p_value)
  end;
$$;

-- Lua number -> the text Redis would store (integer when integral).
create or replace function downstash.script_numstr(p_value double precision)
returns text
language sql immutable set search_path = '' as $$
  select case
    when p_value is null then '0'
    when p_value = trunc(p_value) then trunc(p_value)::numeric::text
    else p_value::text
  end;
$$;

-- Shared prologue: resolve the optional dynamic limit key (KEYS[2]).
create or replace function downstash.script_effective_limit(p_db uuid, p_keys text[], p_default numeric)
returns numeric
language plpgsql stable set search_path = '' as $$
declare
  v_dyn text := p_keys[2];
  v_val double precision;
begin
  if v_dyn is not null and v_dyn <> '' then
    v_val := downstash.script_tonum(downstash.script_call(p_db, array['GET', v_dyn]));
    if v_val is not null then
      return v_val::numeric;
    end if;
  end if;
  return p_default;
end;
$$;

-- ---------------------------------------------------------------------------
-- fixedWindow.limit — INCRBY the bucket counter, set the TTL once.
-- KEYS[1] counter, KEYS[2] dynamic limit (optional)
-- ARGV[1] tokens, ARGV[2] window ms, ARGV[3] incrementBy
-- ---------------------------------------------------------------------------
create or replace function downstash.script_fixed_window_limit(p_db uuid, p_keys text[], p_argv text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_key   text := p_keys[1];
  v_incr_raw double precision;
  v_incr  bigint;
  v_eff   numeric;
  v_r     bigint;
begin
  v_incr_raw := downstash.to_float(p_argv[3], false);
  v_incr := trunc(v_incr_raw)::bigint;
  v_eff := downstash.script_effective_limit(p_db, p_keys, downstash.to_int(p_argv[1]));

  v_r := downstash.script_int_reply(
    downstash.script_call(p_db, array['INCRBY', v_key, v_incr::text]));
  if v_r = v_incr then
    perform downstash.script_call(p_db, array['PEXPIRE', v_key, downstash.to_int(p_argv[2])::text]);
  end if;
  return jsonb_build_array(to_jsonb(v_r), to_jsonb(v_eff));
end;
$$;
comment on function downstash.script_fixed_window_limit(uuid, text[], text[]) is 'fixedWindow.limit';

-- ---------------------------------------------------------------------------
-- fixedWindow.getRemaining — read-only view of the same counter.
-- KEYS[1] counter, KEYS[2] dynamic limit (optional)
-- ARGV[1] tokens
-- ---------------------------------------------------------------------------
create or replace function downstash.script_fixed_window_remaining(p_db uuid, p_keys text[], p_argv text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_key  text := p_keys[1];
  v_eff  numeric;
  v_used numeric := 0;
  v_val  double precision;
begin
  v_eff := downstash.script_effective_limit(p_db, p_keys, downstash.to_int(p_argv[1]));
  v_val := downstash.script_tonum(downstash.script_call(p_db, array['GET', v_key]));
  if v_val is not null then
    v_used := v_val::numeric;
  end if;
  return jsonb_build_array(to_jsonb(v_eff - v_used), to_jsonb(v_eff));
end;
$$;
comment on function downstash.script_fixed_window_remaining(uuid, text[], text[]) is 'fixedWindow.getRemaining';

-- ---------------------------------------------------------------------------
-- slidingWindow.limit — weighted current + previous window counters.
-- KEYS[1] current, KEYS[2] previous, KEYS[3] dynamic limit (optional)
-- ARGV[1] tokens, ARGV[2] now ms, ARGV[3] window ms, ARGV[4] incrementBy
-- ---------------------------------------------------------------------------
create or replace function downstash.script_sliding_window_limit(p_db uuid, p_keys text[], p_argv text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_cur  text := p_keys[1];
  v_prev text := p_keys[2];
  v_incr_raw double precision;
  v_incr  bigint;
  v_eff   numeric;
  v_now   numeric;
  v_win   numeric;
  v_pct   double precision;
  v_cur_n numeric := 0;
  v_prev_w numeric := 0;
  v_new   bigint;
begin
  v_incr_raw := downstash.to_float(p_argv[4], false);
  v_incr := trunc(v_incr_raw)::bigint;
  v_eff := downstash.script_effective_limit(p_db, p_keys, downstash.to_int(p_argv[1]));
  v_now := downstash.to_int(p_argv[2])::numeric;
  v_win := downstash.to_int(p_argv[3])::numeric;

  v_cur_n := coalesce(downstash.script_tonum(downstash.script_call(p_db, array['GET', v_cur])), 0)::numeric;
  v_prev_w := coalesce(downstash.script_tonum(downstash.script_call(p_db, array['GET', v_prev])), 0)::numeric;
  -- Postgres' mod() takes numeric, not double precision; Lua's % on integral
  -- milliseconds is exactly this.
  v_pct := (mod(v_now::numeric, v_win::numeric) / v_win)::double precision;
  v_prev_w := floor((1 - v_pct) * v_prev_w::double precision)::numeric;

  if v_incr > 0 and v_prev_w + v_cur_n >= v_eff then
    return jsonb_build_array(to_jsonb((-1)::numeric), to_jsonb(v_eff));
  end if;

  v_new := downstash.script_int_reply(
    downstash.script_call(p_db, array['INCRBY', v_cur, v_incr::text]));
  if v_new = v_incr then
    perform downstash.script_call(p_db, array['PEXPIRE', v_cur, (v_win * 2 + 1000)::bigint::text]);
  end if;
  return jsonb_build_array(to_jsonb(v_eff - (v_new::numeric + v_prev_w)), to_jsonb(v_eff));
end;
$$;
comment on function downstash.script_sliding_window_limit(uuid, text[], text[]) is 'slidingWindow.limit';

-- ---------------------------------------------------------------------------
-- slidingWindow.getRemaining — weighted read of both buckets.
-- KEYS[1] current, KEYS[2] previous, KEYS[3] dynamic limit (optional)
-- ARGV[1] tokens, ARGV[2] now ms, ARGV[3] window ms
-- ---------------------------------------------------------------------------
create or replace function downstash.script_sliding_window_remaining(p_db uuid, p_keys text[], p_argv text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_cur  text := p_keys[1];
  v_prev text := p_keys[2];
  v_eff  numeric;
  v_now  numeric;
  v_win  numeric;
  v_pct  double precision;
  v_cur_n numeric := 0;
  v_prev_w numeric := 0;
begin
  v_eff := downstash.script_effective_limit(p_db, p_keys, downstash.to_int(p_argv[1]));
  v_now := downstash.to_int(p_argv[2])::numeric;
  v_win := downstash.to_int(p_argv[3])::numeric;

  v_cur_n := coalesce(downstash.script_tonum(downstash.script_call(p_db, array['GET', v_cur])), 0)::numeric;
  v_prev_w := coalesce(downstash.script_tonum(downstash.script_call(p_db, array['GET', v_prev])), 0)::numeric;
  -- Postgres' mod() takes numeric, not double precision; Lua's % on integral
  -- milliseconds is exactly this.
  v_pct := (mod(v_now::numeric, v_win::numeric) / v_win)::double precision;
  v_prev_w := floor((1 - v_pct) * v_prev_w::double precision)::numeric;

  return jsonb_build_array(to_jsonb(v_eff - (v_cur_n + v_prev_w)), to_jsonb(v_eff));
end;
$$;
comment on function downstash.script_sliding_window_remaining(uuid, text[], text[]) is 'slidingWindow.getRemaining';

-- ---------------------------------------------------------------------------
-- tokenBucket.limit — refill the bucket, then consume.
-- KEYS[1] bucket hash, KEYS[2] dynamic limit (optional)
-- ARGV[1] maxTokens, ARGV[2] interval ms, ARGV[3] refillRate,
-- ARGV[4] now ms, ARGV[5] incrementBy
-- ---------------------------------------------------------------------------
create or replace function downstash.script_token_bucket_limit(p_db uuid, p_keys text[], p_argv text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_key   text := p_keys[1];
  v_eff   numeric;
  v_interval numeric;
  v_refill numeric;
  v_now   numeric;
  v_incr  numeric;
  v_bucket jsonb;
  v_refilled_at numeric;
  v_tokens numeric;
  v_num_refills numeric;
  v_remaining numeric;
  v_expire_at double precision;
begin
  v_eff := downstash.script_effective_limit(p_db, p_keys, downstash.to_int(p_argv[1])::numeric);
  v_interval := downstash.to_int(p_argv[2])::numeric;
  v_refill := downstash.to_int(p_argv[3])::numeric;
  v_now := downstash.to_int(p_argv[4])::numeric;
  v_incr := downstash.to_int(p_argv[5])::numeric;

  v_bucket := downstash.script_call(p_db, array['HMGET', v_key, 'refilledAt', 'tokens']);
  if downstash.script_tonum(v_bucket -> 0) is null then
    v_refilled_at := v_now;
    v_tokens := v_eff;
  else
    v_refilled_at := downstash.script_tonum(v_bucket -> 0)::numeric;
    v_tokens := coalesce(downstash.script_tonum(v_bucket -> 1), 0)::numeric;
  end if;

  if v_now >= v_refilled_at + v_interval then
    v_num_refills := floor((v_now - v_refilled_at) / v_interval);
    v_tokens := least(v_eff, v_tokens + v_num_refills * v_refill);
    v_refilled_at := v_refilled_at + v_num_refills * v_interval;
  end if;

  if v_incr > 0 and v_tokens < v_incr then
    return jsonb_build_array(to_jsonb((-1)::numeric),
                             downstash.script_num((v_refilled_at + v_interval)::double precision),
                             to_jsonb(v_eff));
  end if;

  v_remaining := v_tokens - v_incr;
  v_expire_at := ceil(((v_eff - v_remaining) / v_refill)::double precision) * v_interval::double precision;

  perform downstash.script_call(p_db,
    array['HSET', v_key, 'refilledAt', downstash.script_numstr(v_refilled_at::double precision),
          'tokens', downstash.script_numstr(v_remaining::double precision)]);
  if v_expire_at > 0 then
    perform downstash.script_call(p_db, array['PEXPIRE', v_key, v_expire_at::bigint::text]);
  end if;
  return jsonb_build_array(downstash.script_num(v_remaining::double precision),
                           downstash.script_num((v_refilled_at + v_interval)::double precision),
                           to_jsonb(v_eff));
end;
$$;
comment on function downstash.script_token_bucket_limit(uuid, text[], text[]) is 'tokenBucket.limit';

-- ---------------------------------------------------------------------------
-- tokenBucket.getRemaining — read the bucket without consuming.
-- KEYS[1] bucket hash, KEYS[2] dynamic limit (optional)
-- ARGV[1] maxTokens
-- ---------------------------------------------------------------------------
create or replace function downstash.script_token_bucket_remaining(p_db uuid, p_keys text[], p_argv text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_key  text := p_keys[1];
  v_eff  numeric;
  v_bucket jsonb;
begin
  v_eff := downstash.script_effective_limit(p_db, p_keys, downstash.to_int(p_argv[1])::numeric);
  v_bucket := downstash.script_call(p_db, array['HMGET', v_key, 'refilledAt', 'tokens']);
  if downstash.script_tonum(v_bucket -> 0) is null then
    return jsonb_build_array(to_jsonb(v_eff), to_jsonb((-1)::numeric), to_jsonb(v_eff));
  end if;
  return jsonb_build_array(downstash.script_num(downstash.script_tonum(v_bucket -> 1)),
                           downstash.script_num(downstash.script_tonum(v_bucket -> 0)),
                           to_jsonb(v_eff));
end;
$$;
comment on function downstash.script_token_bucket_remaining(uuid, text[], text[]) is 'tokenBucket.getRemaining';

-- ---------------------------------------------------------------------------
-- cachedFixedWindow.limit — same as fixedWindow.limit without a dynamic key.
-- KEYS[1] counter      ARGV[1] window ms, ARGV[2] incrementBy
-- ---------------------------------------------------------------------------
create or replace function downstash.script_cached_fixed_window_limit(p_db uuid, p_keys text[], p_argv text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_key  text := p_keys[1];
  v_incr_raw double precision;
  v_incr bigint;
  v_r    bigint;
begin
  v_incr_raw := downstash.to_float(p_argv[2], false);
  v_incr := trunc(v_incr_raw)::bigint;
  v_r := downstash.script_int_reply(
    downstash.script_call(p_db, array['INCRBY', v_key, v_incr::text]));
  if v_r = v_incr then
    perform downstash.script_call(p_db, array['PEXPIRE', v_key, downstash.to_int(p_argv[1])::text]);
  end if;
  return downstash.script_num(v_r::double precision);
end;
$$;
comment on function downstash.script_cached_fixed_window_limit(uuid, text[], text[]) is 'cachedFixedWindow.limit';

-- ---------------------------------------------------------------------------
-- cachedFixedWindow.getRemaining — the raw counter, or 0 when unset.
-- KEYS[1] counter      ARGV[1] (unused)
-- ---------------------------------------------------------------------------
create or replace function downstash.script_cached_fixed_window_remaining(p_db uuid, p_keys text[], p_argv text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_key text := p_keys[1];
  v_val double precision;
begin
  v_val := downstash.script_tonum(downstash.script_call(p_db, array['GET', v_key]));
  return downstash.script_num(coalesce(v_val, 0)::double precision);
end;
$$;
comment on function downstash.script_cached_fixed_window_remaining(uuid, text[], text[]) is 'cachedFixedWindow.getRemaining';

-- ---------------------------------------------------------------------------
-- resetUsedTokens — SCAN the identifier pattern and DEL everything it matches.
-- KEYS[1] glob pattern
-- ---------------------------------------------------------------------------
create or replace function downstash.script_reset_used_tokens(p_db uuid, p_keys text[], p_argv text[])
returns jsonb
language plpgsql volatile set search_path = '' as $$
declare
  v_pattern text := p_keys[1];
  v_cursor  text := '0';
  v_scan    jsonb;
  v_keys    text[];
begin
  loop
    v_scan := downstash.script_call(p_db, array['SCAN', v_cursor, 'MATCH', v_pattern, 'COUNT', '100']);
    v_cursor := v_scan ->> 0;
    v_keys := (select array_agg(x) from jsonb_array_elements_text(v_scan -> 1) as x);
    if v_keys is not null and array_length(v_keys, 1) > 0 then
      perform downstash.script_call(p_db, array['DEL'] || v_keys);
    end if;
    exit when v_cursor = '0';
  end loop;
  return 'null'::jsonb;
end;
$$;
comment on function downstash.script_reset_used_tokens(uuid, text[], text[]) is 'resetUsedTokens';
-- Registry rows. The source text and SHA-1 come from tests/capture/scripts.json,
-- captured from @upstash/ratelimit@2.2.0 by tests/capture/capture-scripts.ts.
insert into downstash.scripts (sha1, name, handler, is_write, source, origin) values
  ('b2efc02798c8e9b471a10f9b1d5745db89923ff3','script_fixed_window_limit','downstash.script_fixed_window_limit',true,'#!lua flags=allow-key-locking
  local key           = KEYS[1]
  local dynamicLimitKey = KEYS[2]  -- optional: key for dynamic limit in redis
  local tokens        = tonumber(ARGV[1])  -- default limit
  local window        = ARGV[2]
  local incrementBy   = ARGV[3] -- increment rate per request at a given value, default is 1

  -- Check for dynamic limit
  local effectiveLimit = tokens
  if dynamicLimitKey and dynamicLimitKey ~= "" then
    local dynamicLimit = redis.call("GET", dynamicLimitKey)
    if dynamicLimit then
      effectiveLimit = tonumber(dynamicLimit)
    end
  end

  local r = redis.call("INCRBY", key, incrementBy)
  if r == tonumber(incrementBy) then
  -- The first time this key is set, the value will be equal to incrementBy.
  -- So we only need the expire command once
  redis.call("PEXPIRE", key, window)
  end

  return {r, effectiveLimit}
','@upstash/ratelimit@2.2.0 singleRegion.fixedWindow.limit'),
  ('823cb2a5a902d69681244f5e28e5ebb8f2a89edd','script_fixed_window_remaining','downstash.script_fixed_window_remaining',false,'#!lua flags=allow-key-locking
  local key = KEYS[1]
  local dynamicLimitKey = KEYS[2]  -- optional: key for dynamic limit in redis
  local tokens = tonumber(ARGV[1])  -- default limit

  -- Check for dynamic limit
  local effectiveLimit = tokens
  if dynamicLimitKey and dynamicLimitKey ~= "" then
    local dynamicLimit = redis.call("GET", dynamicLimitKey)
    if dynamicLimit then
      effectiveLimit = tonumber(dynamicLimit)
    end
  end

  local value = redis.call(''GET'', key)
  local usedTokens = 0
  if value then
    usedTokens = tonumber(value)
  end
  
  return {effectiveLimit - usedTokens, effectiveLimit}
','@upstash/ratelimit@2.2.0 singleRegion.fixedWindow.getRemaining'),
  ('74740bb3d7792848093cdef586b6b6037c455fd6','script_sliding_window_limit','downstash.script_sliding_window_limit',true,'#!lua flags=allow-key-locking
  local currentKey  = KEYS[1]           -- identifier including prefixes
  local previousKey = KEYS[2]           -- key of the previous bucket
  local dynamicLimitKey = KEYS[3]       -- optional: key for dynamic limit in redis
  local tokens      = tonumber(ARGV[1]) -- default tokens per window
  local now         = ARGV[2]           -- current timestamp in milliseconds
  local window      = ARGV[3]           -- interval in milliseconds
  local incrementBy = tonumber(ARGV[4]) -- increment rate per request at a given value, default is 1

  -- Check for dynamic limit
  local effectiveLimit = tokens
  if dynamicLimitKey and dynamicLimitKey ~= "" then
    local dynamicLimit = redis.call("GET", dynamicLimitKey)
    if dynamicLimit then
      effectiveLimit = tonumber(dynamicLimit)
    end
  end

  local requestsInCurrentWindow = redis.call("GET", currentKey)
  if requestsInCurrentWindow == false then
    requestsInCurrentWindow = 0
  end

  local requestsInPreviousWindow = redis.call("GET", previousKey)
  if requestsInPreviousWindow == false then
    requestsInPreviousWindow = 0
  end
  local percentageInCurrent = ( now % window ) / window
  -- weighted requests to consider from the previous window
  requestsInPreviousWindow = math.floor(( 1 - percentageInCurrent ) * requestsInPreviousWindow)

  -- Only check limit if not refunding (negative rate)
  if incrementBy > 0 and requestsInPreviousWindow + requestsInCurrentWindow >= effectiveLimit then
    return {-1, effectiveLimit}
  end

  local newValue = redis.call("INCRBY", currentKey, incrementBy)
  if newValue == incrementBy then
    -- The first time this key is set, the value will be equal to incrementBy.
    -- So we only need the expire command once
    redis.call("PEXPIRE", currentKey, window * 2 + 1000) -- Enough time to overlap with a new window + 1 second
  end
  return {effectiveLimit - ( newValue + requestsInPreviousWindow ), effectiveLimit}
','@upstash/ratelimit@2.2.0 singleRegion.slidingWindow.limit'),
  ('7ca36169e0fc9caedd81b4eef8e99854c157f9b5','script_sliding_window_remaining','downstash.script_sliding_window_remaining',false,'#!lua flags=allow-key-locking
  local currentKey  = KEYS[1]           -- identifier including prefixes
  local previousKey = KEYS[2]           -- key of the previous bucket
  local dynamicLimitKey = KEYS[3]       -- optional: key for dynamic limit in redis
  local tokens      = tonumber(ARGV[1]) -- default tokens per window
  local now         = ARGV[2]           -- current timestamp in milliseconds
  local window      = ARGV[3]           -- interval in milliseconds

  -- Check for dynamic limit
  local effectiveLimit = tokens
  if dynamicLimitKey and dynamicLimitKey ~= "" then
    local dynamicLimit = redis.call("GET", dynamicLimitKey)
    if dynamicLimit then
      effectiveLimit = tonumber(dynamicLimit)
    end
  end

  local requestsInCurrentWindow = redis.call("GET", currentKey)
  if requestsInCurrentWindow == false then
    requestsInCurrentWindow = 0
  end

  local requestsInPreviousWindow = redis.call("GET", previousKey)
  if requestsInPreviousWindow == false then
    requestsInPreviousWindow = 0
  end

  local percentageInCurrent = ( now % window ) / window
  -- weighted requests to consider from the previous window
  requestsInPreviousWindow = math.floor(( 1 - percentageInCurrent ) * requestsInPreviousWindow)

  local usedTokens = requestsInPreviousWindow + requestsInCurrentWindow
  return {effectiveLimit - usedTokens, effectiveLimit}
','@upstash/ratelimit@2.2.0 singleRegion.slidingWindow.getRemaining'),
  ('d60be5bd3d83482ae229309f1f7425424f891204','script_token_bucket_limit','downstash.script_token_bucket_limit',true,'#!lua flags=allow-key-locking
  local key         = KEYS[1]           -- identifier including prefixes
  local dynamicLimitKey = KEYS[2]       -- optional: key for dynamic limit in redis
  local maxTokens   = tonumber(ARGV[1]) -- default maximum number of tokens
  local interval    = tonumber(ARGV[2]) -- size of the window in milliseconds
  local refillRate  = tonumber(ARGV[3]) -- how many tokens are refilled after each interval
  local now         = tonumber(ARGV[4]) -- current timestamp in milliseconds
  local incrementBy = tonumber(ARGV[5]) -- how many tokens to consume, default is 1

  -- Check for dynamic limit
  local effectiveLimit = maxTokens
  if dynamicLimitKey and dynamicLimitKey ~= "" then
    local dynamicLimit = redis.call("GET", dynamicLimitKey)
    if dynamicLimit then
      effectiveLimit = tonumber(dynamicLimit)
    end
  end
        
  local bucket = redis.call("HMGET", key, "refilledAt", "tokens")
        
  local refilledAt
  local tokens

  if bucket[1] == false then
    refilledAt = now
    tokens = effectiveLimit
  else
    refilledAt = tonumber(bucket[1])
    tokens = tonumber(bucket[2])
  end
        
  if now >= refilledAt + interval then
    local numRefills = math.floor((now - refilledAt) / interval)
    tokens = math.min(effectiveLimit, tokens + numRefills * refillRate)

    refilledAt = refilledAt + numRefills * interval
  end

  -- Only reject when consuming (not refunding) and there are not enough tokens
  -- for this request. Checking tokens == 0 only covered incrementBy == 1: with
  -- a larger rate (e.g. 2 tokens left, incrementBy 5) the request fell through,
  -- drove tokens negative and still wrote it back, so a rejected request
  -- consumed tokens and a single large rate could lock the identifier out.
  if incrementBy > 0 and tokens < incrementBy then
    return {-1, refilledAt + interval, effectiveLimit}
  end

  local remaining = tokens - incrementBy
  local expireAt = math.ceil(((effectiveLimit - remaining) / refillRate)) * interval
        
  redis.call("HSET", key, "refilledAt", refilledAt, "tokens", remaining)

  if (expireAt > 0) then
    redis.call("PEXPIRE", key, expireAt)
  end
  return {remaining, refilledAt + interval, effectiveLimit}
','@upstash/ratelimit@2.2.0 singleRegion.tokenBucket.limit'),
  ('40daf4a441df736f5c99f8b77bbe176c909e5de4','script_token_bucket_remaining','downstash.script_token_bucket_remaining',false,'#!lua flags=allow-key-locking
  local key         = KEYS[1]
  local dynamicLimitKey = KEYS[2]       -- optional: key for dynamic limit in redis
  local maxTokens   = tonumber(ARGV[1]) -- default maximum number of tokens

  -- Check for dynamic limit
  local effectiveLimit = maxTokens
  if dynamicLimitKey and dynamicLimitKey ~= "" then
    local dynamicLimit = redis.call("GET", dynamicLimitKey)
    if dynamicLimit then
      effectiveLimit = tonumber(dynamicLimit)
    end
  end
        
  local bucket = redis.call("HMGET", key, "refilledAt", "tokens")

  if bucket[1] == false then
    return {effectiveLimit, -1, effectiveLimit}
  end
        
  return {tonumber(bucket[2]), tonumber(bucket[1]), effectiveLimit}
','@upstash/ratelimit@2.2.0 singleRegion.tokenBucket.getRemaining'),
  ('1861a700bafe96c833a483af6b1c28a8897cfdb0','script_cached_fixed_window_limit','downstash.script_cached_fixed_window_limit',true,'#!lua flags=allow-key-locking
  local key     = KEYS[1]
  local window  = ARGV[1]
  local incrementBy   = ARGV[2] -- increment rate per request at a given value, default is 1

  local r = redis.call("INCRBY", key, incrementBy)
  if r == incrementBy then
  -- The first time this key is set, the value will be equal to incrementBy.
  -- So we only need the expire command once
  redis.call("PEXPIRE", key, window)
  end
      
  return r
','@upstash/ratelimit@2.2.0 singleRegion.cachedFixedWindow.limit'),
  ('eb82f0e853d2fc9a236fa9bfbe704fda6ac2fc36','script_cached_fixed_window_remaining','downstash.script_cached_fixed_window_remaining',false,'#!lua flags=allow-key-locking
  local key = KEYS[1]
  local tokens = 0

  local value = redis.call(''GET'', key)
  if value then
      tokens = value
  end
  return tokens
','@upstash/ratelimit@2.2.0 singleRegion.cachedFixedWindow.getRemaining'),
  ('54bd274ddc59fb3be0f42deee2f64322a10e2b50','script_reset_used_tokens','downstash.script_reset_used_tokens',true,'
      local pattern = KEYS[1]

      -- Initialize cursor to start from 0
      local cursor = "0"

      repeat
          -- Scan for keys matching the pattern
          local scan_result = redis.call(''SCAN'', cursor, ''MATCH'', pattern)

          -- Extract cursor for the next iteration
          cursor = scan_result[1]

          -- Extract keys from the scan result
          local keys = scan_result[2]

          for i=1, #keys do
          redis.call(''DEL'', keys[i])
          end

      -- Continue scanning until cursor is 0 (end of keyspace)
      until cursor == "0"
    ','@upstash/ratelimit@2.2.0 singleRegion.reset.resetUsedTokens')
on conflict (sha1) do update set
  name = excluded.name, handler = excluded.handler, is_write = excluded.is_write,
  source = excluded.source, origin = excluded.origin;
