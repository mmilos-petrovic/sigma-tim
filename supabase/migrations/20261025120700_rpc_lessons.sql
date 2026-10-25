-- Scheduling, booking and cancelling. Every function checks the caller itself (SECURITY DEFINER) and none is
-- callable by anon.

-- Teacher schedules a confirmed lesson for their own students, in one atomic step.
create function public.schedule_lesson(
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

-- A student, or a parent for their child, books a free slot.
-- Atomic: the slot row is locked, so of two simultaneous bookings the first wins and the second gets PT409.
-- Booking less than 12 hours ahead leaves the lesson 'pending' until the teacher answers.
create function public.claim_slot(p_lesson_id uuid, p_student_ids uuid[]) returns public.lesson_status
language plpgsql security definer set search_path = '' as $$
declare
  v_teacher uuid;
  v_students uuid[];
  v_lesson public.lessons;
  v_status public.lesson_status;
begin
  select teacher_id into v_teacher from public.lessons where id = p_lesson_id;
  if not found then
    raise exception 'lesson not found' using errcode = 'PT404';
  end if;

  select coalesce(array_agg(distinct s), '{}') into v_students from unnest(p_student_ids) as s where s is not null;
  if cardinality(v_students) = 0 then
    raise exception 'choose at least one student' using errcode = 'PT400';
  end if;
  if cardinality(v_students) > public.max_lesson_students() then
    raise exception 'too many students in one lesson' using errcode = 'PT400';
  end if;

  -- every student is the caller or the caller's child, and belongs to the slot's teacher
  if exists (
    select 1 from unnest(v_students) as s
     where not exists (
       select 1 from public.students st
        where st.id = s and st.teacher_id = v_teacher and st.id in (select private.my_student_ids())
     )
  ) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select * into v_lesson from public.lessons where id = p_lesson_id for update;
  if not found then
    raise exception 'lesson not found' using errcode = 'PT404';
  end if;
  if v_lesson.status <> 'open' then
    raise exception 'slot is already taken' using errcode = 'PT409';
  end if;
  if v_lesson.start_at <= now() then
    raise exception 'lesson already started' using errcode = 'PT409';
  end if;

  v_status := case when v_lesson.start_at - now() < interval '12 hours' then 'pending' else 'confirmed' end;

  insert into public.lesson_students (lesson_id, student_id)
  select p_lesson_id, s from unnest(v_students) as s;
  update public.lessons set status = v_status where id = p_lesson_id;

  return v_status;
end $$;

create function public.confirm_booking(p_lesson_id uuid) returns void
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
    raise exception 'only a pending booking can be confirmed' using errcode = 'PT409';
  end if;

  update public.lessons set status = 'confirmed' where id = p_lesson_id;
end $$;

-- Declining frees the slot again; the student and parents are told.
create function public.decline_booking(p_lesson_id uuid) returns void
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

  perform private.enqueue_cancellation(p_lesson_id, 'declined');
  delete from public.lesson_students where lesson_id = p_lesson_id;
  update public.lessons set status = 'open' where id = p_lesson_id;
end $$;

-- The teacher, a participant or a participant's parent cancels any time before the lesson starts.
--   the teacher cancels:  the whole lesson goes
--   a student or parent:  only their own student(s) leave; the lesson goes on for the others
--   whoever cancels last: a lesson the teacher scheduled is deleted, a booked free slot is back to 'open'
--   an unbooked slot:     removed, by its teacher only
create function public.cancel_lesson(p_lesson_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_lesson public.lessons;
  v_is_teacher boolean;
  v_leaving uuid[];
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

  if not v_is_teacher and v_lesson.status <> 'open' then
    select coalesce(array_agg(ls.student_id), '{}') into v_leaving
      from public.lesson_students ls
     where ls.lesson_id = p_lesson_id and ls.student_id in (select private.my_student_ids());

    if exists (
      select 1 from public.lesson_students ls
       where ls.lesson_id = p_lesson_id and not (ls.student_id = any (v_leaving))
    ) then
      perform private.enqueue_participant_left(p_lesson_id, v_leaving);
      delete from public.lesson_students where lesson_id = p_lesson_id and student_id = any (v_leaving);
      return;
    end if;
  end if;

  if v_lesson.status = 'open' or v_lesson.origin = 'teacher' then
    delete from public.lessons where id = p_lesson_id;
  else
    perform private.enqueue_cancellation(p_lesson_id, 'cancelled');
    delete from public.lesson_students where lesson_id = p_lesson_id;
    update public.lessons set status = 'open', outcome = null where id = p_lesson_id;
  end if;
end $$;

-- Overlaps with an existing booking, as a warning for the teacher: nothing here blocks anything.
-- Free slots are availability, not bookings, so they never conflict. The answer says when and where,
-- never who attends.
create function public.find_conflicts(
  p_teacher_id uuid, p_room_id uuid, p_start_at timestamptz, p_end_at timestamptz, p_exclude_lesson_id uuid default null
) returns table (
  teacher_id uuid, location_id uuid, room_id uuid, start_at timestamptz, end_at timestamptz,
  same_teacher boolean, same_room boolean
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_teacher() or private.is_admin()) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  return query
  select l.teacher_id, l.location_id, l.room_id, l.start_at, l.end_at,
         l.teacher_id = p_teacher_id,
         p_room_id is not null and l.room_id = p_room_id
    from public.lessons l
   where l.status in ('pending', 'confirmed')
     and l.start_at < p_end_at and l.end_at > p_start_at
     and l.id is distinct from p_exclude_lesson_id
     and (l.teacher_id = p_teacher_id or (p_room_id is not null and l.room_id = p_room_id))
   order by l.start_at;
end $$;

-- When colleagues are busy (for the shared calendar): time, teacher and room only, no subject, no students.
create function public.busy_times(p_from timestamptz, p_to timestamptz)
returns table (teacher_id uuid, location_id uuid, room_id uuid, start_at timestamptz, end_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (private.is_teacher() or private.is_admin()) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_to - p_from > interval '62 days' then
    raise exception 'the range is too long' using errcode = 'PT400';
  end if;

  return query
  select l.teacher_id, l.location_id, l.room_id, l.start_at, l.end_at
    from public.lessons l
   where l.status in ('pending', 'confirmed')
     and l.start_at < p_to and l.end_at > p_from
   order by l.start_at;
end $$;

revoke all on function public.schedule_lesson(uuid, uuid, uuid, timestamptz, timestamptz, uuid[]) from public, anon;
revoke all on function public.claim_slot(uuid, uuid[]) from public, anon;
revoke all on function public.confirm_booking(uuid) from public, anon;
revoke all on function public.decline_booking(uuid) from public, anon;
revoke all on function public.cancel_lesson(uuid) from public, anon;
revoke all on function public.find_conflicts(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon;
revoke all on function public.busy_times(timestamptz, timestamptz) from public, anon;

grant execute on function public.schedule_lesson(uuid, uuid, uuid, timestamptz, timestamptz, uuid[]) to authenticated;
grant execute on function public.claim_slot(uuid, uuid[]) to authenticated;
grant execute on function public.confirm_booking(uuid) to authenticated;
grant execute on function public.decline_booking(uuid) to authenticated;
grant execute on function public.cancel_lesson(uuid) to authenticated;
grant execute on function public.find_conflicts(uuid, uuid, timestamptz, timestamptz, uuid) to authenticated;
grant execute on function public.busy_times(timestamptz, timestamptz) to authenticated;
