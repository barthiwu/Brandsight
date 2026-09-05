-- BrandSight V1 — Migration 0001
-- Extensions, profiles, brands, and brand sub-profile tables.

create extension if not exists pgcrypto with schema extensions;

-- =========================================================================
-- PROFILES
-- =========================================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per authenticated user, mirrors auth.users.';

-- =========================================================================
-- BRANDS
-- =========================================================================
create table if not exists public.brands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  industry text,
  country text,
  city text,
  description text,
  website_url text,
  business_model text,
  primary_product_service text,
  years_operating integer check (years_operating is null or years_operating >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists brands_owner_id_idx on public.brands(owner_id);

-- =========================================================================
-- BRAND AUDIENCE
-- =========================================================================
create table if not exists public.brand_audience (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  ideal_customer text,
  customer_problem text,
  customer_reason_to_choose text,
  differentiator text,
  market_segment text,
  age_range text,
  gender text,
  location text,
  income_segment text,
  customer_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id)
);

create index if not exists brand_audience_brand_id_idx on public.brand_audience(brand_id);

-- =========================================================================
-- BRAND OBJECTIVES
-- =========================================================================
create table if not exists public.brand_objectives (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  primary_objective text,
  secondary_objectives jsonb not null default '[]'::jsonb,
  biggest_marketing_challenge text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id)
);

create index if not exists brand_objectives_brand_id_idx on public.brand_objectives(brand_id);

-- =========================================================================
-- MARKETING PROFILE
-- =========================================================================
create table if not exists public.marketing_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  channels jsonb not null default '[]'::jsonb,
  posting_frequency text,
  advertising_active boolean,
  content_creation_process text,
  marketing_team_size text,
  marketing_budget_range text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id)
);

create index if not exists marketing_profiles_brand_id_idx on public.marketing_profiles(brand_id);

-- =========================================================================
-- SOCIAL PROFILES
-- =========================================================================
create table if not exists public.social_profiles (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  platform text not null check (platform in ('instagram','facebook','tiktok','linkedin','x','youtube','other')),
  profile_url text,
  handle text,
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz not null default now()
);

create index if not exists social_profiles_brand_id_idx on public.social_profiles(brand_id);

-- =========================================================================
-- COMPETITORS
-- =========================================================================
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  name text not null,
  url text,
  social_handle text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists competitors_brand_id_idx on public.competitors(brand_id);
