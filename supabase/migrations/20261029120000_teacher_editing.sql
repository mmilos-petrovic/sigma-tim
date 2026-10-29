-- What a teacher needs to run their schedule: editing lessons (with a lock by day), changing who attends,
-- correcting names, and unlinking a parent who was added with the wrong email.

-- The school day ------------------------------------------------------------------------------------------------------
-- Lessons are locked by calendar day in the school's fixed time zone, not by the clock: a lesson can be corrected until
-- 23:59 of the day it was held.

create function private.school_day_start(p_at timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select ((p_at at time zone 'Europe/Belgrade')::date)::timestamp at time zone 'Europe/Belgrade'
$$;

-- The first moment of the following day, i.e. the moment the lock takes effect.
create function private.school_day_end(p_at timestamptz) returns timestamptz
language sql stable set search_path = '' as $$
  select (((p_at at time zone 'Europe/Belgrade')::date + 1)::timestamp) at time zone 'Europe/Belgrade'
$$;

-- Lesson data rules: the lock ---------------------------------------------------------------------------------------------
-- Subject, location, room and time are frozen once the day of the lesson is over, and as soon as an outcome is recorded
-- (the outcome is the record of what happened; clear it first to correct the lesson). Participants, notes and the outcome
-- itself stay editable. A lesson cannot be moved onto a day that has passed.

create or replace function private.lessons_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (
    new.subject_id is distinct from old.subject_id
    or new.location_id is distinct from old.location_id
    or new.room_id is distinct from old.room_id
    or new.start_at is distinct from old.start_at
    or new.end_at is distinct from old.end_at
  ) then
    if old.outcome is not null then
      raise exception 'a lesson with a recorded outcome cannot be changed' using errcode = 'PT409';
    end if;
    if now() >= private.school_day_end(old.start_at) then
      raise exception 'the day of this lesson is over, it can no longer be changed' using errcode = 'PT409';
    end if;
    if new.start_at < private.school_day_start(now()) then
      raise exception 'a lesson cannot be moved to a day that has passed' using errcode = 'PT400';
    end if;
  end if;

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

-- Free slots ----------------------------------------------------------------------------------------------------------------
-- A free slot is availability: it can only be published, or moved, into the future. An expired slot is left alone
-- (it cannot be deleted either, as it already started).

alter policy lessons_insert_slot on public.lessons
  with check (teacher_id = (select private.current_teacher_id()) and status = 'open' and origin = 'slot' and start_at > now());

alter policy lessons_update_own on public.lessons
  with check (teacher_id = (select private.current_teacher_id()) and (status <> 'open' or start_at > now()));

-- Scheduling: from the start of today ----------------------------------------------------------------------------------------
-- A lesson can be entered for earlier today (to record it afterwards), not for a day that has passed.

create or replace function public.schedule_lesson(
  p_subject_id uuid, p_location_id uuid, p_room_id uuid,
  p_start_at timestamptz, p_end_at timestamptz, p_student_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_students uuid[];
  v_lesson uuid;
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_start_at < private.school_day_start(now()) then
    raise exception 'a lesson cannot start on a day that has passed' using errcode = 'PT400';
  end if;

  select coalesce(array_agg(distinct s), '{}') into v_students from unnest(p_student_ids) as s where s is not null;
  if cardinality(v_students) = 0 then
    raise exception 'a lesson needs at least one student' using errcode = 'PT400';
  end if;
  if cardinality(v_students) > public.max_lesson_students() then
    raise exception 'too many students in one lesson' using errcode = 'PT400';
  end if;
  if exists (
    select 1 from unnest(v_students) as s
     where not exists (select 1 from public.students st where st.id = s and st.teacher_id = v_me)
  ) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  insert into public.lessons (teacher_id, subject_id, location_id, room_id, start_at, end_at, status, origin)
  values (v_me, p_subject_id, p_location_id, p_room_id, p_start_at, p_end_at, 'confirmed', 'teacher')
  returning id into v_lesson;

  insert into public.lesson_students (lesson_id, student_id)
  select v_lesson, s from unnest(v_students) as s;

  return v_lesson;
end $$;

-- Who attends --------------------------------------------------------------------------------------------------------------------
-- The teacher replaces the participants of a confirmed lesson of theirs: 1 to 4 of their own students. Students who stay
-- keep their notes. Not subject to the day lock (a correction of who was there is always possible). A free slot has no
-- participants and a pending booking has to be answered first.

create function public.set_lesson_students(p_lesson_id uuid, p_student_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_lesson public.lessons;
  v_students uuid[];
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select * into v_lesson from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'lesson not found' using errcode = 'PT404';
  end if;
  if v_lesson.teacher_id <> v_me then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if v_lesson.status <> 'confirmed' then
    raise exception 'only a confirmed lesson has participants to change' using errcode = 'PT409';
  end if;

  select coalesce(array_agg(distinct s), '{}') into v_students from unnest(p_student_ids) as s where s is not null;
  if cardinality(v_students) = 0 then
    raise exception 'a lesson needs at least one student' using errcode = 'PT400';
  end if;
  -- (the upper limit is enforced by the participant trigger, with the same error)
  if exists (
    select 1 from unnest(v_students) as s
     where not exists (select 1 from public.students st where st.id = s and st.teacher_id = v_me)
  ) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  -- removals first, so the participant limit never sees the old and the new group together
  delete from public.lesson_students where lesson_id = p_lesson_id and not (student_id = any (v_students));
  insert into public.lesson_students (lesson_id, student_id)
  select p_lesson_id, s from unnest(v_students) as s
  on conflict (lesson_id, student_id) do nothing;
end $$;

-- A late answer ---------------------------------------------------------------------------------------------------------------------
-- Confirming stays possible after the start (it is the way to record an outcome for a booking nobody answered).
-- Declining does not: it would leave a free slot in the past.

create or replace function public.decline_booking(p_lesson_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_lesson public.lessons;
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select * into v_lesson from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'lesson not found' using errcode = 'PT404';
  end if;
  if v_lesson.teacher_id <> v_me then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if v_lesson.status <> 'pending' then
    raise exception 'only a pending booking can be declined' using errcode = 'PT409';
  end if;
  if v_lesson.start_at <= now() then
    raise exception 'lesson already started' using errcode = 'PT409';
  end if;

  perform private.enqueue_cancellation(p_lesson_id, 'declined');
  delete from public.lesson_students where lesson_id = p_lesson_id;
  update public.lessons set status = 'open' where id = p_lesson_id;
end $$;

-- People ----------------------------------------------------------------------------------------------------------------------------
-- A teacher corrects the name of one of their students or of a parent of one. Never an email: the email is how the person
-- is recognised when they sign in (the admin has change_profile_email for that). A name belongs to the person, so a parent
-- shared with another teacher is renamed for both. Colleagues, admins and the teacher themselves are not reachable here.

create function public.rename_person(p_profile_id uuid, p_first_name text, p_last_name text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_first text := btrim(coalesce(p_first_name, ''));
  v_last text := btrim(coalesce(p_last_name, ''));
begin
  -- no separate "is a teacher" check: for anyone else v_me is null, which never equals a teacher_id below
  if not (
    exists (select 1 from public.students s where s.profile_id = p_profile_id and s.teacher_id = v_me)
    or exists (
      select 1 from public.parent_students ps join public.students s on s.id = ps.student_id
       where ps.parent_id = p_profile_id and s.teacher_id = v_me
    )
  ) or exists (select 1 from public.teachers where profile_id = p_profile_id)
     or exists (select 1 from public.profiles where id = p_profile_id and is_admin) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  if v_first = '' or v_last = '' or char_length(v_first) > 100 or char_length(v_last) > 100 then
    raise exception 'first and last name are required (at most 100 characters)' using errcode = 'PT400';
  end if;

  update public.profiles set first_name = v_first, last_name = v_last where id = p_profile_id;
end $$;

-- Unlinks a parent from a student (a wrong email is corrected by removing the parent and adding the right one). The
-- parent keeps access to their other children; one with no children left loses the parent role. The profile stays,
-- because erasing a person is a separate, deliberate step.
create function public.remove_parent_from_student(p_student_id uuid, p_parent_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (private.is_admin() or private.is_teacher_of(p_student_id)) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  -- serialises with add_parent_to_student: the parents row cascades to the links, so it must not be dropped while
  -- somebody is linking this parent to another child
  perform 1 from public.parents where profile_id = p_parent_id for update;

  delete from public.parent_students where parent_id = p_parent_id and student_id = p_student_id;
  if not found then
    raise exception 'this parent is not linked to the student' using errcode = 'PT404';
  end if;

  if not exists (select 1 from public.parent_students where parent_id = p_parent_id) then
    delete from public.parents where profile_id = p_parent_id;
  end if;
end $$;

revoke all on function public.set_lesson_students(uuid, uuid[]) from public, anon;
revoke all on function public.rename_person(uuid, text, text) from public, anon;
revoke all on function public.remove_parent_from_student(uuid, uuid) from public, anon;

grant execute on function public.set_lesson_students(uuid, uuid[]) to authenticated;
grant execute on function public.rename_person(uuid, text, text) to authenticated;
grant execute on function public.remove_parent_from_student(uuid, uuid) to authenticated;
