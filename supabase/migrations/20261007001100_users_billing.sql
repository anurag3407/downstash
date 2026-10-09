-- ---------------------------------------------------------------------------
-- 00600 — Users, workspaces, subscriptions, invoices, usage-meter (§1, §2).
-- ---------------------------------------------------------------------------

create table if not exists downstash.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

create table if not exists downstash.memberships (
  user_id uuid not null,
  workspace_id uuid not null references downstash.workspaces(id) on delete cascade,
  role text not null default 'member',
  primary key (user_id, workspace_id)
);

create table if not exists downstash.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references downstash.workspaces(id) on delete cascade,
  plan text not null default 'free',
  status text not null default 'active',
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subs_ws_idx on downstash.subscriptions(workspace_id);

create table if not exists downstash.invoices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references downstash.workspaces(id) on delete cascade,
  amount_cents integer not null,
  currency text not null default 'usd',
  status text not null default 'open',
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default now()
);

create table if not exists downstash.usage_daily (
  db_id uuid not null references downstash.databases(id) on delete cascade,
  day date not null,
  commands bigint not null default 0,
  bytes bigint not null default 0,
  storage_bytes bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (db_id, day)
);

create table if not exists downstash.audit_log (
  id bigserial primary key,
  workspace_id uuid,
  user_id uuid,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
