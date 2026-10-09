-- @file 20261007001000_seed.sql
-- Deterministic local/dev seed: one database with a known standard + readonly
-- token. The token plaintexts are documented here so tests can use them; in
-- production tokens are generated via `pnpm tokens:new` and never seeded.
-- Plaintext tokens (local only):
--   standard: dsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
--   readonly: dsr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb

insert into downstash.databases (id, workspace_id, name, l1_ttl_ms, created_by)
values (
  '00000000-0000-4000-8000-000000000001',
  'local',
  'test-db',
  1000,
  'seed'
)
on conflict (workspace_id, name) do nothing;

insert into downstash.tokens (db_id, kind, token_hash, token_hint)
values
  (
    '00000000-0000-4000-8000-000000000001',
    'standard',
    extensions.digest('dsk_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'sha256'),
    'dsk_aaaa…aaaa'
  ),
  (
    '00000000-0000-4000-8000-000000000001',
    'readonly',
    extensions.digest('dsr_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'sha256'),
    'dsr_bbbb…bbbb'
  )
on conflict do nothing;
