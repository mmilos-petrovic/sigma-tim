-- Phase 8d: the administrator erases a student or a parent on their request.
--
-- Everything that is only about the person goes: the student records with their attendance, requests and parent links, the
-- parent role, phone number, devices, notices written for them, the profile itself and the Google account behind it (so the
-- address can sign up again as a stranger). What stays is what belongs to somebody else:
--   - a lesson that took place stays on the teacher's record, without the erased student on it (its payment mark went with
--     the student's row; see the README)
--   - the name of the person inside notices written for OTHERS (a teacher's "participant left", a parent's lesson notice) is
--     replaced by a placeholder, and the "who did it" id of such a notice is removed
-- A parent who still has a child linked is refused until the children are erased or unlinked; a teacher is erased with
-- `erase_teacher`, which already erases the same person's student and parent roles; an administrator is never erased.
--
-- The Google account is deleted here, in the same transaction, instead of through a second call that could fail after the
-- profile is gone.

-- What erasing a teacher and erasing a student have in common ------------------------------------------------------------------
-- Takes the students out of the lessons that have not started, the way a student leaves: a group lesson goes on for the
-- others (they are told), a lesson of the teacher's own that only they attended is cancelled, a booked free slot is free
-- again. Their own participant rows go with their records, which the caller deletes next.
create function private.leave_future_lessons(p_student_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_lesson public.lessons;
begin
  for v_lesson in
    select l.* from public.lessons l
     where l.start_at > now()
       and exists (select 1 from public.lesson_students ls where ls.lesson_id = l.id and ls.student_id = any (p_student_ids))
       for update of l
  loop
    if exists (
      select 1 from public.lesson_students ls
       where ls.lesson_id = v_lesson.id and not (ls.student_id = any (p_student_ids))
    ) then
      perform private.enqueue_participant_left(
        v_lesson.id,
        (select array_agg(ls.student_id) from public.lesson_students ls
          where ls.lesson_id = v_lesson.id and ls.student_id = any (p_student_ids))
      );
    elsif v_lesson.origin = 'teacher' then
      delete from public.lessons where id = v_lesson.id;
    else
      -- a booked free slot: back to open (the participant row goes with the student record)
      perform private.enqueue_cancellation(v_lesson.id, 'cancelled');
      update public.lessons set status = 'open', outcome = null where id = v_lesson.id;
    end if;
  end loop;
end $$;

revoke all on function private.leave_future_lessons(uuid[]) from public, anon, authenticated;

-- erase_teacher is unchanged except that the loop over the future lessons moved into the function above
create or replace function public.erase_teacher(p_teacher_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_is_admin boolean;
  v_erased timestamptz;
  v_student_ids uuid[];
  v_parent_ids uuid[];
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select p.is_admin, p.erased_at into v_is_admin, v_erased
    from public.teachers t join public.profiles p on p.id = t.profile_id
   where t.profile_id = p_teacher_id
     for update of t, p;
  if not found then
    raise exception 'teacher not found' using errcode = 'PT404';
  end if;
  if v_is_admin then
    raise exception 'an administrator cannot be erased' using errcode = 'PT409';
  end if;
  if v_erased is not null then
    raise exception 'this person was already erased' using errcode = 'PT409';
  end if;

  -- the teacher side: lessons still to come, students, takeover requests
  perform private.release_teacher(p_teacher_id);

  -- the student side: leave the lessons still to come the way a student does, then drop the records
  select coalesce(array_agg(id), '{}') into v_student_ids from public.students where profile_id = p_teacher_id;
  select coalesce(array_agg(distinct parent_id), '{}') into v_parent_ids
    from public.parent_students where student_id = any (v_student_ids);

  perform private.leave_future_lessons(v_student_ids);

  -- also the attendance in lessons that took place: the lessons stay, the erased student is no longer on them
  delete from public.students where profile_id = p_teacher_id;
  -- a parent who has no child left loses the parent role, as when a parent is unlinked
  delete from public.parents pa
   where pa.profile_id = any (v_parent_ids)
     and not exists (select 1 from public.parent_students ps where ps.parent_id = pa.profile_id);

  delete from public.parents where profile_id = p_teacher_id;
  delete from public.push_subscriptions where profile_id = p_teacher_id;
  delete from public.notifications where recipient_id = p_teacher_id;

  -- only lessons that already started can be left now
  if exists (select 1 from public.lessons where teacher_id = p_teacher_id) then
    -- inactive first: only an active teacher must keep a subject
    update public.teachers set is_active = false, bio = null, photo_path = null where profile_id = p_teacher_id;
    delete from public.teacher_subjects where teacher_id = p_teacher_id;
    delete from public.teacher_cv where teacher_id = p_teacher_id;
    update public.profiles
       set email = 'erased-' || id || '@erased.invalid', user_id = null, avatar_url = null, erased_at = now()
     where id = p_teacher_id;
    return 'kept_history';
  end if;

  delete from public.teachers where profile_id = p_teacher_id;
  delete from public.profiles where id = p_teacher_id;
  return 'deleted';
end $$;

-- A name inside a notice ------------------------------------------------------------------------------------------------------
-- The notices written for other people name the student as `students` (a list of full names) or `student` (one name) and who
-- acted as `actor` (a profile id). The placeholder is read by people, in Serbian.
create function private.blank_person_in_payload(p_payload jsonb, p_names text[], p_person uuid) returns jsonb
language plpgsql immutable set search_path = '' as $$
declare
  v_payload jsonb := p_payload;
  v_placeholder jsonb := to_jsonb('izbrisana osoba'::text);
begin
  if v_payload ->> 'actor' = p_person::text then
    v_payload := v_payload - 'actor';
  end if;
  if jsonb_typeof(v_payload -> 'student') = 'string' and (v_payload ->> 'student') = any (p_names) then
    v_payload := jsonb_set(v_payload, '{student}', v_placeholder);
  end if;
  if jsonb_typeof(v_payload -> 'students') = 'array' then
    v_payload := jsonb_set(v_payload, '{students}', (
      select coalesce(jsonb_agg(
               case when jsonb_typeof(e.value) = 'string' and (e.value #>> '{}') = any (p_names) then v_placeholder else e.value end
               order by e.position), '[]'::jsonb)
        from jsonb_array_elements(v_payload -> 'students') with ordinality as e (value, position)
    ));
  end if;
  return v_payload;
end $$;

revoke all on function private.blank_person_in_payload(jsonb, text[], uuid) from public, anon, authenticated;

-- Erasing a student or a parent ---------------------------------------------------------------------------------------------
create function public.erase_person(p_profile_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.profiles;
  v_student_ids uuid[];
  v_parent_ids uuid[];
  v_names text[];
  v_orphans uuid[];
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'person not found' using errcode = 'PT404';
  end if;
  if v_profile.is_admin then
    raise exception 'an administrator cannot be erased' using errcode = 'PT409';
  end if;
  if v_profile.erased_at is not null then
    raise exception 'this person was already erased' using errcode = 'PT409';
  end if;
  if exists (select 1 from public.teachers where profile_id = p_profile_id) then
    raise exception 'a teacher is erased as a teacher' using errcode = 'PT409';
  end if;

  -- the parent role is held still, so a child cannot be linked between the check and the deletion
  perform 1 from public.parents where profile_id = p_profile_id for update;
  if exists (select 1 from public.parent_students where parent_id = p_profile_id) then
    raise exception 'a parent with children cannot be erased: erase or unlink the children first' using errcode = 'PT409';
  end if;

  -- the student records and their lessons are held still, so an outcome cannot be recorded or a booking made meanwhile
  perform 1 from public.students where profile_id = p_profile_id order by id for update;
  select coalesce(array_agg(id), '{}') into v_student_ids from public.students where profile_id = p_profile_id;
  perform 1 from public.lessons l
   where l.id in (select ls.lesson_id from public.lesson_students ls where ls.student_id = any (v_student_ids))
   order by l.id
     for update;

  select coalesce(array_agg(distinct ps.parent_id), '{}') into v_parent_ids
    from public.parent_students ps where ps.student_id = any (v_student_ids);

  -- the names this person goes by in other people's notices: the profile's, and what was typed on a request for the student
  select coalesce(array_agg(distinct x.name), '{}') into v_names
    from (
      select v_profile.first_name || ' ' || v_profile.last_name as name where cardinality(v_student_ids) > 0
      union
      select r.student_first_name || ' ' || r.student_last_name
        from public.enrolment_requests r
       where r.student_id = any (v_student_ids) and r.student_first_name is not null and r.student_last_name is not null
    ) x;

  perform private.leave_future_lessons(v_student_ids);

  -- lessons that already started, were not held and had nobody else on them: no empty block is left behind
  select coalesce(array_agg(l.id), '{}') into v_orphans
    from public.lessons l
   where l.start_at <= now()
     and l.outcome is distinct from 'held'
     and exists (select 1 from public.lesson_students ls where ls.lesson_id = l.id and ls.student_id = any (v_student_ids))
     and not exists (select 1 from public.lesson_students o where o.lesson_id = l.id and not (o.student_id = any (v_student_ids)));

  -- takes the participant rows (also in lessons that took place), the parent links, the requests with the data typed on
  -- them and the retired takeover requests with it
  delete from public.students where id = any (v_student_ids);

  perform set_config('app.deleting_student', 'on', true);
  delete from public.lessons where id = any (v_orphans);
  perform set_config('app.deleting_student', '', true);

  -- the parents of these students lose the parent role when no child is left, and the profile too when nothing else is
  delete from public.parents pa
   where pa.profile_id = any (v_parent_ids)
     and not exists (select 1 from public.parent_students ps where ps.parent_id = pa.profile_id);
  delete from public.profiles p
   where p.id = any (v_parent_ids)
     and not p.is_admin
     and not exists (select 1 from public.teachers t where t.profile_id = p.id)
     and not exists (select 1 from public.students s where s.profile_id = p.id)
     and not exists (select 1 from public.parents pa where pa.profile_id = p.id);

  -- the notices written for others (the person's own go with the profile)
  update public.notifications n
     set payload = private.blank_person_in_payload(n.payload, v_names, p_profile_id)
   where n.recipient_id <> p_profile_id
     and private.blank_person_in_payload(n.payload, v_names, p_profile_id) is distinct from n.payload;

  delete from public.parents where profile_id = p_profile_id;
  -- takes the phone number, devices, notices and requests of the person with it
  delete from public.profiles where id = p_profile_id;
  -- the profile pointed at the account, so the account goes last
  if v_profile.user_id is not null then
    delete from auth.users where id = v_profile.user_id;
  end if;
end $$;

revoke all on function public.erase_person(uuid) from public, anon;
grant execute on function public.erase_person(uuid) to authenticated;

-- The administrator's list of parents ---------------------------------------------------------------------------------------
-- A parent with a child cannot be erased, so the list says which children; the screen shows the way out.
create function public.admin_list_parents()
returns table (profile_id uuid, first_name text, last_name text, email text, created_at timestamptz, child_names text[])
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  return query
  select p.id, p.first_name, p.last_name, p.email, p.created_at,
         coalesce((
           select array_agg(sp.first_name || ' ' || sp.last_name order by sp.last_name, sp.first_name)
             from public.parent_students ps
             join public.students s on s.id = ps.student_id
             join public.profiles sp on sp.id = s.profile_id
            where ps.parent_id = p.id
         ), '{}')
    from public.parents pa
    join public.profiles p on p.id = pa.profile_id
   where p.erased_at is null
   order by p.created_at desc, p.id;
end $$;

revoke all on function public.admin_list_parents() from public, anon;
grant execute on function public.admin_list_parents() to authenticated;
