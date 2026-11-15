-- Photos of teacher CVs (teacher_cv.photo_path points at an object here).
--
-- A public bucket: a photo shown on a public CV has to load without signing in, and the public pages are prerendered.
-- Reading is therefore by address only. The file names are made unguessable by the app (a random uuid per upload),
-- and nobody can list the bucket: listing needs a select policy, and only the owner and the administrator have one.
-- Objects are named '<teacher profile id>/<random uuid>.<ext>'; a teacher writes only into their own folder, and a
-- deactivated teacher not at all. Type and size are enforced by the Storage API from the bucket settings; the browser
-- also shrinks the picture before uploading. Deleting an object is done through the Storage API (a direct DELETE from
-- SQL is blocked by Storage itself), so the app removes the file when a photo is replaced or a CV is deleted.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cv-photos', 'cv-photos', true, 2097152, array['image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy cv_photos_read_own on storage.objects for select to authenticated
  using (
    bucket_id = 'cv-photos'
    and ((storage.foldername(name))[1] = (select private.current_teacher_id())::text or (select private.is_admin()))
  );

create policy cv_photos_insert_own on storage.objects for insert to authenticated
  with check (
    bucket_id = 'cv-photos'
    and (storage.foldername(name))[1] = (select private.current_teacher_id())::text
  );

create policy cv_photos_update_own on storage.objects for update to authenticated
  using (bucket_id = 'cv-photos' and (storage.foldername(name))[1] = (select private.current_teacher_id())::text)
  with check (bucket_id = 'cv-photos' and (storage.foldername(name))[1] = (select private.current_teacher_id())::text);

-- the administrator may also delete (clearing up after a teacher who was erased)
create policy cv_photos_delete_own on storage.objects for delete to authenticated
  using (
    bucket_id = 'cv-photos'
    and ((storage.foldername(name))[1] = (select private.current_teacher_id())::text or (select private.is_admin()))
  );
