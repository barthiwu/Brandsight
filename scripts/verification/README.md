# Local security verification

These scripts verify RLS policies and the atomic rate-limit function
against a **real Postgres instance**, not by reading the SQL and hoping.
They exist because this project's live Supabase project is not reachable
from every environment this code is built or reviewed in (see
`tests/helpers/liveEnv.ts`), so `tests/security/*.test.ts` (which need a
real Supabase project) may not always be runnable. These scripts give a
Supabase-free way to exercise the same migrations for real.

They are **not** a substitute for running the full test suite, including
the live-gated integration/security/E2E tests, against the actual Supabase
project before launch (spec §64 — see `docs/final-build-audit.md`).

## What's verified

- `verify_rls.mjs` — nine scenarios against real Postgres row-level
  security using the project's actual migration files: cross-user read/
  update/delete denial on `audits`, forged `owner_id` and `brand_id`
  rejection on insert, that `audit_findings` has no client insert policy at
  all (server-pipeline-only), that `anon` gets zero rows from `audits`, and
  that `rate_limit_events` is fully deny-all for `authenticated`.
- `verify_rate_limit_race.mjs` — fires 30 concurrent calls at
  `check_and_record_rate_limit` (migration `0008_atomic_rate_limit.sql`)
  against a limit of 5, and asserts exactly 5 are allowed and exactly 5
  rows land in `rate_limit_events`. This is the regression test for the
  hardening-pass fix to the original check-then-act race in
  `checkRateLimit()`, where two separate round trips (a SELECT count, then
  an INSERT) let concurrent callers oversubscribe the limit.
- `verify_duplicate_processing_race.mjs` — the named "duplicate audit
  processing" security test (hardening pass §57/§58). Fires 25 concurrent
  calls at `try_lock_audit_processing` (migration `0004_functions_triggers.sql`)
  for the same `ready` audit and asserts exactly one wins the lock and
  transitions the audit to `processing`; also checks that `processing`,
  `completed`, `draft`, and `cancelled` audits can never be locked again,
  and that a `failed` audit can (the retry path). This is the function
  `src/app/api/audits/[auditId]/process/route.ts` relies on to guarantee
  the AI pipeline is never kicked off twice concurrently for one audit.

## Requirements

- A local Postgres 16+ reachable with superuser credentials.
- The `pg` npm package. It is **not** a project dependency (the app itself
  only ever talks to Postgres through Supabase's client libraries) —
  install it ad hoc wherever you run these scripts:
  `npm install --no-save pg` (or run from a scratch directory with its own
  `node_modules`, as these scripts have no other dependencies on the rest
  of the repo).

## Running

```bash
# From the repo root:
PGPASSWORD=postgres ./scripts/verification/bootstrap_local_db.sh

# From wherever you installed `pg` (repo root, or a scratch directory
# with these three files copied in):
PGDATABASE=brandsight_verify PGPASSWORD=postgres node scripts/verification/verify_rls.mjs
PGDATABASE=brandsight_verify PGPASSWORD=postgres node scripts/verification/verify_rate_limit_race.mjs
PGDATABASE=brandsight_verify PGPASSWORD=postgres node scripts/verification/verify_duplicate_processing_race.mjs
```

All connection settings honor standard `PG*` environment variables
(`PGHOST`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT`) and default to
`localhost` / `postgres` / `postgres` / `brandsight_verify` / `5432`.

## How the stand-in schema works

`stub_supabase.sql` creates just enough of Supabase's `auth` and `storage`
schemas — `auth.users`, `auth.uid()` (reading a session GUC instead of a
real JWT), `storage.buckets`/`storage.objects`/`storage.foldername()`, and
the `anon`/`authenticated`/`service_role` roles — for BrandSight's own
migrations in `supabase/migrations/` to apply completely unmodified. It is
intentionally minimal: it does not attempt to reproduce Supabase Auth's
actual behavior, only the schema shapes our migrations reference.
`bootstrap_local_db.sh` also grants `authenticated`/`anon` the same broad
table privileges Supabase provisions automatically on every real project —
RLS, not table grants, is the actual access boundary there, so the stand-in
needs to match that or the checks would pass for the wrong reason (missing
grants) rather than the right one (RLS policies).
