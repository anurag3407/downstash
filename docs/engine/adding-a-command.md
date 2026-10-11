---
title: Adding a command
status: stable
last_updated: 2026-10-11
updated_by: P1-T5
code_paths:
  - supabase/migrations/20261007000400_cmd_strings.sql
  - packages/protocol/scripts/gen-commands-doc.ts
---

# Adding a command

> The procedure for adding one Redis command. Follow it in order; each step has a
> test that fails when you skip it.

## Worked example: `STRLEN`

`STRLEN key` is already implemented — what follows is the order it was built in,
with the actual code at each step.

### 1. Write the handler in the family migration

Commands live in the migration for their family. Handlers have the signature
`downstash.cmd_<lowercase>(p_db uuid, p_args text[]) returns jsonb`, and `p_args`
excludes the command name, so `p_args[1]` is the key.

```sql
create or replace function downstash.cmd_strlen(p_db uuid, p_args text[])
returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  r downstash.kv;
begin
  r := downstash.read_live(p_db, p_args[1], 'string');
  return to_jsonb(coalesce(octet_length(r.val #>> '{}'), 0));
end;
$$;
comment on function downstash.cmd_strlen(uuid, text[]) is 'STRLEN key';
```

Reads are `stable`, writes are `volatile`. Always `set search_path = ''` and
schema-qualify. Use `read_live` for a read, `lock_live` for a
modify-if-exists, `lock_or_create` for a read-modify-write, `put` for a blind
overwrite ([concurrency.md](./concurrency.md)).

Think about **options are case-insensitive**: Redis accepts `byScore`,
`byscore` and `BYSCORE`. Parse with `upper(p_args[i])`.

### 2. Register it

At the end of the same migration:

```sql
insert into downstash.command_registry
  (name, handler, arity, flags, first_key, last_key, key_step, family, summary)
values
  ('STRLEN', 'downstash.cmd_strlen', 2, '{read}', 1, 1, 1, 'strings', 'Get the length of a key')
on conflict (name) do update set
  handler = excluded.handler, arity = excluded.arity, flags = excluded.flags,
  first_key = excluded.first_key, last_key = excluded.last_key, key_step = excluded.key_step,
  family = excluded.family, summary = excluded.summary;
```

`arity` uses the Redis convention and includes the command name; negative means
"at least". `flags` is a subset of `read`, `write`, `cacheable`, `admin`,
`script`.

### 3. Mirror it in the protocol package

Add a `CommandSpec` to `packages/protocol/src/registry/<family>.ts`. The
`summary` must equal the registry's `summary` byte for byte —
`tests/sql/registry-parity.test.ts` deep-compares the two and fails otherwise.

```ts
{
  name: 'STRLEN',
  arity: 2,
  flags: ['read'],
  firstKey: 1,
  lastKey: 1,
  keyStep: 1,
  family: 'strings',
  summary: 'Get the length of a key',
  syntax: 'STRLEN key'
}
```

### 4. Test it in SQL

`tests/sql/<family>.test.ts`. Cover, at minimum:

1. happy path,
2. missing key,
3. wrong type → `WRONGTYPE`,
4. arity errors,
5. every option,
6. TTL interaction (an expired key behaves as missing),
7. a read-only token → `NOPERM` for writes.

### 5. Add differential corpus steps

`tests/differential/corpus/<family>.ts`. Every step is either a plain comparison
or one with `normalize` / `errorPrefix`. These run against real Redis 7 in CI, so
they catch the differences unit tests cannot.

### 6. Regenerate the docs

```bash
pnpm docs:commands
```

This rewrites `docs/engine/commands.md`. Never hand-edit that file.

## Checklist

- [ ] handler + `comment on function` in the family migration
- [ ] `command_registry` upsert
- [ ] `packages/protocol` spec (parity test green)
- [ ] SQL tests
- [ ] differential corpus steps
- [ ] `docs/engine/errors.md` updated if you added an error string
- [ ] `pnpm docs:commands` run
- [ ] `docs/codemap.md` updated if you added a file

## Related

- [commands.md](./commands.md) (generated) · [errors.md](./errors.md) ·
  [../conventions/code-style-sql.md](../conventions/code-style-sql.md)
