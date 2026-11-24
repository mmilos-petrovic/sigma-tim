-- The choice no longer waits. A person accepts an offer as soon as it has arrived (see `choose_enrolment_teacher`), so
-- everything that opened the choice later goes: the job, its two settings, the notice "the choice is open", and what the job
-- kept on a request (`choice_opened_at`, `restarts`). `window_started_at` stays: it is the moment a request was listed.

-- The job ------------------------------------------------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('advance-enrolments');
  end if;
exception when others then
  raise notice 'the job advance-enrolments was not scheduled';
end $$;

drop function private.advance_enrolments();

-- The settings: only the switch of the form and the daily cap are left ---------------------------------------------------------------
drop function public.set_enrolment_settings(boolean, integer, integer, integer);
alter table public.enrolment_settings drop column choice_after_days, drop column choice_after_offers;

create function public.set_enrolment_settings(p_form_enabled boolean, p_daily_cap integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_form_enabled is null or p_daily_cap not between 1 and 1000 then
    raise exception 'invalid settings' using errcode = 'PT400';
  end if;
  update public.enrolment_settings
     set form_enabled = p_form_enabled, daily_cap = p_daily_cap, updated_at = now()
   where singleton;
end $$;

revoke all on function public.set_enrolment_settings(boolean, integer) from public, anon;
grant execute on function public.set_enrolment_settings(boolean, integer) to authenticated;

-- What the job kept on a request -------------------------------------------------------------------------------------------------
-- A student who loses a teacher gets the same request back, open and waiting from now.
create or replace function private.ensure_unassigned_request(p_student_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.enrolment_requests (
    applicant_id, applicant_role, source, student_id, subject_id, student_first_name, student_last_name, contact_phone,
    school, grade, profile_completed_at, listed_at, window_started_at)
  select s.profile_id, 'student', 'legacy', s.id, private.last_lesson_subject(s.id), p.first_name, p.last_name, ph.phone,
         nullif(btrim(s.school), ''), nullif(btrim(s.grade), ''),
         case when ph.phone is not null and nullif(btrim(s.school), '') is not null and nullif(btrim(s.grade), '') is not null
              then now() end,
         now(), now()
    from public.students s
    join public.profiles p on p.id = s.profile_id
    left join public.person_phones ph on ph.profile_id = s.profile_id
   where s.id = p_student_id and s.teacher_id is null
  on conflict (student_id) do update
    set status = 'open',
        source = 'legacy',
        subject_id = coalesce(excluded.subject_id, public.enrolment_requests.subject_id),
        listed_at = now(),
        window_started_at = now(),
        chosen_teacher_id = null,
        chosen_by = null,
        chosen_at = null,
        assigned_at = null
$$;

alter table public.enrolment_requests drop column choice_opened_at, drop column restarts;

-- The notice that the choice is open -----------------------------------------------------------------------------------------------
delete from public.notifications where kind = 'enrolment_choice_open';
delete from public.notification_kinds where kind = 'enrolment_choice_open';
