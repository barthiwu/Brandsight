-- BrandSight V1 — Migration 0002
-- Audits and all audit-scoped child tables.

-- =========================================================================
-- AUDITS
-- =========================================================================
create table if not exists public.audits (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  audit_type text not null check (audit_type in ('quick','deep')),
  status text not null default 'draft' check (status in ('draft','ready','processing','completed','failed','cancelled')),
  overall_score integer check (overall_score is null or (overall_score >= 0 and overall_score <= 100)),
  overall_confidence text check (overall_confidence is null or overall_confidence in ('high','medium','low')),
  executive_summary text,
  processing_error text,
  processing_locked_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists audits_brand_id_idx on public.audits(brand_id);
create index if not exists audits_owner_id_idx on public.audits(owner_id);
create index if not exists audits_status_idx on public.audits(status);

-- =========================================================================
-- AUDIT RESPONSES (structured user answers, autosave target)
-- =========================================================================
create table if not exists public.audit_responses (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  section text not null,
  question_key text not null,
  answer jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id, question_key)
);

create index if not exists audit_responses_audit_id_idx on public.audit_responses(audit_id);

-- =========================================================================
-- AUDIT EVIDENCE
-- =========================================================================
create table if not exists public.audit_evidence (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  dimension text not null check (dimension in ('positioning','audience','messaging','content','social','visual','digital','competition')),
  source_type text not null check (source_type in ('user_input','website','social','uploaded_asset','competitor','system')),
  source_reference text,
  content text,
  evidence_status text not null check (evidence_status in ('observed','provided','inferred','unavailable')),
  confidence text not null default 'low' check (confidence in ('high','medium','low')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_evidence_audit_id_idx on public.audit_evidence(audit_id);
create index if not exists audit_evidence_dimension_idx on public.audit_evidence(dimension);

-- =========================================================================
-- AUDIT DIMENSIONS (deterministic scoring output)
-- =========================================================================
create table if not exists public.audit_dimensions (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  dimension_key text not null check (dimension_key in ('positioning','audience','messaging','content','social','visual','digital','competition')),
  score integer check (score is null or (score >= 0 and score <= 100)),
  confidence text not null default 'low' check (confidence in ('high','medium','low')),
  summary text,
  subcriteria jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id, dimension_key)
);

create index if not exists audit_dimensions_audit_id_idx on public.audit_dimensions(audit_id);

-- =========================================================================
-- FINDINGS
-- =========================================================================
create table if not exists public.audit_findings (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  dimension_key text not null check (dimension_key in ('positioning','audience','messaging','content','social','visual','digital','competition')),
  type text not null check (type in ('strength','weakness','opportunity')),
  title text not null,
  description text not null,
  severity text check (severity is null or severity in ('low','medium','high','critical')),
  impact text check (impact is null or impact in ('low','medium','high')),
  difficulty text check (difficulty is null or difficulty in ('low','medium','high')),
  priority_score numeric,
  confidence text not null default 'low' check (confidence in ('high','medium','low')),
  evidence_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_findings_audit_id_idx on public.audit_findings(audit_id);
create index if not exists audit_findings_dimension_idx on public.audit_findings(dimension_key);

-- =========================================================================
-- RECOMMENDATIONS
-- =========================================================================
create table if not exists public.audit_recommendations (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  dimension_key text not null check (dimension_key in ('positioning','audience','messaging','content','social','visual','digital','competition')),
  finding_id uuid references public.audit_findings(id) on delete set null,
  title text not null,
  description text not null,
  why_it_matters text,
  action_steps jsonb not null default '[]'::jsonb,
  impact text check (impact is null or impact in ('low','medium','high')),
  difficulty text check (difficulty is null or difficulty in ('low','medium','high')),
  timeframe text,
  priority_score numeric,
  created_at timestamptz not null default now()
);

create index if not exists audit_recommendations_audit_id_idx on public.audit_recommendations(audit_id);

-- =========================================================================
-- ACTION PLANS
-- =========================================================================
create table if not exists public.audit_action_plans (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  plan_30_day jsonb not null default '[]'::jsonb,
  plan_60_day jsonb not null default '[]'::jsonb,
  plan_90_day jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audit_id)
);

-- =========================================================================
-- ASSETS
-- =========================================================================
create table if not exists public.audit_assets (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp','application/pdf')),
  file_size integer not null check (file_size > 0),
  asset_type text not null default 'brand_asset',
  analysis_status text not null default 'pending' check (analysis_status in ('pending','analyzed','failed','skipped')),
  created_at timestamptz not null default now()
);

create index if not exists audit_assets_audit_id_idx on public.audit_assets(audit_id);

-- =========================================================================
-- WEBSITE EVIDENCE
-- =========================================================================
create table if not exists public.website_sources (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  url text not null,
  status text not null default 'pending' check (status in ('pending','fetched','failed','skipped')),
  title text,
  description text,
  headings jsonb not null default '[]'::jsonb,
  body_text text,
  cta_text jsonb not null default '[]'::jsonb,
  contact_information jsonb not null default '{}'::jsonb,
  trust_signals jsonb not null default '[]'::jsonb,
  fetched_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists website_sources_audit_id_idx on public.website_sources(audit_id);
