-- @file Core schema: private `downstash` schema, control-plane tables and the UNLOGGED keyspace.
-- @see docs/engine/schema.md

create extension if not exists pgcrypto with schema extensions;

create schema if not exists downstash;
revoke all on schema downstash from public;
revoke all on schema downstash from anon, authenticated;

-- Databases: one logical Redis database per row, owned by a workspace (Clerk org id or user id).
create table if not exists downstash.databases (
  id           uuid primary key default gen_random_uuid(),
  workspace_id text not null,
  name         text not null check (name ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  l1_ttl_ms    integer not null default 0 check (l1_ttl_ms between 0 and 10000),
  created_by   text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (workspace_id, name)
);
create index if not exists databases_workspace_idx on downstash.databases (workspace_id, created_at desc);

-- Tokens: SHA-256 hash for lookup; AES-256-GCM ciphertext so the console can reveal it.
create table if not exists downstash.tokens (
  id          uuid primary key default gen_random_uuid(),
  db_id       uuid not null references downstash.databases (id) on delete cascade,
  kind        text not null check (kind in ('standard', 'readonly')),
  token_hash  bytea not null unique,
  token_enc   text,           -- 'v1:<iv_b64>:<ciphertext_and_tag_b64>'; null only for seed tokens
  token_hint  text not null,  -- e.g. 'dsk_Ab3x…9QzT'
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create unique index if not exists tokens_one_active_per_kind
  on downstash.tokens (db_id, kind) where revoked_at is null;

-- Keyspace. UNLOGGED = no WAL = fast writes, truncated on crash (see docs/ops/durability.md).
-- key uses the "C" collation so btree prefix scans (KEYS/SCAN) and byte ordering work.
create unlogged table if not exists downstash.kv (
  db_id      uuid not null references downstash.databases (id) on delete cascade,
  key        text collate "C" not null,
  type       text not null check (type in ('string', 'hash', 'list', 'set', 'zset')),
  val        jsonb not null,
  expires_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (db_id, key)
);
create index if not exists kv_expires_at_idx on downstash.kv (expires_at) where expires_at is not null;

-- Usage counters, one row per database per UTC hour.
create table if not exists downstash.usage_hourly (
  db_id             uuid not null references downstash.databases (id) on delete cascade,
  hour              timestamptz not null,
  requests          bigint not null default 0,
  commands          bigint not null default 0,
  reads             bigint not null default 0,
  writes            bigint not null default 0,
  errors            bigint not null default 0,
  l1_hits           bigint not null default 0,
  failover_requests bigint not null default 0,
  console_commands  bigint not null default 0,
  bytes_in          bigint not null default 0,
  bytes_out         bigint not null default 0,
  primary key (db_id, hour)
);

-- Storage snapshots, one row per database per UTC day (overwritten every 10 minutes).
create table if not exists downstash.db_stats_daily (
  db_id       uuid not null references downstash.databases (id) on delete cascade,
  day         date not null,
  keys        bigint not null,
  bytes       bigint not null,
  computed_at timestamptz not null default now(),
  primary key (db_id, day)
);

-- SCAN cursors: numeric cursor id -> last key returned. Swept after 10 minutes.
create unlogged table if not exists downstash.scan_cursors (
  id         bigint generated always as identity primary key,
  db_id      uuid not null,
  last_key   text collate "C" not null,
  created_at timestamptz not null default now()
);

-- Command registry: the single source of truth for command metadata.
create table if not exists downstash.command_registry (
  name      text primary key check (name = upper(name)),
  handler   regproc not null,
  arity     smallint not null,     -- Redis convention: includes the command name; negative = minimum
  flags     text[] not null,       -- subset of {read, write, cacheable, admin, script}
  first_key smallint not null,     -- Redis convention (argv[0] = command); 0 = no keys
  last_key  smallint not null,     -- -1 = last argument
  key_step  smallint not null,
  family    text not null check (family in ('strings','keyspace','hashes','lists','sets','zsets','server','scripting')),
  summary   text not null
);

-- Known Lua scripts (by SHA-1) mapped to native PL/pgSQL ports. See docs/engine/scripts.md.
create table if not exists downstash.scripts (
  sha1     text primary key check (sha1 ~ '^[0-9a-f]{40}$'),
  name     text not null,
  handler  regproc not null,       -- (p_db uuid, p_keys text[], p_argv text[]) returns jsonb
  is_write boolean not null,
  source   text not null,          -- exact Lua body
  origin   text not null           -- e.g. '@upstash/ratelimit@2.0.5 fixedWindowLimitScript'
);

alter table downstash.databases        enable row level security;
alter table downstash.tokens           enable row level security;
alter table downstash.kv               enable row level security;
alter table downstash.usage_hourly     enable row level security;
alter table downstash.db_stats_daily   enable row level security;
alter table downstash.scan_cursors     enable row level security;
alter table downstash.command_registry enable row level security;
alter table downstash.scripts          enable row level security;
