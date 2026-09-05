-- BrandSight V1 — Migration 0007
-- Postgres grants EXECUTE on newly created functions to PUBLIC by
-- default. try_lock_audit_processing is SECURITY DEFINER and bypasses
-- RLS, so it must only ever be callable from trusted server code (the
-- service role) that has already verified the caller owns the audit —
-- never directly by anon/authenticated, who could otherwise flip any
-- guessed audit UUID into "processing" regardless of ownership.
-- get_shared_audit_report is intentionally public: it enforces its own
-- token-based authorization internally.

revoke execute on function public.try_lock_audit_processing(uuid) from public;
revoke execute on function public.try_lock_audit_processing(uuid) from anon, authenticated;
grant execute on function public.try_lock_audit_processing(uuid) to service_role;

revoke execute on function public.set_updated_at() from public;
revoke execute on function public.handle_new_user() from public;
