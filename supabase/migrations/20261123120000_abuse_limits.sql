-- Phase 8c: limits that keep one account, a script or a mistake from filling the school's data or its email allowance.
-- Every limit is in the database, so it holds however the request arrives. The numbers were chosen by the owner:
--
--   a teacher adds at most 30 students in 24 hours               (an administrator is not limited)
--   at most 100 lessons are created for a teacher in an hour
--   a person has at most 10 devices for notifications            (a new one pushes the oldest out)
--   at most 20 welcome emails go out in an hour                  (the rest wait in the queue)
--   a sign-up that never filled in its profile is deleted after 14 days, with the profile made for it
--   20 sign-ups a day go straight to the teachers                (it was 10; later ones wait for the administrator)
--
-- A limit that is reached answers with the error code PT429 ("too many requests", which PostgREST also gives as HTTP 429).

-- Counting what a person did -------------------------------------------------------------------------------------------------------
-- A small log for the things that have no table of their own to count in. Cleared out by purge_old_records() after two days.
create table private.rate_events (
  id bigint generated always as identity primary key,
  kind text not null,
  actor uuid not null,
  at timestamptz not null default now()
);
create index rate_events_kind_actor_at_idx on private.rate_events (kind, actor, at);
revoke all on private.rate_events from public, anon, authenticated;

-- Takes one place of `p_max` in the window, or refuses. Two requests of the same person at the same moment are taken one
-- after the other, so the last place cannot be taken twice. An error undoes the whole request, the place taken included.
create function private.take_rate_slot(p_kind text, p_actor uuid, p_max integer, p_window interval) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('rate:' || p_kind || ':' || p_actor::text));
  if (select count(*) from private.rate_events e where e.kind = p_kind and e.actor = p_actor and e.at > now() - p_window) >= p_max then
    raise exception 'too many requests, try again later' using errcode = 'PT429';
  end if;
  insert into private.rate_events (kind, actor) values (p_kind, p_actor);
end $$;

revoke all on function private.take_rate_slot(text, uuid, integer, interval) from public, anon, authenticated;

-- Students --------------------------------------------------------------------------------------------------------------------------
-- The same two functions as before, with one place to take before the person is made (that is where the welcome email starts).
create or replace function public.add_student(
  p_email text, p_first_name text, p_last_name text,
  p_school text default null, p_grade text default null, p_class_section text default null,
  p_teacher_id uuid default null, p_phone text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_admin boolean := private.is_admin();
  v_teacher uuid;
  v_profile uuid;
  v_student uuid;
  v_phone text;
begin
  if v_me is null and not v_admin then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  if p_teacher_id is not null then
    if not v_admin and p_teacher_id is distinct from v_me then
      raise exception 'not allowed' using errcode = 'PT403';
    end if;
    if not exists (select 1 from public.teachers where profile_id = p_teacher_id and is_active) then
      raise exception 'unknown teacher' using errcode = 'PT400';
    end if;
    v_teacher := p_teacher_id;
  else
    v_teacher := v_me;
  end if;

  -- a student's number is optional: none, or an empty one, means none; one that is given has to be a number
  if btrim(coalesce(p_phone, '')) <> '' then
    v_phone := private.normalize_phone(p_phone);
    if v_phone is null then
      raise exception 'invalid phone number' using errcode = 'PT400';
    end if;
  end if;

  if not v_admin then
    perform private.take_rate_slot('student_add', v_me, 30, interval '24 hours');
  end if;

  v_profile := private.upsert_profile(p_email, p_first_name, p_last_name);

  if exists (select 1 from public.students where profile_id = v_profile and teacher_id is not distinct from v_teacher) then
    raise exception 'this person is already a student of this teacher' using errcode = 'PT409';
  end if;

  insert into public.students (profile_id, school, grade, class_section, teacher_id)
  values (v_profile, nullif(btrim(p_school), ''), nullif(btrim(p_grade), ''), nullif(btrim(p_class_section), ''), v_teacher)
  returning id into v_student;

  if v_phone is not null then
    perform private.keep_phone(v_profile, v_phone);
  end if;

  return v_student;
end $$;

create or replace function public.add_unassigned_student(
  p_email text, p_first_name text, p_last_name text, p_phone text, p_subject_id uuid, p_school text, p_grade text,
  p_city_part text default null, p_situation text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_phone text;
  v_profile uuid;
  v_student uuid;
  v_request uuid;
begin
  if not (private.is_admin() or private.is_teacher()) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_subject_id is null or not exists (
       select 1 from public.teacher_subjects ts join public.teachers t on t.profile_id = ts.teacher_id and t.is_active
        where ts.subject_id = p_subject_id) then
    raise exception 'nobody teaches this subject' using errcode = 'PT400';
  end if;
  v_phone := private.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'a valid phone number is required' using errcode = 'PT400';
  end if;
  if btrim(coalesce(p_school, '')) = '' or btrim(coalesce(p_grade, '')) = '' then
    raise exception 'school and grade are required' using errcode = 'PT400';
  end if;
  if char_length(coalesce(p_city_part, '')) > 100 or char_length(coalesce(p_situation, '')) > 1000 then
    raise exception 'the text is too long' using errcode = 'PT400';
  end if;

  if not private.is_admin() then
    perform private.take_rate_slot('student_add', private.current_profile_id(), 30, interval '24 hours');
  end if;

  v_profile := private.upsert_profile(p_email, p_first_name, p_last_name);
  if exists (select 1 from public.students where profile_id = v_profile and teacher_id is null) then
    raise exception 'this person is already waiting for a teacher' using errcode = 'PT409';
  end if;

  insert into public.students (profile_id, school, grade, teacher_id)
  values (v_profile, btrim(p_school), btrim(p_grade), null)
  returning id into v_student;
  perform private.keep_phone(v_profile, v_phone);

  update public.enrolment_requests r
     set source = 'teacher', added_by = private.current_profile_id(), subject_id = p_subject_id,
         student_first_name = p.first_name, student_last_name = p.last_name, contact_phone = v_phone,
         school = btrim(p_school), grade = btrim(p_grade),
         city_part = nullif(btrim(coalesce(p_city_part, '')), ''), situation = nullif(btrim(coalesce(p_situation, '')), ''),
         profile_completed_at = now(), listed_at = now(), window_started_at = now()
    from public.profiles p
   where r.student_id = v_student and p.id = v_profile
   returning r.id into v_request;
  return v_request;
end $$;

-- Lessons ---------------------------------------------------------------------------------------------------------------------------
-- However a lesson is made (the function, or a free slot written straight into the table), a teacher cannot have more than
-- 100 made in an hour. Nobody schedules that many by hand; a script that went wrong does.
create function private.limit_lesson_creation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtext('lessons:' || new.teacher_id::text));
  if (select count(*) from public.lessons l where l.teacher_id = new.teacher_id and l.created_at > now() - interval '1 hour') >= 100 then
    raise exception 'too many lessons created in an hour, try again later' using errcode = 'PT429';
  end if;
  return new;
end $$;

revoke all on function private.limit_lesson_creation() from public, anon, authenticated;

create trigger lessons_limit_creation
  before insert on public.lessons
  for each row execute function private.limit_lesson_creation();

-- Devices for notifications ---------------------------------------------------------------------------------------------------------
-- A person keeps their 10 newest devices (the one just added is always among them).
create function private.limit_push_subscriptions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.push_subscriptions ps
   where ps.profile_id = new.profile_id
     and ps.id not in (
       select k.id from public.push_subscriptions k
        where k.profile_id = new.profile_id
        order by (k.id = new.id) desc, k.created_at desc, k.id desc
        limit 10
     );
  return null;
end $$;

revoke all on function private.limit_push_subscriptions() from public, anon, authenticated;

create trigger push_subscriptions_limit
  after insert on public.push_subscriptions
  for each row execute function private.limit_push_subscriptions();

-- Sign-ups --------------------------------------------------------------------------------------------------------------------------
alter table public.enrolment_settings alter column daily_cap set default 20;
-- the owner's old default of 10 becomes 20; a number the administrator chose is left alone
update public.enrolment_settings set daily_cap = 20 where daily_cap = 10;

-- A sign-up that never filled in its profile is deleted after 14 days. So is the profile that was made for it, unless it
-- belongs to somebody (a student, a parent, a teacher, an administrator, another request). Returns how many sign-ups went.
create function private.clear_stale_signups() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_request record;
  v_removed integer := 0;
begin
  for v_request in
    select r.id, r.applicant_id from public.enrolment_requests r
     where r.source = 'signup' and r.status = 'open' and r.profile_completed_at is null
       and r.created_at < now() - interval '14 days'
  loop
    delete from public.enrolment_requests where id = v_request.id;
    v_removed := v_removed + 1;
    begin
      delete from public.profiles p
       where p.id = v_request.applicant_id
         and not p.is_admin and p.erased_at is null
         and not exists (select 1 from public.students s where s.profile_id = p.id)
         and not exists (select 1 from public.parents pa where pa.profile_id = p.id)
         and not exists (select 1 from public.teachers t where t.profile_id = p.id)
         and not exists (select 1 from public.enrolment_requests r2 where r2.applicant_id = p.id);
    exception when foreign_key_violation then
      null; -- something else still points at this profile: it stays
    end;
  end loop;
  return v_removed;
end $$;

revoke all on function private.clear_stale_signups() from public, anon, authenticated;

-- The nightly clearing out also forgets the counts of what people did two days ago. Same function as before otherwise.
create or replace function private.purge_old_records() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_deleted integer;
begin
  delete from public.notifications n
   where n.created_at < now() - interval '1 year'
     and (n.sent_at is not null or n.attempts >= private.max_notification_attempts());
  get diagnostics v_deleted = row_count;

  delete from private.rate_events e where e.at < now() - interval '2 days';

  -- pg_cron keeps a row for every run of every job (several thousand a day) and never deletes any
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval ''7 days''';
  end if;
  return v_deleted;
end $$;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('clear-stale-signups', '30 3 * * *', 'select private.clear_stale_signups()');
  else
    raise notice 'pg_cron is not available: unfinished sign-ups will stay';
  end if;
end $$;

-- Welcome emails --------------------------------------------------------------------------------------------------------------------
-- At most 20 welcome emails an hour, whoever adds the people: a teacher who adds a whole class does not use up the school's
-- email allowance in a minute. The ones over the limit stay in the queue and go as the hour allows. What counts is what went
-- out in the last hour and what is being sent now (taken, not yet written down). While welcome emails are due, claims are taken
-- one at a time, so two runs cannot both see the last free place; claims of everything else still never wait for each other
-- (skip locked). Otherwise the same function as in Phase 6c.
create or replace function public.claim_notifications(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.notification_settings;
  v_notices jsonb;
  v_midnight timestamptz := date_trunc('day', now() at time zone 'Europe/Belgrade') at time zone 'Europe/Belgrade';
  v_tomorrow timestamptz := (date_trunc('day', now() at time zone 'Europe/Belgrade') + interval '1 day') at time zone 'Europe/Belgrade';
  v_welcome_places integer;
begin
  select * into s from public.notification_settings;

  if exists (
    select 1 from public.notifications w
     where w.kind = 'welcome' and w.sent_at is null
       and w.attempts < private.max_notification_attempts() and w.deliver_after <= now()
  ) then
    perform pg_advisory_xact_lock(hashtext('welcome-budget'));
  end if;

  select greatest(20 - count(*), 0)::integer into v_welcome_places
    from public.notifications w
   where w.kind = 'welcome'
     and (w.sent_at > now() - interval '1 hour'
          or (w.sent_at is null and w.attempts > 0 and w.deliver_after > now()));

  with due as (
    select n.id
      from public.notifications n
     where n.sent_at is null
       and n.attempts < private.max_notification_attempts()
       and n.deliver_after <= now()
       and (n.kind <> 'welcome' or n.id in (
             select w.id from public.notifications w
              where w.kind = 'welcome' and w.sent_at is null
                and w.attempts < private.max_notification_attempts() and w.deliver_after <= now()
              order by w.deliver_after, w.id
              limit v_welcome_places))
     order by n.deliver_after, n.id
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
       for update skip locked
  ), claimed as (
    update public.notifications n
       set attempts = n.attempts + 1,
           deliver_after = now() + private.notification_retry_delay(n.attempts + 1)
      from due
     where n.id = due.id
    returning n.id, n.recipient_id, n.kind, n.payload, n.attempts
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'kind', c.kind,
             'payload', c.payload,
             'attempt', c.attempts,
             'final_attempt', c.attempts >= private.max_notification_attempts(),
             'recipient', jsonb_build_object(
               'id', p.id,
               'email', p.email,
               'first_name', p.first_name,
               'is_admin', p.is_admin,
               'is_teacher', exists (select 1 from public.teachers t where t.profile_id = p.id and t.is_active),
               'is_student', exists (select 1 from public.students st where st.profile_id = p.id),
               'is_parent', exists (select 1 from public.parents pa where pa.profile_id = p.id),
               -- the lesson may be gone (a cancelled one): then this is false and the notice goes to the person's other role
               'teaches_lesson', exists (
                 select 1 from public.lessons l where l.id::text = c.payload ->> 'lesson_id' and l.teacher_id = p.id
               )
             ),
             'config', jsonb_build_object('email_fallback', k.email_fallback, 'always_email', k.always_email),
             'subscriptions', coalesce((
               select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)
                                order by ps.created_at)
                 from public.push_subscriptions ps
                where ps.profile_id = p.id
             ), '[]')
           ) order by c.id), '[]')
    into v_notices
    from claimed c
    join public.profiles p on p.id = c.recipient_id
    join public.notification_kinds k on k.kind = c.kind;

  return jsonb_build_object(
    'settings', jsonb_build_object('welcome_text', s.welcome_text, 'school_contact', s.school_contact),
    'emails_today', (
      select count(*) from public.notifications n where n.channel = 'email' and n.sent_at >= v_midnight
    ),
    'emails_resume_at', coalesce(private.quiet_hours_end(v_tomorrow), v_tomorrow),
    'notices', v_notices
  );
end $$;
