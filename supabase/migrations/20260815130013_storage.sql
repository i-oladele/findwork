insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('provider-portfolios', 'provider-portfolios', true),
  ('product-images', 'product-images', true),
  ('classifieds-photos', 'classifieds-photos', true),
  ('dispute-evidence', 'dispute-evidence', false);

-- Public-read buckets: anyone can view, owner (first path segment = their
-- own uid) can write. Storage convention used throughout: object path is
-- "<owner_uid>/<filename>", checked via (storage.foldername(name))[1].

create policy "Public read: avatars"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "Owner write: avatars"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Owner update/delete: avatars"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Public read: provider portfolios"
  on storage.objects for select
  using (bucket_id = 'provider-portfolios');

create policy "Owner write: provider portfolios"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'provider-portfolios' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'provider-portfolios' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Public read: product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- Product images are catalog-managed (seed/admin), not user-uploaded —
-- no client write policy, same stance as the products table itself.

create policy "Public read: classifieds photos"
  on storage.objects for select
  using (bucket_id = 'classifieds-photos');

create policy "Owner write: classifieds photos"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'classifieds-photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'classifieds-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- Dispute evidence is private: only the dispute's own raiser can read/write
-- their uploaded evidence (owner-scoped path, same convention as above).
create policy "Owner read/write: dispute evidence"
  on storage.objects for all
  to authenticated
  using (bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'dispute-evidence' and (storage.foldername(name))[1] = auth.uid()::text);
