-- ---------------------------------------------------------------------------
-- Migration 01150: ZRANGE options are case-insensitive (fix-forward)
--
-- Redis parses command options case-insensitively; @upstash/redis sends the
-- lowercase literal `withscores`, which the original ZRANGE port compared
-- against 'WITHSCORES' and therefore dropped. Same for BYSCORE/REV/LIMIT.
-- ---------------------------------------------------------------------------
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
        where downstash.score_in_range((value #>> '{}')::double precision, p_args[3], p_args[2])
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
