-- BrandSight V1 — Migration 0008
-- Atomic rate limiting (hardening pass §19/§57 — "atomic rate limiting").
--
-- The original checkRateLimit() implementation did a SELECT count(*) and
-- then a separate INSERT as two round trips from the application. Under
-- concurrent requests sharing the same bucket_key (e.g. a burst of
-- parallel calls before the first one's insert lands), every request could
-- observe a count still under the limit and be allowed through — a
-- classic check-then-act race that lets an attacker (or just a buggy
-- retrying client) exceed the configured limit. Moving both the read and
-- the write into a single SECURITY DEFINER function, serialized per bucket
-- with a transaction-scoped advisory lock, closes that race: concurrent
-- callers for the same bucket_key now execute this function one at a time.

create or replace function public.check_and_record_rate_limit(
  p_bucket_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, current_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz := now() - (p_window_seconds || ' seconds')::interval;
  v_count integer;
begin
  -- Serializes concurrent callers for the SAME bucket_key only (a hash of
  -- the key, not a table-wide lock) — released automatically at the end of
  -- this function's transaction. Different buckets never block each other.
  perform pg_advisory_xact_lock(hashtextextended(p_bucket_key, 0));

  select count(*) into v_count
  from public.rate_limit_events
  where bucket_key = p_bucket_key
    and created_at >= v_window_start;

  if v_count >= p_limit then
    return query select false, v_count;
    return;
  end if;

  insert into public.rate_limit_events (bucket_key) values (p_bucket_key);
  return query select true, v_count + 1;
end;
$$;

-- Bypasses RLS-equivalent concerns (rate_limit_events has no RLS policies
-- at all — it's not user-scoped) but must still only ever be invoked by
-- trusted server code that has already chosen an appropriate bucket key;
-- letting anon/authenticated call it directly would let a client probe or
-- pollute other callers' buckets by guessing their bucket_key string.
revoke execute on function public.check_and_record_rate_limit(text, integer, integer) from public;
revoke execute on function public.check_and_record_rate_limit(text, integer, integer) from anon, authenticated;
grant execute on function public.check_and_record_rate_limit(text, integer, integer) to service_role;
