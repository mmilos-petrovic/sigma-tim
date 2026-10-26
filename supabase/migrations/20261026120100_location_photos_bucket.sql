-- Photos of a location (1-3 per location, see public.location_photos for the order).
--
-- A private bucket: only approved members read it (through short-lived signed links), only the admin writes.
-- Type and size are enforced by the Storage API from these settings; the browser also shrinks the picture before
-- uploading. Objects are named '<location id>/<file>'. Deleting an object is done through the Storage API
-- (a direct DELETE from SQL is blocked by Storage itself), so the app removes the files before it deletes a location.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('location-photos', 'location-photos', false, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy location_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'location-photos' and (select private.is_member()));

create policy location_photos_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'location-photos' and (select private.is_admin()));

create policy location_photos_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'location-photos' and (select private.is_admin()))
  with check (bucket_id = 'location-photos' and (select private.is_admin()));

create policy location_photos_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'location-photos' and (select private.is_admin()));
