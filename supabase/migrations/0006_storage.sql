-- BrandSight V1 — Migration 0006
-- Private storage bucket for brand/audit asset uploads.
-- Path convention enforced by the app: {owner_id}/{audit_id}/{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  false,
  10485760, -- 10 MB
  array['image/png','image/jpeg','image/webp','application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Objects are private; access is via short-lived signed URLs generated
-- server-side. These policies let an authenticated owner manage only the
-- objects under their own uid prefix — defense in depth even though the
-- app always uses the service role for asset writes.
create policy "brand_assets_select_own_prefix" on storage.objects
  for select using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "brand_assets_insert_own_prefix" on storage.objects
  for insert with check (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "brand_assets_delete_own_prefix" on storage.objects
  for delete using (
    bucket_id = 'brand-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
