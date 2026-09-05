#!/usr/bin/env bash
# Bootstraps a throwaway local Postgres database that stands in for a real
# Supabase project — just enough of the auth/storage schemas (see
# stub_supabase.sql) for BrandSight's own migrations to apply unmodified —
# then applies every migration in supabase/migrations/ in order.
#
# This exists because this project's live Supabase project is not reachable
# from every environment this code is built/reviewed in (see
# tests/helpers/liveEnv.ts), but RLS policies, SECURITY DEFINER functions,
# and privilege grants are exactly the kind of thing that must be checked
# against a real Postgres, not inferred from reading SQL. It does NOT
# replace testing against the real Supabase project before launch.
#
# Usage:
#   PGDATABASE=brandsight_verify ./scripts/verification/bootstrap_local_db.sh
#   node scripts/verification/verify_rls.mjs
#   node scripts/verification/verify_rate_limit_race.mjs
#
# Requires: a running local Postgres 16+ reachable with superuser
# credentials (defaults: host=localhost user=postgres password=postgres).
# The `pg` npm package must be installed (not a project dependency —
# install it ad hoc: `npm install --no-save pg` — since it's only used by
# these standalone verification scripts, never by the app itself).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PGHOST="${PGHOST:-localhost}"
PGUSER="${PGUSER:-postgres}"
PGPASSWORD="${PGPASSWORD:-postgres}"
PGDATABASE="${PGDATABASE:-brandsight_verify}"
export PGHOST PGUSER PGPASSWORD

echo "Recreating database ${PGDATABASE}..."
psql -h "$PGHOST" -U "$PGUSER" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS ${PGDATABASE};" \
  -c "CREATE DATABASE ${PGDATABASE};"

echo "Applying auth/storage stand-in schema..."
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/stub_supabase.sql"

echo "Applying application migrations..."
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -c "create schema if not exists extensions;"
for f in "$REPO_ROOT"/supabase/migrations/*.sql; do
  echo "  -> $(basename "$f")"
  psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 -f "$f"
done

echo "Granting default anon/authenticated table privileges (Supabase provisions these automatically on real projects; RLS is the actual gate, matching production)..."
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 \
  -c "grant select, insert, update, delete on all tables in schema public to authenticated;" \
  -c "grant select, insert, update, delete on all tables in schema public to anon;"

echo "Done. Database '${PGDATABASE}' is ready for scripts/verification/verify_*.mjs."
