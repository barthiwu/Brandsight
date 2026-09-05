-- BrandSight V1 — Migration 0004
-- Triggers (updated_at, profile provisioning) and security-definer RPCs.

-- =========================================================================
-- updated_at maintenance
-- =========================================================================
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles','brands','brand_audience','brand_objectives','marketing_profiles',
    'audits','audit_responses','audit_dimensions','audit_action_plans'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; ' ||
      'create trigger set_updated_at before update on public.%I ' ||
      'for each row execute function public.set_updated_at();',
      t, t
    );
  end loop;
end;
$$;

-- =========================================================================
-- Auto-create a profile row when a new auth user signs up
-- =========================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- Idempotent audit-processing lock.
-- Atomically transitions ready|failed -> processing. Returns true if this
-- caller won the lock, false if another request already holds it or the
-- audit is not in a lockable state. A single UPDATE is atomic under
-- Postgres's MVCC row locking, so concurrent callers cannot both win.
-- =========================================================================
create or replace function public.try_lock_audit_processing(p_audit_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
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

-- =========================================================================
-- Public, curated read of a shared audit report.
-- SECURITY DEFINER so the anonymous role never needs direct table grants;
-- explicitly excludes leads, private notes, and internal metadata.
-- =========================================================================
create or replace function public.get_shared_audit_report(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audit_id uuid;
  v_result jsonb;
begin
  select audit_id into v_audit_id
  from public.audit_shares
  where share_token = p_token
    and is_active = true
    and (expires_at is null or expires_at > now());

  if v_audit_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'audit', jsonb_build_object(
      'id', a.id,
      'audit_type', a.audit_type,
      'overall_score', a.overall_score,
      'overall_confidence', a.overall_confidence,
      'executive_summary', a.executive_summary,
      'completed_at', a.completed_at
    ),
    'brand', jsonb_build_object(
      'name', b.name,
      'industry', b.industry,
      'website_url', b.website_url
    ),
    'dimensions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dimension_key', d.dimension_key,
        'score', d.score,
        'confidence', d.confidence,
        'summary', d.summary
      ) order by d.dimension_key), '[]'::jsonb)
      from public.audit_dimensions d where d.audit_id = a.id
    ),
    'findings', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dimension_key', f.dimension_key,
        'type', f.type,
        'title', f.title,
        'description', f.description,
        'confidence', f.confidence
      ) order by f.priority_score desc nulls last), '[]'::jsonb)
      from public.audit_findings f where f.audit_id = a.id
    ),
    'recommendations', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'dimension_key', r.dimension_key,
        'title', r.title,
        'description', r.description,
        'impact', r.impact,
        'difficulty', r.difficulty,
        'timeframe', r.timeframe
      ) order by r.priority_score desc nulls last), '[]'::jsonb)
      from public.audit_recommendations r where r.audit_id = a.id
    ),
    'action_plan', (
      select jsonb_build_object('plan_30_day', p.plan_30_day)
      from public.audit_action_plans p where p.audit_id = a.id
    )
  )
  into v_result
  from public.audits a
  join public.brands b on b.id = a.brand_id
  where a.id = v_audit_id
    and a.status = 'completed';

  return v_result;
end;
$$;

grant execute on function public.get_shared_audit_report(text) to anon, authenticated;
