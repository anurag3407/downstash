---
title: Code style (SQL)
status: stable
last_updated: 2026-10-11
updated_by: P1-T1
code_paths:
  - supabase/migrations/20261007000200_core_engine.sql
---

# Code style (SQL)

> The storage engine is the product. SQL in this repo reads like a small
> library, not a scratch script.

## Format

- Lowercase keywords, 2-space indent.
- Every table and function is schema-qualified: `downstash.kv`, not `kv`.
- Parameter names start `p_`, locals `v_`, records `r_`, booleans read as a
  sentence (`v_has`, `is_write`).
- A comment block before every function with `Command`, `Syntax`, `Returns`,
  `Errors` (commands) or `Purpose`, `Params`, `Returns` (helpers), plus a
  matching `comment on function`.

## Security

Every `security definer` function **must** set `search_path = ''` and qualify
every object it touches. This is the difference between a private schema and a
privilege-escalation vector.

```sql
create or replace function public.downstash_exec(p_token text, p_cmd text, p_args jsonb default '[]')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
...
$$;
```

## Command handlers

One `downstash.cmd_<lowercase>(p_db uuid, p_args text[]) returns jsonb` per
command. `p_args` excludes the command name, so `p_args[1]` is usually the key.
Reads are `stable`, writes are `volatile`. Register every command in
`downstash.command_registry` in the same migration that adds the handler.

## Migrations

Migrations are append-only once merged. Fix forward with a new migration and
explain the bug in its header comment. Write every statement so it can be
re-applied: `create or replace function`, `insert ... on conflict do update`,
`create table if not exists`.

Every migration that creates a `public` function must:

1. `revoke all on function ... from public, anon, authenticated;`
2. `grant execute on function ... to <allowed roles>;`
3. End with `notify pgrst, 'reload schema';`

## Numeric helpers

Do the integer maths in `numeric` and range-check against bigint, or you get a
raw cast failure instead of `ERR value is not an integer or out of range`. See
`downstash.to_int`.

## Related

- [code-style-typescript.md](./code-style-typescript.md) ·
  [../engine/schema.md](../engine/schema.md)
