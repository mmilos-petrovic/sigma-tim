-- Phase 5a: payment per student, a reason for cancelling, deleting a student, and two read-only functions for the screens
-- that delete students.

-- Paid ---------------------------------------------------------------------------------------------------------------------------
-- The teacher marks that a student has paid for a lesson (per student: a group lesson has up to four). Nothing else about
-- money is kept. The column is readable like the rest of the row (the student and the parents read their own, the teacher
-- reads all of theirs) and is written only here: the table grant lets a teacher update `note` and nothing more.

alter table public.lesson_students add column paid_at timestamptz;

create function public.set_lesson_paid(p_lesson_id uuid, p_student_id uuid, p_paid boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_teacher uuid;
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_paid is null then
    raise exception 'say whether the lesson is paid' using errcode = 'PT400';
  end if;

  select teacher_id into v_teacher from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'lesson not found' using errcode = 'PT404';
  end if;
  if v_teacher <> v_me then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  -- marking twice keeps the first moment; a free slot has no participants, so it is not found here either
  update public.lesson_students
     set paid_at = case when p_paid then coalesce(paid_at, now()) else null end
   where lesson_id = p_lesson_id and student_id = p_student_id;
  if not found then
    raise exception 'the student is not on this lesson' using errcode = 'PT404';
  end if;
end $$;

revoke all on function public.set_lesson_paid(uuid, uuid, boolean) from public, anon;
grant execute on function public.set_lesson_paid(uuid, uuid, boolean) to authenticated;

-- A reason for cancelling -----------------------------------------------------------------------------------------------------
-- Whoever cancels a lesson, leaves a group lesson or declines a late booking may say why, in up to 200 characters. The reason
-- is only carried to the others in the notice that is queued for them, under `note` (the key `reason` already says what kind
-- of cancellation it was). Nothing else keeps it, and nobody reads the outbox but the service that sends it.

-- Blank counts as none; too long is refused before anything is changed.
create function private.clean_note(p_note text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_note text := nullif(btrim(coalesce(p_note, ''), E' \t\r\n'), '');
begin
  if char_length(v_note) > 200 then
    raise exception 'the reason is too long' using errcode = 'PT400';
  end if;
  return v_note;
end $$;

drop function private.enqueue_cancellation(uuid, text);
create function private.enqueue_cancellation(p_lesson_id uuid, p_reason text, p_note text default null) returns void
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
         ) || case when p_note is null then '{}'::jsonb else jsonb_build_object('note', p_note) end
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

drop function private.enqueue_participant_left(uuid, uuid[]);
create function private.enqueue_participant_left(p_lesson_id uuid, p_student_ids uuid[], p_note text default null) returns void
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
         ) || case when p_note is null then '{}'::jsonb else jsonb_build_object('note', p_note) end
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

-- Deleting a lesson queues its notice from a trigger, which cannot be handed the reason. The function that deletes says it
-- through `app.cancel_note` (like `app.cancel_reason`), and clears it again when it is done.
-- delete_student also removes past lessons that nobody else was on, and says so with `app.deleting_student`, which only it
-- sets and which never lets a lesson recorded as held go.
create or replace function private.lessons_before_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- coalesce: a missing setting is null, and `not (null and ...)` would silently let the delete through
  if old.start_at <= now()
     and not (coalesce(current_setting('app.deleting_student', true), '') = 'on' and old.outcome is distinct from 'held') then
    raise exception 'lesson already started' using errcode = 'PT409';
  end if;
  perform private.enqueue_cancellation(
    old.id,
    coalesce(nullif(current_setting('app.cancel_reason', true), ''), 'cancelled'),
    nullif(current_setting('app.cancel_note', true), '')
  );
  return old;
end $$;

drop function public.cancel_lesson(uuid);
create function public.cancel_lesson(p_lesson_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_lesson public.lessons;
  v_is_teacher boolean;
  v_leaving uuid[];
  v_note text;
begin
  select * into v_lesson from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'lesson not found' using errcode = 'PT404';
  end if;

  -- coalesce: for a non-teacher the comparison is null, and `not (null or false)` would silently skip the check
  v_is_teacher := coalesce(v_lesson.teacher_id = private.current_teacher_id(), false);
  if not (v_is_teacher or private.is_participant(p_lesson_id)) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if v_lesson.start_at <= now() then
    raise exception 'lesson already started' using errcode = 'PT409';
  end if;

  v_note := private.clean_note(p_note);

  if not v_is_teacher and v_lesson.status <> 'open' then
    select coalesce(array_agg(ls.student_id), '{}') into v_leaving
      from public.lesson_students ls
     where ls.lesson_id = p_lesson_id and ls.student_id in (select private.my_student_ids());

    if exists (
      select 1 from public.lesson_students ls
       where ls.lesson_id = p_lesson_id and not (ls.student_id = any (v_leaving))
    ) then
      perform private.enqueue_participant_left(p_lesson_id, v_leaving, v_note);
      delete from public.lesson_students where lesson_id = p_lesson_id and student_id = any (v_leaving);
      return;
    end if;
  end if;

  if v_lesson.status = 'open' or v_lesson.origin = 'teacher' then
    -- read by the BEFORE DELETE trigger on lessons
    perform set_config('app.cancel_note', coalesce(v_note, ''), true);
    delete from public.lessons where id = p_lesson_id;
    perform set_config('app.cancel_note', '', true);
  else
    perform private.enqueue_cancellation(p_lesson_id, 'cancelled', v_note);
    delete from public.lesson_students where lesson_id = p_lesson_id;
    update public.lessons set status = 'open', outcome = null where id = p_lesson_id;
  end if;
end $$;

revoke all on function public.cancel_lesson(uuid, text) from public, anon;
grant execute on function public.cancel_lesson(uuid, text) to authenticated;

drop function public.decline_booking(uuid);
create function public.decline_booking(p_lesson_id uuid, p_note text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_lesson public.lessons;
  v_note text;
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

  v_note := private.clean_note(p_note);

  perform private.enqueue_cancellation(p_lesson_id, 'declined', v_note);
  delete from public.lesson_students where lesson_id = p_lesson_id;
  update public.lessons set status = 'open' where id = p_lesson_id;
end $$;

revoke all on function public.decline_booking(uuid, text) from public, anon;
grant execute on function public.decline_booking(uuid, text) to authenticated;

-- Counts for the screens that delete students -------------------------------------------------------------------------------------
-- Lessons recorded as held, and lessons still to come (booked, whether or not the teacher has answered yet; a free slot has
-- nobody on it), for the students the caller may delete: all of them for an administrator, the teacher's own for an active
-- teacher.
create function public.student_lesson_counts()
returns table (student_id uuid, held_lessons integer, upcoming_lessons integer)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_admin boolean := private.is_admin();
  v_teacher uuid := private.current_teacher_id();
begin
  if not v_admin and v_teacher is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  return query
  select s.id,
         (select count(*)::integer
            from public.lesson_students ls join public.lessons l on l.id = ls.lesson_id
           where ls.student_id = s.id and l.outcome = 'held'),
         (select count(*)::integer
            from public.lesson_students ls join public.lessons l on l.id = ls.lesson_id
           where ls.student_id = s.id and l.start_at > now())
    from public.students s
   where v_admin or s.teacher_id = v_teacher;
end $$;

revoke all on function public.student_lesson_counts() from public, anon;
grant execute on function public.student_lesson_counts() to authenticated;

-- The administrator's list of students ---------------------------------------------------------------------------------------------
-- One row per student record (a person who studies with two teachers has two), the one added last first. The locations are
-- those of the record's lessons, past or still to come; a free slot belongs to nobody.
create function public.admin_list_students()
returns table (
  student_id uuid, profile_id uuid, first_name text, last_name text, email text, created_at timestamptz,
  teacher_id uuid, teacher_name text, parent_names text[], location_names text[],
  held_lessons integer, upcoming_lessons integer
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  return query
  select s.id, p.id, p.first_name, p.last_name, p.email, s.created_at,
         s.teacher_id, tp.first_name || ' ' || tp.last_name,
         coalesce((
           select array_agg(pp.first_name || ' ' || pp.last_name order by pp.last_name, pp.first_name)
             from public.parent_students ps join public.profiles pp on pp.id = ps.parent_id
            where ps.student_id = s.id
         ), '{}'),
         array(
           select distinct loc.name
             from public.lesson_students ls
             join public.lessons l on l.id = ls.lesson_id
             join public.locations loc on loc.id = l.location_id
            where ls.student_id = s.id
            order by loc.name
         ),
         c.held_lessons, c.upcoming_lessons
    from public.students s
    join public.profiles p on p.id = s.profile_id
    left join public.profiles tp on tp.id = s.teacher_id
    join public.student_lesson_counts() c on c.student_id = s.id
   order by s.created_at desc, s.id;
end $$;

revoke all on function public.admin_list_students() from public, anon;
grant execute on function public.admin_list_students() to authenticated;

-- Deleting a student ------------------------------------------------------------------------------------------------------------------
-- A student record is deleted by its own teacher or by an administrator, and only while it has no lesson recorded as held:
-- a student with even one such lesson stays for good (PT409). Nothing is deleted by hand around this, whoever asks.
--   lessons still to come   leave the way a student does: a group lesson goes on for the others (they are told), a lesson of
--                           the teacher's own is cancelled, a booked free slot is free again
--   lessons that took place or were never recorded (not held, no outcome, a booking nobody answered) with nobody else on them
--                           are deleted, so no empty block is left behind; with others on them they stay without the student
--   the person              is deleted too when no other role is left (not a teacher, administrator, other student record or
--                           parent), so the email can be used again; the Google account itself is left alone
--   the parents             lose the parent role when no child is left, and the profile too when nothing else is left
create function public.delete_student(p_student_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_student public.students;
  v_parent_ids uuid[];
  v_orphans uuid[];
  v_lesson public.lessons;
begin
  if not (private.is_admin() or private.is_teacher()) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select * into v_student from public.students where id = p_student_id for update;
  if not found then
    raise exception 'student not found' using errcode = 'PT404';
  end if;
  -- a student nobody teaches (teacher_id is null) is the administrator's; coalesce, because `null = id` is null, and
  -- `not (false or null)` would silently let the call through
  if not (private.is_admin() or coalesce(v_student.teacher_id = private.current_teacher_id(), false)) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  -- the lessons of the student are held still, so an outcome cannot be recorded between the check and the deletion
  perform 1 from public.lessons l
   where l.id in (select ls.lesson_id from public.lesson_students ls where ls.student_id = p_student_id)
   order by l.id
     for update;
  if exists (
    select 1 from public.lesson_students ls join public.lessons l on l.id = ls.lesson_id
     where ls.student_id = p_student_id and l.outcome = 'held'
  ) then
    raise exception 'a student with a lesson that took place cannot be deleted' using errcode = 'PT409';
  end if;

  select coalesce(array_agg(ps.parent_id), '{}') into v_parent_ids
    from public.parent_students ps where ps.student_id = p_student_id;

  -- lessons still to come
  for v_lesson in
    select l.* from public.lessons l join public.lesson_students ls on ls.lesson_id = l.id
     where ls.student_id = p_student_id and l.start_at > now()
     order by l.start_at
  loop
    if exists (
      select 1 from public.lesson_students ls where ls.lesson_id = v_lesson.id and ls.student_id <> p_student_id
    ) then
      -- the student's own row goes with their record below
      perform private.enqueue_participant_left(v_lesson.id, array[p_student_id]);
    elsif v_lesson.origin = 'teacher' then
      delete from public.lessons where id = v_lesson.id;
    else
      perform private.enqueue_cancellation(v_lesson.id, 'cancelled');
      update public.lessons set status = 'open' where id = v_lesson.id;
    end if;
  end loop;

  -- lessons that already started and had nobody else on them
  select coalesce(array_agg(l.id), '{}') into v_orphans
    from public.lessons l join public.lesson_students ls on ls.lesson_id = l.id
   where ls.student_id = p_student_id and l.start_at <= now()
     and not exists (select 1 from public.lesson_students o where o.lesson_id = l.id and o.student_id <> p_student_id);

  -- takes the participant rows, the parent links and takeover requests with it
  delete from public.students where id = p_student_id;

  perform set_config('app.deleting_student', 'on', true);
  delete from public.lessons where id = any (v_orphans);
  perform set_config('app.deleting_student', '', true);

  delete from public.parents pa
   where pa.profile_id = any (v_parent_ids)
     and not exists (select 1 from public.parent_students ps where ps.parent_id = pa.profile_id);

  delete from public.profiles p
   where p.id = any (v_parent_ids || v_student.profile_id)
     and not p.is_admin
     and not exists (select 1 from public.teachers t where t.profile_id = p.id)
     and not exists (select 1 from public.students s where s.profile_id = p.id)
     and not exists (select 1 from public.parents pa where pa.profile_id = p.id);
end $$;

revoke all on function public.delete_student(uuid) from public, anon;
grant execute on function public.delete_student(uuid) to authenticated;
