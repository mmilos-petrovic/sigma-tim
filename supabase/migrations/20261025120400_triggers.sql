-- Triggers: account linking, data rules that a CHECK cannot express, and the notification snapshot on cancellation.
--
-- Error codes follow PostgREST's `PTxxx` convention, so a client sees an HTTP status it can act on:
--   PT400 invalid request   PT403 not allowed   PT404 not found   PT409 conflict

-- Emails -----------------------------------------------------------------------------------------------------------

create function private.normalize_profile_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.email := lower(btrim(new.email));
  return new;
end $$;

create trigger profiles_normalize_email
  before insert or update of email on public.profiles
  for each row execute function private.normalize_profile_email();

-- Linking a Google account to the profile a teacher or admin created in advance ----------------------------------------
-- Only a confirmed Google sign-in may claim a profile, so nobody can take over an approved email by registering a
-- password account with it. Both orders must work: sign in first and get added later, or the other way round.

create function private.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null and coalesce(new.raw_app_meta_data ->> 'provider', '') = 'google' then
    update public.profiles
       set user_id = new.id,
           avatar_url = coalesce(avatar_url, new.raw_user_meta_data ->> 'avatar_url')
     where email = lower(btrim(new.email)) and user_id is null;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create function private.link_new_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
     set user_id = u.id,
         avatar_url = coalesce(p.avatar_url, u.raw_user_meta_data ->> 'avatar_url')
    from auth.users u
   where p.id = new.id and p.user_id is null
     and lower(btrim(u.email)) = new.email
     and u.email_confirmed_at is not null
     and coalesce(u.raw_app_meta_data ->> 'provider', '') = 'google';
  return null;
end $$;

create trigger profiles_link_existing_account
  after insert on public.profiles
  for each row execute function private.link_new_profile();

-- Teachers keep at least one subject -------------------------------------------------------------------------------------

create function private.keep_teacher_subject() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1
      from removed r join public.teachers t on t.profile_id = r.teacher_id
     where t.is_active
       and not exists (select 1 from public.teacher_subjects ts where ts.teacher_id = r.teacher_id)
  ) then
    raise exception 'a teacher needs at least one subject' using errcode = 'PT409';
  end if;
  return null;
end $$;

create trigger teacher_subjects_keep_one
  after delete on public.teacher_subjects
  referencing old table as removed
  for each statement execute function private.keep_teacher_subject();

-- A student has one or two parents -----------------------------------------------------------------------------------------

create function private.limit_parents() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- serialise concurrent additions for the same student
  perform 1 from public.students where id = new.student_id for update;
  if (select count(*) from public.parent_students where student_id = new.student_id) >= 2 then
    raise exception 'a student has at most two parents' using errcode = 'PT409';
  end if;
  return new;
end $$;

create trigger parent_students_limit
  before insert on public.parent_students
  for each row execute function private.limit_parents();

-- Lessons -------------------------------------------------------------------------------------------------------------------

create function private.lessons_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.teacher_id is distinct from old.teacher_id or new.subject_id is distinct from old.subject_id then
    if not exists (
      select 1 from public.teacher_subjects ts
       where ts.teacher_id = new.teacher_id and ts.subject_id = new.subject_id
    ) then
      raise exception 'the teacher does not teach this subject' using errcode = 'PT400';
    end if;
  end if;

  if new.status = 'confirmed' then
    if tg_op = 'INSERT' or old.status <> 'confirmed' then
      new.confirmed_at := now();
    end if;
  else
    new.confirmed_at := null;
  end if;

  if tg_op = 'UPDATE' and new.outcome is not null and new.outcome is distinct from old.outcome then
    if new.status <> 'confirmed' or new.end_at > now() then
      raise exception 'an outcome can only be recorded once a confirmed lesson has ended' using errcode = 'PT400';
    end if;
  end if;

  return new;
end $$;

create trigger lessons_validate
  before insert or update on public.lessons
  for each row execute function private.lessons_validate();

-- Participants belong to the lesson's teacher and there are at most `max_lesson_students()` of them.
create function private.lesson_students_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_teacher uuid;
begin
  -- the lock serialises concurrent additions to the same lesson
  select teacher_id into v_teacher from public.lessons where id = new.lesson_id for update;

  if not exists (select 1 from public.students s where s.id = new.student_id and s.teacher_id = v_teacher) then
    raise exception 'a student can only attend lessons of their own teacher' using errcode = 'PT400';
  end if;

  if (select count(*) from public.lesson_students where lesson_id = new.lesson_id) > public.max_lesson_students() then
    raise exception 'too many students in one lesson' using errcode = 'PT400';
  end if;

  return null;
end $$;

create trigger lesson_students_validate
  after insert on public.lesson_students
  for each row execute function private.lesson_students_validate();

-- Invariant, checked at commit so a lesson and its participants can be written in either order:
-- a free slot has nobody in it; a future pending or confirmed lesson has somebody. Past lessons are history and may
-- lose participants (for example when a student's data is erased on request).
create function private.check_lesson_participants() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_lesson_id uuid;
  v_lesson public.lessons;
  v_count integer;
begin
  if tg_table_name = 'lessons' then
    v_lesson_id := new.id;
  elsif tg_op = 'DELETE' then
    v_lesson_id := old.lesson_id;
  else
    v_lesson_id := new.lesson_id;
  end if;

  select * into v_lesson from public.lessons where id = v_lesson_id;
  if not found then
    return null;
  end if;

  select count(*) into v_count from public.lesson_students where lesson_id = v_lesson_id;

  if v_lesson.status = 'open' and v_count > 0 then
    raise exception 'a free slot cannot have participants' using errcode = '23514';
  end if;
  if v_lesson.status <> 'open' and v_count = 0 and v_lesson.start_at > now() then
    raise exception 'a booked lesson needs at least one participant' using errcode = '23514';
  end if;

  return null;
end $$;

create constraint trigger lessons_participants_check
  after insert or update of status on public.lessons
  deferrable initially deferred
  for each row execute function private.check_lesson_participants();

create constraint trigger lesson_students_participants_check
  after insert or delete on public.lesson_students
  deferrable initially deferred
  for each row execute function private.check_lesson_participants();

-- Notification snapshot ------------------------------------------------------------------------------------------------------
-- Queues one notice per person concerned with a booked lesson that is being cancelled: the participants, their parents
-- and the teacher, except the person who did it. Written before the lesson (and its participants) disappear.
-- Reasons: cancelled, declined (teacher turned down a late booking), teacher_deactivated (the teacher is not told).
create function private.enqueue_cancellation(p_lesson_id uuid, p_reason text) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (recipient_id, kind, payload)
  select r.profile_id, 'lesson_cancelled',
         jsonb_build_object(
           'lesson_id', l.id,
           'subject', sub.name,
           'teacher', tp.first_name || ' ' || tp.last_name,
           'location', loc.name,
           'start_at', l.start_at,
           'end_at', l.end_at,
           'reason', p_reason,
           'cancelled_by', private.current_profile_id()
         )
    from public.lessons l
    join public.subjects sub on sub.id = l.subject_id
    join public.locations loc on loc.id = l.location_id
    join public.profiles tp on tp.id = l.teacher_id
   cross join lateral (
     select s.profile_id
       from public.lesson_students ls join public.students s on s.id = ls.student_id
      where ls.lesson_id = l.id
     union
     select ps.parent_id
       from public.lesson_students ls join public.parent_students ps on ps.student_id = ls.student_id
      where ls.lesson_id = l.id
     union
     select l.teacher_id where p_reason <> 'teacher_deactivated'
   ) r (profile_id)
   where l.id = p_lesson_id
     and exists (select 1 from public.lesson_students where lesson_id = l.id)
     and r.profile_id is distinct from private.current_profile_id()
$$;

-- A participant (or their parent) leaves a lesson that goes on for the others. Tells the teacher and the leaving
-- students' parents, never the remaining participants, and names only the students who left.
create function private.enqueue_participant_left(p_lesson_id uuid, p_student_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (recipient_id, kind, payload)
  select r.profile_id, 'participant_left',
         jsonb_build_object(
           'lesson_id', l.id,
           'subject', sub.name,
           'teacher', tp.first_name || ' ' || tp.last_name,
           'location', loc.name,
           'start_at', l.start_at,
           'end_at', l.end_at,
           'students', (
             select jsonb_agg(sp.first_name || ' ' || sp.last_name order by sp.last_name, sp.first_name)
               from public.students s join public.profiles sp on sp.id = s.profile_id
              where s.id = any (p_student_ids)
           ),
           'cancelled_by', private.current_profile_id()
         )
    from public.lessons l
    join public.subjects sub on sub.id = l.subject_id
    join public.locations loc on loc.id = l.location_id
    join public.profiles tp on tp.id = l.teacher_id
   cross join lateral (
     select s.profile_id from public.students s where s.id = any (p_student_ids)
     union
     select ps.parent_id from public.parent_students ps where ps.student_id = any (p_student_ids)
     union
     select l.teacher_id
   ) r (profile_id)
   where l.id = p_lesson_id
     and r.profile_id is distinct from private.current_profile_id()
$$;

-- Past lessons are the record of what happened: they cannot be deleted. Future ones leave a notice behind.
create function private.lessons_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.start_at <= now() then
    raise exception 'lesson already started' using errcode = 'PT409';
  end if;
  perform private.enqueue_cancellation(old.id, coalesce(nullif(current_setting('app.cancel_reason', true), ''), 'cancelled'));
  return old;
end $$;

create trigger lessons_before_delete
  before delete on public.lessons
  for each row execute function private.lessons_before_delete();

-- CV -----------------------------------------------------------------------------------------------------------------------------

-- "Đorđe Šćepanović" -> djordje-scepanovic, then -2, -3 ... for namesakes. Fixed once, because it is a public link.
create function private.cv_set_slug() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;

  select first_name || ' ' || last_name into v_name from public.profiles where id = new.teacher_id;
  v_base := lower(translate(replace(replace(v_name, 'Đ', 'Dj'), 'đ', 'dj'), 'ŠšČčĆćŽž', 'SsCcCcZz'));
  v_base := btrim(regexp_replace(v_base, '[^a-z0-9]+', '-', 'g'), '-');
  if v_base = '' then
    v_base := 'nastavnik';
  end if;

  v_slug := v_base;
  while exists (select 1 from public.teacher_cv where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  new.slug := v_slug;
  return new;
end $$;

create trigger teacher_cv_set_slug
  before insert on public.teacher_cv
  for each row execute function private.cv_set_slug();

create function private.touch_cv() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'teacher_cv' then
    new.updated_at := now();
    return new;
  end if;
  -- a child row changed: the CV as a whole changed
  update public.teacher_cv set updated_at = now()
   where id = case when tg_op = 'DELETE' then old.cv_id else new.cv_id end;
  return null;
end $$;

create trigger teacher_cv_touch
  before update on public.teacher_cv
  for each row execute function private.touch_cv();

create trigger cv_experience_touch
  after insert or update or delete on public.cv_experience
  for each row execute function private.touch_cv();
create trigger cv_education_touch
  after insert or update or delete on public.cv_education
  for each row execute function private.touch_cv();
create trigger cv_skills_touch
  after insert or update or delete on public.cv_skills
  for each row execute function private.touch_cv();
