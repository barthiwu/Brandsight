-- BrandSight V1 — Migration 0003
-- Leads, public sharing, and a DB-backed rate-limiting table.

-- =========================================================================
-- LEADS
-- =========================================================================
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  phone text,
  business_name text,
  consent_marketing boolean not null default false,
  consent_timestamp timestamptz,
  source text not null default 'audit_report',
  status text not null default 'new' check (status in ('new','contacted','qualified','converted','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists leads_audit_id_idx on public.leads(audit_id);
create index if not exists leads_owner_id_idx on public.leads(owner_id);
create index if not exists leads_status_idx on public.leads(status);

-- =========================================================================
-- PUBLIC SHARING
-- =========================================================================
create table if not exists public.audit_shares (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  share_token text not null unique,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists audit_shares_audit_id_idx on public.audit_shares(audit_id);
create index if not exists audit_shares_token_idx on public.audit_shares(share_token);

-- =========================================================================
-- RATE LIMITING (DB-backed fixed-window limiter; see lib/security/rateLimit.ts)
-- =========================================================================
create table if not exists public.rate_limit_events (
  id bigint generated always as identity primary key,
  bucket_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_bucket_created_idx
  on public.rate_limit_events(bucket_key, created_at desc);

-- Periodically prunable; a cron/edge function can delete rows older than 1 day.
comment on table public.rate_limit_events is
  'Append-only event log used for fixed-window rate limiting. Safe to prune rows older than 24h.';
