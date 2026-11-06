-- The administrator erases a teacher's whole profile.
--
-- Everything that is only about the person goes: the teacher role with its CV and subjects, and the same person's
-- student and parent roles, devices and waiting notices. Lessons still to come are cancelled (the participants are
-- told) and the teacher's students become unassigned, exactly as in deactivate_teacher.
--
-- A lesson that already started is the record of what happened and is never deleted. It points at its teacher, so when
-- the teacher has one the profile row stays as an inactive record: the name stays (the administrator can tell who
-- taught), everything else is cleared, and the email is replaced by a placeholder so the real address is free again.
-- A teacher with no such lesson is deleted completely. The Google account itself is left alone: without a profile it is
-- an unknown account that sees "not a member".

alter table public.profiles add column erased_at timestamptz;

-- What deactivating and erasing a teacher have in common ------------------------------------------------------------------
create function private.release_teacher(p_teacher_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  -- read by the BEFORE DELETE trigger on lessons
  perform set_config('app.cancel_reason', 'teacher_deactivated', true);
  delete from public.lessons where teacher_id = p_teacher_id and start_at > now();
  perform set_config('app.cancel_reason', '', true);

  update public.students set teacher_id = null where teacher_id = p_teacher_id;
  update public.takeover_requests
     set status = 'rejected', resolved_at = now(), resolved_by = private.current_profile_id()
   where teacher_id = p_teacher_id and status = 'pending';
end $$;

create or replace function public.deactivate_teacher(p_teacher_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_active boolean;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select is_active into v_active from public.teachers where profile_id = p_teacher_id for update;
  if not found then
    raise exception 'teacher not found' using errcode = 'PT404';
  end if;
  if not v_active then
    raise exception 'the teacher is already deactivated' using errcode = 'PT409';
  end if;

  perform private.release_teacher(p_teacher_id);
  update public.teachers set is_active = false where profile_id = p_teacher_id;
end $$;

-- An erased person cannot be brought back or given another email: they are only a record now ------------------------------
create or replace function public.reactivate_teacher(p_teacher_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_active boolean;
  v_erased timestamptz;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select t.is_active, p.erased_at into v_active, v_erased
    from public.teachers t join public.profiles p on p.id = t.profile_id
   where t.profile_id = p_teacher_id
     for update of t, p;  -- the profile too: its erased_at must be read after a running erase has finished
  if not found then
    raise exception 'teacher not found' using errcode = 'PT404';
  end if;
  if v_erased is not null then
    raise exception 'this person was erased' using errcode = 'PT409';
  end if;
  if v_active then
    raise exception 'the teacher is already active' using errcode = 'PT409';
  end if;

  update public.teachers set is_active = true where profile_id = p_teacher_id;
end $$;

create or replace function private.apply_email_change(p_profile_id uuid, p_new_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_new_email, '')));
  v_current text;
  v_erased timestamptz;
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email' using errcode = 'PT400';
  end if;

  select email, erased_at into v_current, v_erased from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'person not found' using errcode = 'PT404';
  end if;
  if v_erased is not null then
    raise exception 'this person was erased' using errcode = 'PT409';
  end if;
  if p_profile_id = private.current_profile_id() then
    raise exception 'you cannot change your own email' using errcode = 'PT403';
  end if;

  if v_current = v_email then
    return;
  end if;
  begin
    update public.profiles set email = v_email, user_id = null, avatar_url = null where id = p_profile_id;
  exception when unique_violation then
    -- the address belongs to somebody else (the column is unique)
    raise exception 'this email already belongs to another person' using errcode = 'PT409';
  end;

  perform private.link_profile_to_google_account(p_profile_id);
end $$;

-- Erasing -------------------------------------------------------------------------------------------------------------------
-- Returns 'deleted' (nothing is left) or 'kept_history' (the profile stays as an inactive record behind the lessons that
-- took place). Not for administrators: an admin who teaches stops being one first.
create function public.erase_teacher(p_teacher_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_is_admin boolean;
  v_erased timestamptz;
  v_student_ids uuid[];
  v_parent_ids uuid[];
  v_lesson public.lessons;
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

  for v_lesson in
    select l.* from public.lessons l
     where l.start_at > now()
       and exists (select 1 from public.lesson_students ls where ls.lesson_id = l.id and ls.student_id = any (v_student_ids))
       for update of l
  loop
    if exists (
      select 1 from public.lesson_students ls
       where ls.lesson_id = v_lesson.id and not (ls.student_id = any (v_student_ids))
    ) then
      perform private.enqueue_participant_left(
        v_lesson.id,
        (select array_agg(ls.student_id) from public.lesson_students ls
          where ls.lesson_id = v_lesson.id and ls.student_id = any (v_student_ids))
      );
      -- the erased student's row on this lesson goes with their student record below
    elsif v_lesson.origin = 'teacher' then
      delete from public.lessons where id = v_lesson.id;
    else
      -- a booked free slot: back to open (the participant row goes with the student record below)
      perform private.enqueue_cancellation(v_lesson.id, 'cancelled');
      update public.lessons set status = 'open', outcome = null where id = v_lesson.id;
    end if;
  end loop;

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

revoke all on function public.erase_teacher(uuid) from public, anon;
grant execute on function public.erase_teacher(uuid) to authenticated;
