-- Read-only: the state of the first administrator. Always returns exactly one row.
--
--   profile_exists / is_admin / is_teacher / teacher_active   what first-admin.sql sets up
--   subjects_assigned / subjects_total                        the teacher needs at least one
--   google_accounts                                           confirmed Google sign-ins with this email
--   linked                                                    true once the profile is tied to that account;
--                                                             false with google_accounts = 1 means linking failed

select
  coalesce(p.id is not null, false) as profile_exists,
  coalesce(p.is_admin, false) as is_admin,
  t.profile_id is not null as is_teacher,
  coalesce(t.is_active, false) as teacher_active,
  (select count(*) from public.teacher_subjects ts where ts.teacher_id = p.id) as subjects_assigned,
  (select count(*) from public.subjects) as subjects_total,
  (select count(*) from auth.users u
    where lower(u.email) = v.email and u.email_confirmed_at is not null
      and u.raw_app_meta_data ->> 'provider' = 'google') as google_accounts,
  coalesce(p.user_id is not null, false) as linked
from (values ('petrovicmilos@gmail.com')) as v (email)
left join public.profiles p on p.email = v.email
left join public.teachers t on t.profile_id = p.id;
