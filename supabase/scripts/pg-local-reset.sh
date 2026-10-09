#!/usr/bin/env bash
# @file supabase/scripts/pg-local-reset.sh
# Recreate a scratch `downstash_test` database on the local scratch Postgres
# (port 55432), bootstrap the Supabase-like prerequisites (extensions schema,
# anon/authenticated/service_role roles), and load every migration in order.
# Used for local SQL validation without Docker/Supabase.
set -euo pipefail

PGBIN="${PGBIN:-/opt/homebrew/opt/postgresql@15/bin}"
HOST="${PGHOST:-/tmp}"
PORT="${PGPORT:-55432}"
USER="${PGUSER:-$(whoami)}"
DB="${PGDATABASE:-downstash_test}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-supabase/migrations}"

export LC_ALL=C.UTF-8 LANG=C.UTF-8

PSQL="$PGBIN/psql -h $HOST -p $PORT -U $USER"

# Drop & recreate for a clean slate.
$PSQL -d postgres -q -c "drop database if exists $DB;" >/dev/null
$PSQL -d postgres -q -c "create database $DB;" >/dev/null

# Supabase-like prerequisites.
$PSQL -d "$DB" -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
create schema if not exists extensions;
do $$ begin if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if; end $$;
SQL

# Load migrations in lexical (chronological) order.
for f in "$MIGRATIONS_DIR"/*.sql; do
  echo "--- loading $(basename "$f") ---"
  $PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$f" >/dev/null
done

echo "OK: $DB reset and all migrations loaded"
