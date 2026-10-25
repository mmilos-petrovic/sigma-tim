-- First administrator, who is also a teacher. Run once per hosted environment by the "Bootstrap admin" workflow.
-- (seed.sql does the same for local development, but it is never applied to staging or production.)
--
-- Safe to run any number of times:
--   * nothing is deleted, and nothing that exists is renamed or overwritten;
--   * the starting subjects are only created while the school has no subjects at all, so a later rename or delete
--     in the admin screens is not undone;
--   * the profile is created without an account. The first Google sign-in with this email links it
--     (see 20261026100000_link_account_on_update.sql), and so does running this script after that sign-in.
--
-- Run first-admin.check.sql before and after to see the state.

do $$
declare
  c_email constant text := 'petrovicmilos@gmail.com';
  v_profile uuid;
begin
  if not exists (select 1 from public.subjects) then
    insert into public.subjects (name) values ('Matematika'), ('Fizika'), ('Hemija'), ('Srpski jezik');
  end if;

  insert into public.profiles (email, first_name, last_name, is_admin)
  values (c_email, 'Miloš', 'Petrović', true)
  on conflict (email) do update set is_admin = true
  returning id into v_profile;

  insert into public.teachers (profile_id) values (v_profile)
  on conflict (profile_id) do nothing;

  insert into public.teacher_subjects (teacher_id, subject_id)
  select v_profile, s.id
    from public.subjects s
   where s.name in ('Matematika', 'Fizika', 'Hemija', 'Srpski jezik')
  on conflict do nothing;
end $$;
