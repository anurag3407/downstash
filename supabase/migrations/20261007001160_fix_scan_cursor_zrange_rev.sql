-- ---------------------------------------------------------------------------
-- Migration 01160: fix SCAN cursor last-key + ZRANGE BYSCORE REV bounds
--
-- 1. SCAN: the "one more key exists" cursor was built with
--    `v_keys #>> '[-1]'`. A character literal is a text[] path, so the element
--    is the string "[-1]", which Postgres rejects while parsing the array
--    subscript ("upper bound cannot be less than lower bound"). Every paginated
--    SCAN that actually ran out of keys failed. The correct form is
--    `jsonb -> -1` (negative index counts from the end), then `#>> '{}'`.
--
-- 2. ZRANGE ... BYSCORE REV: REV only reverses the output order. The min/max
--    arguments stay in the order given, so the range predicate must keep
--    (p_args[2], p_args[3]). Swapping them returned an empty set, which made
--    `zrange key min max byScore rev` silently drop every member.
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
      -- One more exists → open a new cursor at the last returned key.
      v_has_more := true;
      exit;
    end if;
  end loop;

  if v_has_more then
    insert into downstash.scan_cursors (db_id, last_key)
      values (p_db, (v_keys -> -1) #>> '{}')
      returning id into v_next;
  end if;

  return jsonb_build_array(v_next::text, v_keys);
end;
$$;
comment on function downstash.cmd_scan(uuid, text[]) is 'SCAN cursor [MATCH pattern] [COUNT count] [TYPE type]';

-- ZRANGE: REV reverses the order only; min/max keep their argument positions.
create or replace function downstash.cmd_zrange(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_row downstash.kv;
  v_n int := array_length(p_args, 1);
  v_byscore boolean := false;
  v_rev boolean := false;
  v_withscores boolean := false;
  v_limit boolean := false;
  v_off int := 0;
  v_cnt int := 0;
  i int := 4;
  v_opt text;
  v_out jsonb := '[]'::jsonb;
  v_rec record;
  v_kept int := 0;
  v_len int;
begin
  while i <= v_n loop
    v_opt := upper(p_args[i]);
    if v_opt = 'BYSCORE' then v_byscore := true;
    elsif v_opt = 'REV' then v_rev := true;
    elsif v_opt = 'WITHSCORES' then v_withscores := true;
    elsif v_opt = 'BYLEX' then perform downstash.raise_err('ERR Downstash: BYLEX is not supported');
    elsif v_opt = 'LIMIT' then
      v_limit := true;
      v_off := downstash.to_int(p_args[i + 1]);
      v_cnt := downstash.to_int(p_args[i + 2]);
      i := i + 2;
    else
      perform downstash.raise_err('ERR syntax error');
    end if;
    i := i + 1;
  end loop;
  v_row := downstash.read_live(p_db, p_args[1], 'zset');
  if v_row.key is null then return '[]'::jsonb; end if;
  v_len := (select count(*) from jsonb_each(v_row.val));
  if v_byscore then
    if v_rev then
      for v_rec in
        select key as m, (value #>> '{}')::numeric as s from jsonb_each(v_row.val) e(key, value)
        where downstash.score_in_range((value #>> '{}')::double precision, p_args[2], p_args[3])
        order by (value #>> '{}')::numeric desc, key desc
      loop
        exit when v_limit and v_cnt >= 0 and v_kept >= v_off + v_cnt;
        if (not v_limit) or (v_kept >= v_off) then
          v_out := v_out || to_jsonb(v_rec.m);
          if v_withscores then v_out := v_out || to_jsonb(downstash.fmt_float(v_rec.s)); end if;
        end if;
        v_kept := v_kept + 1;
      end loop;
    else
      for v_rec in
        select key as m, (value #>> '{}')::numeric as s from jsonb_each(v_row.val) e(key, value)
        where downstash.score_in_range((value #>> '{}')::double precision, p_args[2], p_args[3])
        order by (value #>> '{}')::numeric asc, key
      loop
        exit when v_limit and v_cnt >= 0 and v_kept >= v_off + v_cnt;
        if (not v_limit) or (v_kept >= v_off) then
          v_out := v_out || to_jsonb(v_rec.m);
          if v_withscores then v_out := v_out || to_jsonb(downstash.fmt_float(v_rec.s)); end if;
        end if;
        v_kept := v_kept + 1;
      end loop;
    end if;
  else
    declare
      v_start int := p_args[2]::int;
      v_stop int := p_args[3]::int;
      v_ord text := case when v_rev then 'desc' else 'asc' end;
      v_rank int;
    begin
      if v_start < 0 then v_start := v_len + v_start; end if;
      if v_stop < 0 then v_stop := v_len + v_stop; end if;
      if v_start < 0 then v_start := 0; end if;
      if v_stop >= v_len then v_stop := v_len - 1; end if;
      for v_rec in
        execute format(
          'select key as m, (value #>> %L)::numeric as s, row_number() over (order by (value #>> %L)::numeric %s, key %s) as r from jsonb_each($1) e(key, value) order by r',
          '{}', '{}', v_ord, v_ord)
        using v_row.val
      loop
        v_rank := v_rec.r - 1;
        if v_rank >= v_start and v_rank <= v_stop then
          v_out := v_out || to_jsonb(v_rec.m);
          if v_withscores then v_out := v_out || to_jsonb(downstash.fmt_float(v_rec.s)); end if;
        end if;
      end loop;
    end;
  end if;
  return v_out;
end;
$$;
comment on function downstash.cmd_zrange(uuid, text[]) is 'ZRANGE key start stop [BYSCORE] [REV] [LIMIT off cnt] [WITHSCORES] (options are case-insensitive)';
