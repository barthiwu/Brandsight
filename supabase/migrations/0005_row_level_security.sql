-- BrandSight V1 — Migration 0005
-- Row Level Security. Every user-owned table gets RLS enabled with
-- owner-scoped policies. Tables with no policy for a role are implicitly
-- deny-all for that role once RLS is enabled (service_role bypasses RLS
-- entirely and is used only in trusted server-side code).

alter table public.profiles enable row level security;
alter table public.brands enable row level security;
alter table public.brand_audience enable row level security;
alter table public.brand_objectives enable row level security;
alter table public.marketing_profiles enable row level security;
alter table public.social_profiles enable row level security;
alter table public.competitors enable row level security;
alter table public.audits enable row level security;
alter table public.audit_responses enable row level security;
alter table public.audit_evidence enable row level security;
alter table public.audit_dimensions enable row level security;
alter table public.audit_findings enable row level security;
alter table public.audit_recommendations enable row level security;
alter table public.audit_action_plans enable row level security;
alter table public.audit_assets enable row level security;
alter table public.website_sources enable row level security;
alter table public.leads enable row level security;
alter table public.audit_shares enable row level security;
alter table public.rate_limit_events enable row level security;

-- =========================================================================
-- PROFILES — a user may only see/update their own profile row.
-- =========================================================================
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- =========================================================================
-- BRANDS — full CRUD scoped to owner_id.
-- =========================================================================
create policy "brands_select_own" on public.brands
  for select using (owner_id = auth.uid());
create policy "brands_insert_own" on public.brands
  for insert with check (owner_id = auth.uid());
create policy "brands_update_own" on public.brands
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "brands_delete_own" on public.brands
  for delete using (owner_id = auth.uid());

-- =========================================================================
-- Generic helper predicate reused via inline EXISTS: brand ownership chain.
-- (Postgres has no shared macro across policies, so each policy repeats it.)
-- =========================================================================

-- BRAND_AUDIENCE
create policy "brand_audience_all_own" on public.brand_audience
  for all using (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  );

-- BRAND_OBJECTIVES
create policy "brand_objectives_all_own" on public.brand_objectives
  for all using (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  );

-- MARKETING_PROFILES
create policy "marketing_profiles_all_own" on public.marketing_profiles
  for all using (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  );

-- SOCIAL_PROFILES
create policy "social_profiles_all_own" on public.social_profiles
  for all using (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  );

-- COMPETITORS
create policy "competitors_all_own" on public.competitors
  for all using (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  );

-- =========================================================================
-- AUDITS — scoped to owner_id directly. Insert must also prove the caller
-- owns the target brand (defense in depth against a forged brand_id).
-- =========================================================================
create policy "audits_select_own" on public.audits
  for select using (owner_id = auth.uid());
create policy "audits_insert_own" on public.audits
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from public.brands b where b.id = brand_id and b.owner_id = auth.uid())
  );
create policy "audits_update_own" on public.audits
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "audits_delete_own" on public.audits
  for delete using (owner_id = auth.uid());

-- =========================================================================
-- Audit-scoped child tables — ownership flows through audits.owner_id.
-- =========================================================================
create policy "audit_responses_all_own" on public.audit_responses
  for all using (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  );

create policy "audit_evidence_select_own" on public.audit_evidence
  for select using (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  );

create policy "audit_dimensions_select_own" on public.audit_dimensions
  for select using (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  );

create policy "audit_findings_select_own" on public.audit_findings
  for select using (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  );

create policy "audit_recommendations_select_own" on public.audit_recommendations
  for select using (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  );

create policy "audit_action_plans_select_own" on public.audit_action_plans
  for select using (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  );

create policy "website_sources_select_own" on public.website_sources
  for select using (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  );

-- Note: audit_evidence, audit_dimensions, audit_findings, audit_recommendations,
-- audit_action_plans and website_sources are written exclusively by the
-- server-side AI pipeline using the service role key (which bypasses RLS),
-- never directly by the client — so only SELECT policies are defined here.

-- =========================================================================
-- AUDIT_ASSETS — owner_id is denormalized onto the row for a fast, direct
-- policy; still cross-checked against the parent audit.
-- =========================================================================
create policy "audit_assets_select_own" on public.audit_assets
  for select using (owner_id = auth.uid());
create policy "audit_assets_insert_own" on public.audit_assets
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  );
create policy "audit_assets_delete_own" on public.audit_assets
  for delete using (owner_id = auth.uid());

-- =========================================================================
-- LEADS — the owning business may read and update (triage) their leads.
-- No client-side insert policy: leads are always written server-side via
-- the service role after deriving owner_id from the audit record, so a
-- client can never forge whose lead list they land in.
-- =========================================================================
create policy "leads_select_own" on public.leads
  for select using (owner_id = auth.uid());
create policy "leads_update_own" on public.leads
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- =========================================================================
-- AUDIT_SHARES — owner manages their own share links directly.
-- =========================================================================
create policy "audit_shares_all_own" on public.audit_shares
  for all using (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.audits a where a.id = audit_id and a.owner_id = auth.uid())
  );

-- rate_limit_events: no policies for anon/authenticated -> fully deny-all
-- for those roles. Only server code using the service role key reads/writes it.
