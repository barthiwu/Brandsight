-- BrandSight V1 — Migration 0009
-- Adds a global processing-capacity cap (never load-tested before this —
-- prior to this migration any number of audits could enter "processing"
-- concurrently against a single small Render instance) and per-audit AI
-- token-usage tracking (previously nothing recorded what any audit
-- actually cost to run). See HARDENING_REPORT.md, "Devil's advocate"
-- follow-up, for the reasoning.

-- =========================================================================
-- Capacity-aware processing lock
-- =========================================================================
-- Replaces the migration-0004 version. try_lock_audit_processing gains a
-- p_max_concurrent parameter (default 3, matching MAX_CONCURRENT_AUDITS's
-- own default in src/app/api/audits/[auditId]/process/route.ts — keep
-- them in sync, or better, always pass the env-driven value explicitly as
-- the route does) and now refuses to admit a new audit into "processing"
-- once that many are already in flight, instead of admitting an unlimited
-- number simultaneously.
--
-- Adding a parameter changes the function's signature, which in Postgres
-- creates a distinct overload rather than replacing the old one in place
-- — so the old 1-argument version is dropped explicitly first, and the
-- same restrictive grants from migration 0007 (service_role only; never
-- anon/authenticated, since this is SECURITY DEFINER and bypasses RLS)
-- are re-applied to the new 2-argument version below.
drop function if exists public.try_lock_audit_processing(uuid);

create or replace function public.try_lock_audit_processing(p_audit_id uuid, p_max_concurrent int default 3)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
  v_in_flight int;
begin
  -- Serializes concurrent callers of this function on one advisory lock
  -- key, so the "how many are in flight" read and the lock-acquiring
  -- UPDATE happen atomically together. Without this, two requests could
  -- both read the same in-flight count before either commits, and both
  -- get admitted even when exactly at capacity (classic TOCTOU race).
  -- Transaction-scoped: released automatically when this function's
  -- implicit transaction ends, so it never outlives the call.
  perform pg_advisory_xact_lock(hashtext('brandsight_audit_processing_capacity'));

  select count(*) into v_in_flight from public.audits where status = 'processing';
  if v_in_flight >= p_max_concurrent then
    return false;
  end if;

  update public.audits
  set status = 'processing',
      processing_locked_at = now(),
      processing_error = null,
      started_at = coalesce(started_at, now())
  where id = p_audit_id
    and status in ('ready', 'failed')
  returning 1 into v_rows;

  return v_rows is not null;
end;
$$;

revoke execute on function public.try_lock_audit_processing(uuid, int) from public;
revoke execute on function public.try_lock_audit_processing(uuid, int) from anon, authenticated;
grant execute on function public.try_lock_audit_processing(uuid, int) to service_role;

-- =========================================================================
-- Per-audit AI usage tracking
-- =========================================================================
-- Real token counts from every OpenAI Responses API call the pipeline
-- makes for this audit (see src/lib/ai/usageTracking.ts), so cost is
-- visible per audit rather than invisible until the monthly invoice.
-- Dollar cost is computed application-side from configurable
-- OPENAI_INPUT_PRICE_PER_1M / OPENAI_OUTPUT_PRICE_PER_1M env vars (left
-- null here when unset — never a guessed/hardcoded price) rather than in
-- SQL, so a price correction never requires a migration.
alter table public.audits
  add column if not exists ai_input_tokens integer,
  add column if not exists ai_output_tokens integer,
  add column if not exists ai_estimated_cost_usd numeric(10, 4),
  add column if not exists admitted_over_capacity boolean not null default false;

comment on column public.audits.admitted_over_capacity is
  'True when this audit started processing only after the capacity-wait window in the process route was exhausted (see acquireProcessingSlot) — i.e. it ran despite the MAX_CONCURRENT_AUDITS soft cap already being full. A sustained run of these means the instance needs more capacity, not just a longer wait.';
