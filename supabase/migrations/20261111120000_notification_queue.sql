-- Phase 6a: every event that has to reach somebody is written to the outbox (`notifications`) by the database itself,
-- and the administrator's settings for sending live here too. The Edge Function that sends (Phase 6c) only reads the outbox.
--
-- Events and who is told (never the person who did it):
--   lesson_scheduled   a confirmed future lesson gets participants           -> those students and their parents
--   slot_claimed       a free slot is booked (`status` says confirmed|pending) -> the teacher
--   booking_confirmed  a booking becomes confirmed (at once or by the teacher) -> the students and their parents
--   lesson_moved       start or location of a booked future lesson changed     -> participants, parents, teacher
--   lesson_reminder    `reminder_minutes` before a confirmed lesson              -> participants, parents, teacher
--   welcome            a new person was added to the system                      -> that person (email, with the sign-in link)
--   welcome_push       the same person's first push subscription                 -> that person
--   test               the administrator's test button                           -> the administrator
-- (lesson_cancelled and participant_left already exist.) Declining a late booking is a lesson_cancelled with reason `declined`.
-- A change of room, end, subject or note is not a "move".

-- Settings --------------------------------------------------------------------------------------------------------------------------
-- One row, edited only through set_notification_settings(). Quiet hours are wall-clock times in the school's time zone; the
-- window may cross midnight (22:00 to 07:00).
create table public.notification_settings (
  singleton boolean primary key default true check (singleton),
  quiet_hours_enabled boolean not null default false,
  quiet_start time not null default '22:00',
  quiet_end time not null default '07:00',
  reminder_enabled boolean not null default true,
  reminder_minutes integer not null default 60 check (reminder_minutes between 5 and 720),
  welcome_text text not null default '' check (char_length(welcome_text) <= 1000),
  school_contact text not null default '' check (char_length(school_contact) <= 500),
  updated_at timestamptz not null default now(),
  constraint notification_quiet_window check (quiet_start <> quiet_end)
);
insert into public.notification_settings default values;
alter table public.notification_settings enable row level security;

-- What each kind of notice is allowed to do. Only `email_fallback` can be changed by the administrator.
--   email_fallback       send an email when the person has no push subscription
--   always_email         send an email whether or not there is a push subscription
--   ignores_quiet_hours  never held back by the quiet hours
create table public.notification_kinds (
  kind text primary key,
  email_fallback boolean not null,
  always_email boolean not null default false,
  ignores_quiet_hours boolean not null default false
);
insert into public.notification_kinds (kind, email_fallback, always_email, ignores_quiet_hours) values
  ('lesson_scheduled',  true,  false, false),
  ('slot_claimed',      true,  false, false),
  ('booking_confirmed', true,  false, false),
  ('lesson_moved',      true,  false, false),
  ('lesson_cancelled',  true,  false, false),
  ('participant_left',  true,  false, false),
  ('lesson_reminder',   false, false, true),
  ('welcome',           true,  true,  true),
  ('welcome_push',      false, false, true),
  ('test',              true,  true,  true);
alter table public.notification_kinds enable row level security;

-- Outbox -----------------------------------------------------------------------------------------------------------------------------
-- `deliver_after` holds a notice back (quiet hours); `channel` records how it went out (push, email) once sent.
alter table public.notifications
  add column deliver_after timestamptz not null default now(),
  add column channel text check (channel in ('push', 'email')),
  add constraint notifications_kind_fk foreign key (kind) references public.notification_kinds (kind);

-- Retries stop here; the notice then shows as failed and the administrator can send it again.
create function private.max_notification_attempts() returns integer
language sql immutable set search_path = '' as $$ select 5 $$;

-- The moment a notice written at `p_at` may go out, or null when it is not quiet then.
create function private.quiet_hours_end(p_at timestamptz) returns timestamptz
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.notification_settings;
  v_local timestamp := p_at at time zone 'Europe/Belgrade';
  v_time time := (p_at at time zone 'Europe/Belgrade')::time;
begin
  select * into s from public.notification_settings;
  if not s.quiet_hours_enabled then
    return null;
  end if;

  if s.quiet_start < s.quiet_end then
    if v_time >= s.quiet_start and v_time < s.quiet_end then
      return (v_local::date + s.quiet_end) at time zone 'Europe/Belgrade';
    end if;
  elsif v_time >= s.quiet_start then
    return ((v_local::date + 1) + s.quiet_end) at time zone 'Europe/Belgrade';
  elsif v_time < s.quiet_end then
    return (v_local::date + s.quiet_end) at time zone 'Europe/Belgrade';
  end if;
  return null;
end $$;

create function private.notifications_set_delivery() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.notification_kinds k where k.kind = new.kind and k.ignores_quiet_hours) then
    new.deliver_after := coalesce(private.quiet_hours_end(new.deliver_after), new.deliver_after);
  end if;
  return new;
end $$;

create trigger notifications_set_delivery
  before insert on public.notifications
  for each row execute function private.notifications_set_delivery();

-- One reminder per person, lesson and start time (a moved lesson gets a new one).
create unique index notifications_one_reminder
  on public.notifications (recipient_id, (payload->>'lesson_id'), (payload->>'start_at'))
  where kind = 'lesson_reminder';

-- When a lesson was last put in its present place --------------------------------------------------------------------------------
-- Set when it is created, when its start changes and when it becomes confirmed. A reminder is only sent for a lesson that
-- was in place at least `reminder_minutes` before it starts: one booked or moved closer than that gets no reminder.
alter table public.lessons add column settled_at timestamptz;
update public.lessons set settled_at = coalesce(confirmed_at, created_at);
alter table public.lessons alter column settled_at set not null, alter column settled_at set default now();

create function private.lessons_touch_settled() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT'
     or new.start_at is distinct from old.start_at
     or (new.status = 'confirmed' and old.status <> 'confirmed') then
    new.settled_at := now();
  end if;
  return new;
end $$;

create trigger lessons_touch_settled
  before insert or update on public.lessons
  for each row execute function private.lessons_touch_settled();

-- Writing notices ---------------------------------------------------------------------------------------------------------------------
-- One notice per person concerned with a lesson, except whoever is acting (null for a scheduled job, so nobody is left out).
-- Each person is told only about their own students: a student about themselves, a parent about their children, the teacher
-- about all (restricted to p_student_ids when given). Returns how many notices were written.
create function private.enqueue_lesson_notice(
  p_kind text, p_lesson_id uuid, p_to_teacher boolean, p_to_participants boolean,
  p_student_ids uuid[] default null, p_extra jsonb default '{}'
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_count integer;
begin
  insert into public.notifications (recipient_id, kind, payload)
  select r.profile_id, p_kind,
         jsonb_build_object(
           'lesson_id', l.id,
           'subject', sub.name,
           'teacher', tp.first_name || ' ' || tp.last_name,
           'location', loc.name,
           'start_at', l.start_at,
           'end_at', l.end_at,
           'status', l.status,
           'students', r.students,
           'actor', private.current_profile_id()
         ) || p_extra
    from public.lessons l
    join public.subjects sub on sub.id = l.subject_id
    join public.locations loc on loc.id = l.location_id
    join public.profiles tp on tp.id = l.teacher_id
   cross join lateral (
     select x.profile_id, jsonb_agg(x.name order by x.name) as students
       from (
         select s.profile_id, sp.first_name || ' ' || sp.last_name as name
           from public.lesson_students ls
           join public.students s on s.id = ls.student_id
           join public.profiles sp on sp.id = s.profile_id
          where ls.lesson_id = l.id and p_to_participants and (p_student_ids is null or ls.student_id = any (p_student_ids))
         union all
         select ps.parent_id, sp.first_name || ' ' || sp.last_name
           from public.lesson_students ls
           join public.students s on s.id = ls.student_id
           join public.profiles sp on sp.id = s.profile_id
           join public.parent_students ps on ps.student_id = ls.student_id
          where ls.lesson_id = l.id and p_to_participants and (p_student_ids is null or ls.student_id = any (p_student_ids))
         union all
         select l.teacher_id, sp.first_name || ' ' || sp.last_name
           from public.lesson_students ls
           join public.students s on s.id = ls.student_id
           join public.profiles sp on sp.id = s.profile_id
          where ls.lesson_id = l.id and p_to_teacher and (p_student_ids is null or ls.student_id = any (p_student_ids))
       ) x
      group by x.profile_id
   ) r
   where l.id = p_lesson_id
     and r.profile_id is distinct from private.current_profile_id()
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- A confirmed future lesson gets participants: when the teacher schedules it, and when they add somebody later. Participants
-- of a slot that is being booked are added while it is still `open`, so a booking never lands here.
create function private.notify_students_added() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_lesson record;
begin
  for v_lesson in
    select a.lesson_id, array_agg(a.student_id) as student_ids
      from added a join public.lessons l on l.id = a.lesson_id
     where l.status = 'confirmed' and l.start_at > now()
     group by a.lesson_id
  loop
    perform private.enqueue_lesson_notice('lesson_scheduled', v_lesson.lesson_id, false, true, v_lesson.student_ids);
  end loop;
  return null;
end $$;

create trigger lesson_students_notify
  after insert on public.lesson_students
  referencing new table as added
  for each statement execute function private.notify_students_added();

-- A slot is booked (the teacher hears of it, pending or not), and a booking becomes confirmed (the others hear of it).
-- Confirming after the start is how an outcome is recorded for a booking nobody answered; nobody needs telling.
create function private.notify_booking() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.start_at <= now() then
    return null;
  end if;
  if old.status = 'open' then
    perform private.enqueue_lesson_notice('slot_claimed', new.id, true, false);
  end if;
  if new.status = 'confirmed' then
    perform private.enqueue_lesson_notice('booking_confirmed', new.id, false, true);
  end if;
  return null;
end $$;

create trigger lessons_notify_booking
  after update of status on public.lessons
  for each row
  when (old.status = 'open' and new.status in ('pending', 'confirmed') or old.status = 'pending' and new.status = 'confirmed')
  execute function private.notify_booking();

-- Moved: start or location. A free slot has nobody to tell, and a lesson that has started cannot be moved.
create function private.notify_moved() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.start_at <= now() or new.status = 'open' then
    return null;
  end if;
  perform private.enqueue_lesson_notice(
    'lesson_moved', new.id, true, true, null,
    jsonb_build_object(
      'old_start_at', old.start_at,
      'old_end_at', old.end_at,
      'old_location', (select name from public.locations where id = old.location_id)
    )
  );
  return null;
end $$;

create trigger lessons_notify_moved
  after update of start_at, location_id on public.lessons
  for each row
  when (old.start_at is distinct from new.start_at or old.location_id is distinct from new.location_id)
  execute function private.notify_moved();

-- Welcome: whoever is new to the system. An existing profile (a student who gets a second teacher, a parent of two children)
-- is not welcomed again.
create or replace function private.upsert_profile(p_email text, p_first_name text, p_last_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email' using errcode = 'PT400';
  end if;
  if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = '' then
    raise exception 'first and last name are required' using errcode = 'PT400';
  end if;

  insert into public.profiles (email, first_name, last_name)
  values (v_email, btrim(p_first_name), btrim(p_last_name))
  on conflict (email) do nothing
  returning id into v_id;

  if v_id is not null then
    insert into public.notifications (recipient_id, kind, payload)
    values (v_id, 'welcome', jsonb_build_object('first_name', btrim(p_first_name)));
    return v_id;
  end if;

  select id into v_id from public.profiles where email = v_email;
  return v_id;
end $$;

-- The first device of somebody who was welcomed gets the welcome push (the person could not be reached before they signed in).
create function private.notify_first_subscription() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.notifications where recipient_id = new.profile_id and kind = 'welcome')
     and not exists (select 1 from public.notifications where recipient_id = new.profile_id and kind = 'welcome_push') then
    insert into public.notifications (recipient_id, kind) values (new.profile_id, 'welcome_push');
  end if;
  return null;
end $$;

create trigger push_subscriptions_notify
  after insert on public.push_subscriptions
  for each row execute function private.notify_first_subscription();

-- Reminders ---------------------------------------------------------------------------------------------------------------------------
-- Run every minute: a confirmed lesson that starts within `reminder_minutes` and was in place at least that long before
-- gets one reminder per person. Running late (or missing a minute) sends the reminder late rather than never.
create function private.enqueue_due_reminders() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.notification_settings;
  v_lead interval;
  v_lesson record;
  v_count integer := 0;
begin
  select * into s from public.notification_settings;
  if not s.reminder_enabled then
    return 0;
  end if;
  v_lead := s.reminder_minutes * interval '1 minute';

  for v_lesson in
    select l.id
      from public.lessons l
     where l.status = 'confirmed' and l.outcome is null
       and l.start_at > now() and l.start_at <= now() + v_lead
       and l.settled_at <= l.start_at - v_lead
       and exists (select 1 from public.lesson_students ls where ls.lesson_id = l.id)
  loop
    v_count := v_count + private.enqueue_lesson_notice('lesson_reminder', v_lesson.id, true, true);
  end loop;
  return v_count;
end $$;

revoke all on function private.enqueue_due_reminders() from public, anon, authenticated;

-- pg_cron is a Supabase extension; a database without it (a plain Postgres) keeps working, just without reminders.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('enqueue-lesson-reminders', '* * * * *', 'select private.enqueue_due_reminders()');
  else
    raise notice 'pg_cron is not available: lesson reminders will not be queued';
  end if;
end $$;

-- Administrator: settings, log, resend, test -----------------------------------------------------------------------------------------
create function public.get_notification_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  s public.notification_settings;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  select * into s from public.notification_settings;
  return jsonb_build_object(
    'quiet_hours_enabled', s.quiet_hours_enabled,
    'quiet_start', to_char(s.quiet_start, 'HH24:MI'),
    'quiet_end', to_char(s.quiet_end, 'HH24:MI'),
    'reminder_enabled', s.reminder_enabled,
    'reminder_minutes', s.reminder_minutes,
    'welcome_text', s.welcome_text,
    'school_contact', s.school_contact,
    'kinds', (
      select jsonb_agg(jsonb_build_object(
               'kind', k.kind, 'email_fallback', k.email_fallback,
               'always_email', k.always_email, 'ignores_quiet_hours', k.ignores_quiet_hours
             ) order by k.kind)
        from public.notification_kinds k
    )
  );
end $$;

create function public.set_notification_settings(
  p_quiet_hours_enabled boolean, p_quiet_start time, p_quiet_end time,
  p_reminder_enabled boolean, p_reminder_minutes integer,
  p_welcome_text text, p_school_contact text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_quiet_hours_enabled is null or p_reminder_enabled is null
     or p_quiet_start is null or p_quiet_end is null or p_reminder_minutes is null then
    raise exception 'all settings are required' using errcode = 'PT400';
  end if;
  if p_quiet_start = p_quiet_end then
    raise exception 'the quiet hours cannot start and end at the same time' using errcode = 'PT400';
  end if;
  if p_reminder_minutes not between 5 and 720 then
    raise exception 'the reminder time must be between 5 and 720 minutes' using errcode = 'PT400';
  end if;
  if char_length(coalesce(p_welcome_text, '')) > 1000 or char_length(coalesce(p_school_contact, '')) > 500 then
    raise exception 'the text is too long' using errcode = 'PT400';
  end if;

  update public.notification_settings
     set quiet_hours_enabled = p_quiet_hours_enabled, quiet_start = p_quiet_start, quiet_end = p_quiet_end,
         reminder_enabled = p_reminder_enabled, reminder_minutes = p_reminder_minutes,
         welcome_text = btrim(coalesce(p_welcome_text, '')), school_contact = btrim(coalesce(p_school_contact, '')),
         updated_at = now();
end $$;

create function public.set_email_fallback(p_kind text, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_kind public.notification_kinds;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_enabled is null then
    raise exception 'choose on or off' using errcode = 'PT400';
  end if;

  select * into v_kind from public.notification_kinds where kind = p_kind;
  if not found then
    raise exception 'unknown kind of notice' using errcode = 'PT404';
  end if;
  if v_kind.always_email then
    raise exception 'this notice is always sent by email' using errcode = 'PT409';
  end if;

  update public.notification_kinds set email_fallback = p_enabled where kind = p_kind;
end $$;

-- The log: newest first, 50 by default. p_state is sent | waiting | queued | retrying | failed (null for all); p_before is the
-- id of the last row of the previous page. Shows who and when, never what the notice said.
create function public.admin_list_notifications(p_limit integer default 50, p_before bigint default null, p_state text default null)
returns table (
  id bigint, kind text, recipient_name text, recipient_email text, created_at timestamptz, deliver_after timestamptz,
  sent_at timestamptz, channel text, attempts integer, last_error text, state text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  return query
  select * from (
    select n.id, n.kind, p.first_name || ' ' || p.last_name, p.email, n.created_at, n.deliver_after,
           n.sent_at, n.channel, n.attempts, n.last_error,
           case when n.sent_at is not null then 'sent'
                when n.attempts >= private.max_notification_attempts() then 'failed'
                when n.deliver_after > now() then 'waiting'
                when n.attempts > 0 then 'retrying'
                else 'queued' end as state
      from public.notifications n
      join public.profiles p on p.id = n.recipient_id
     where p_before is null or n.id < p_before
  ) x
  where p_state is null or x.state = p_state
  order by x.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- Sends a failed notice again (a new round of attempts, at once).
create function public.admin_resend_notification(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  update public.notifications
     set attempts = 0, last_error = null, deliver_after = now()
   where id = p_id and sent_at is null and attempts >= private.max_notification_attempts();
  if not found then
    if exists (select 1 from public.notifications where id = p_id) then
      raise exception 'only a failed notice can be sent again' using errcode = 'PT409';
    end if;
    raise exception 'notice not found' using errcode = 'PT404';
  end if;
end $$;

-- A notice to the administrator themselves, to try push and email.
create function public.admin_send_test_notification() returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  v_id bigint;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  insert into public.notifications (recipient_id, kind)
  values (private.current_profile_id(), 'test')
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.get_notification_settings() from public, anon;
revoke all on function public.set_notification_settings(boolean, time, time, boolean, integer, text, text) from public, anon;
revoke all on function public.set_email_fallback(text, boolean) from public, anon;
revoke all on function public.admin_list_notifications(integer, bigint, text) from public, anon;
revoke all on function public.admin_resend_notification(bigint) from public, anon;
revoke all on function public.admin_send_test_notification() from public, anon;
grant execute on function public.get_notification_settings() to authenticated;
grant execute on function public.set_notification_settings(boolean, time, time, boolean, integer, text, text) to authenticated;
grant execute on function public.set_email_fallback(text, boolean) to authenticated;
grant execute on function public.admin_list_notifications(integer, bigint, text) to authenticated;
grant execute on function public.admin_resend_notification(bigint) to authenticated;
grant execute on function public.admin_send_test_notification() to authenticated;
