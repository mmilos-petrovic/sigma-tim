-- Functions that change who is who: pre-approving people, takeover requests and deactivating a teacher.
-- All are SECURITY DEFINER and check the caller themselves; none is callable by anon.

-- Finds or creates the profile for an email. An existing profile keeps its name: whoever adds someone
-- the second time does not get to rename them.
create function private.upsert_profile(p_email text, p_first_name text, p_last_name text) returns uuid
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
  on conflict (email) do nothing;

  select id into v_id from public.profiles where email = v_email;
  return v_id;
end $$;

-- Admin adds a teacher by email; the person is recognised when they first sign in with Google.
create function public.create_teacher(p_email text, p_first_name text, p_last_name text, p_subject_ids uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile uuid;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_subject_ids is null or cardinality(p_subject_ids) = 0 then
    raise exception 'a teacher needs at least one subject' using errcode = 'PT400';
  end if;

  v_profile := private.upsert_profile(p_email, p_first_name, p_last_name);
  if exists (select 1 from public.teachers where profile_id = v_profile) then
    raise exception 'this person is already a teacher' using errcode = 'PT409';
  end if;

  insert into public.teachers (profile_id) values (v_profile);
  insert into public.teacher_subjects (teacher_id, subject_id)
  select v_profile, s from unnest(p_subject_ids) as s group by s;

  return v_profile;
end $$;

-- A teacher adds a student of their own; admin may pick the teacher or leave the student unassigned.
-- The same person can be added by a second teacher: that is a second record (see the students table).
create function public.add_student(
  p_email text, p_first_name text, p_last_name text,
  p_school text default null, p_grade text default null, p_class_section text default null,
  p_teacher_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_admin boolean := private.is_admin();
  v_teacher uuid;
  v_profile uuid;
  v_student uuid;
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

  v_profile := private.upsert_profile(p_email, p_first_name, p_last_name);

  if exists (select 1 from public.students where profile_id = v_profile and teacher_id is not distinct from v_teacher) then
    raise exception 'this person is already a student of this teacher' using errcode = 'PT409';
  end if;

  insert into public.students (profile_id, school, grade, class_section, teacher_id)
  values (v_profile, nullif(btrim(p_school), ''), nullif(btrim(p_grade), ''), nullif(btrim(p_class_section), ''), v_teacher)
  returning id into v_student;

  return v_student;
end $$;

-- Links a parent to a student by email, creating the parent's profile only if there is none yet.
create function public.add_parent_to_student(p_student_id uuid, p_email text, p_first_name text, p_last_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile uuid;
begin
  if not (private.is_admin() or private.is_teacher_of(p_student_id)) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  v_profile := private.upsert_profile(p_email, p_first_name, p_last_name);
  insert into public.parents (profile_id) values (v_profile) on conflict do nothing;

  if not exists (select 1 from public.parent_students where parent_id = v_profile and student_id = p_student_id) then
    insert into public.parent_students (parent_id, student_id) values (v_profile, p_student_id);
  end if;

  return v_profile;
end $$;

-- Takeover of unassigned students ---------------------------------------------------------------------------------

create function public.request_takeover(p_student_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_current uuid;
  v_request uuid;
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select teacher_id into v_current from public.students where id = p_student_id;
  if not found then
    raise exception 'student not found' using errcode = 'PT404';
  end if;
  if v_current is not null then
    raise exception 'the student already has a teacher' using errcode = 'PT409';
  end if;
  if exists (
    select 1 from public.takeover_requests
     where student_id = p_student_id and teacher_id = v_me and status = 'pending'
  ) then
    raise exception 'there is already a pending request' using errcode = 'PT409';
  end if;

  insert into public.takeover_requests (student_id, teacher_id) values (p_student_id, v_me) returning id into v_request;
  return v_request;
end $$;

create function public.approve_takeover(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.takeover_requests;
  v_current uuid;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select * into v_request from public.takeover_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'the request is already resolved' using errcode = 'PT409';
  end if;

  select teacher_id into v_current from public.students where id = v_request.student_id for update;
  if v_current is not null then
    raise exception 'the student already has a teacher' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.teachers where profile_id = v_request.teacher_id and is_active) then
    raise exception 'the requesting teacher is not active' using errcode = 'PT409';
  end if;

  begin
    update public.students set teacher_id = v_request.teacher_id where id = v_request.student_id;
  exception when unique_violation then
    raise exception 'this person is already a student of that teacher' using errcode = 'PT409';
  end;

  update public.takeover_requests
     set status = 'approved', resolved_at = now(), resolved_by = private.current_profile_id()
   where id = p_request_id;
  -- competing requests for the same student are over
  update public.takeover_requests
     set status = 'rejected', resolved_at = now(), resolved_by = private.current_profile_id()
   where student_id = v_request.student_id and status = 'pending';
end $$;

create function public.reject_takeover(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_status public.takeover_status;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select status into v_status from public.takeover_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_status <> 'pending' then
    raise exception 'the request is already resolved' using errcode = 'PT409';
  end if;

  update public.takeover_requests
     set status = 'rejected', resolved_at = now(), resolved_by = private.current_profile_id()
   where id = p_request_id;
end $$;

-- Deactivation ------------------------------------------------------------------------------------------------------------
-- Keeps the teacher, their past lessons and their CV row. Deletes every future lesson and slot (the participants are
-- told), releases the students as "unassigned" and closes the teacher's pending takeover requests.
create function public.deactivate_teacher(p_teacher_id uuid) returns void
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

  -- read by the BEFORE DELETE trigger on lessons
  perform set_config('app.cancel_reason', 'teacher_deactivated', true);
  delete from public.lessons where teacher_id = p_teacher_id and start_at > now();
  perform set_config('app.cancel_reason', '', true);

  update public.students set teacher_id = null where teacher_id = p_teacher_id;
  update public.takeover_requests
     set status = 'rejected', resolved_at = now(), resolved_by = private.current_profile_id()
   where teacher_id = p_teacher_id and status = 'pending';
  update public.teachers set is_active = false where profile_id = p_teacher_id;
end $$;

revoke all on function public.create_teacher(text, text, text, uuid[]) from public, anon;
revoke all on function public.add_student(text, text, text, text, text, text, uuid) from public, anon;
revoke all on function public.add_parent_to_student(uuid, text, text, text) from public, anon;
revoke all on function public.request_takeover(uuid) from public, anon;
revoke all on function public.approve_takeover(uuid) from public, anon;
revoke all on function public.reject_takeover(uuid) from public, anon;
revoke all on function public.deactivate_teacher(uuid) from public, anon;

grant execute on function public.create_teacher(text, text, text, uuid[]) to authenticated;
grant execute on function public.add_student(text, text, text, text, text, text, uuid) to authenticated;
grant execute on function public.add_parent_to_student(uuid, text, text, text) to authenticated;
grant execute on function public.request_takeover(uuid) to authenticated;
grant execute on function public.approve_takeover(uuid) to authenticated;
grant execute on function public.reject_takeover(uuid) to authenticated;
grant execute on function public.deactivate_teacher(uuid) to authenticated;
