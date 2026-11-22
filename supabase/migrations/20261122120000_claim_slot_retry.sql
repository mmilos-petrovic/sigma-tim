-- Phase 8b: booking a free slot can be asked again.
--
-- A booking whose answer got lost on a slow connection is asked for a second time by the person's own browser (or by the
-- person, who sees nothing happen). The slot is already theirs, and "slot is already taken" is the wrong thing to say to
-- them. The same students asking for the same slot again now get the answer they got the first time, and nothing is
-- written: no second participant, no second notice.
--
-- It is the same booking only when the lesson came from a slot (an ordinary lesson of the teacher is never "booked") and
-- the students on it are exactly the students asked for now. Anybody else, and the same person asking for other students,
-- still finds the slot taken.

create or replace function public.claim_slot(p_lesson_id uuid, p_student_ids uuid[]) returns public.lesson_status
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

  select coalesce(array_agg(distinct s order by s), '{}') into v_students from unnest(p_student_ids) as s where s is not null;
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
    -- the same booking asked for again: the answer is the one it got the first time
    -- (same students: as many as are on the lesson, and every one of them is on it)
    if v_lesson.origin = 'slot'
       and (select count(*) from public.lesson_students ls where ls.lesson_id = p_lesson_id) = cardinality(v_students)
       and not exists (
         select 1 from unnest(v_students) as s
          where not exists (select 1 from public.lesson_students ls where ls.lesson_id = p_lesson_id and ls.student_id = s)
       ) then
      return v_lesson.status;
    end if;
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
