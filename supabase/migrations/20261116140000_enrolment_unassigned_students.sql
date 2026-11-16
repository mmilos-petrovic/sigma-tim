-- Phase 7-4a, part 2: students nobody teaches (the ones a teacher left behind, and the ones an administrator added without a
-- teacher) join the same pool as the sign-ups, and who sees them follows the subject.
--
--  * every unassigned student has an enrolment request (source `legacy`, or `teacher` when a teacher put them there), made
--    by a trigger, so the two ways in and the two ways out cannot drift apart;
--  * its subject is the subject of the student's last lesson; without a lesson there is no subject, and a request without
--    a subject is seen by every teacher until the student (or a parent) picks one (`set_enrolment_subject`);
--  * a teacher reads an unassigned student (and the student's profile, phone and parents, which follow the student) only
--    when the request is for a subject they teach, or has none;
--  * a student, and a parent, read the CV of the student's own teacher whatever its two switches say.
--
-- The old takeover functions are left alone here: the teacher and administrator screens still call them. Placing a teacher
-- by any route (also approve_takeover) marks the request as assigned. They go in Phase 7d together with those screens.

-- The subject of the student's latest lesson, or null.
create function private.last_lesson_subject(p_student_id uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select l.subject_id
    from public.lesson_students ls join public.lessons l on l.id = ls.lesson_id
   where ls.student_id = p_student_id
   order by l.start_at desc
   limit 1
$$;

-- Makes sure an unassigned student has an open request. A student who had one before (signed up, was placed, then lost the
-- teacher) gets the same request back, open and waiting from now, with what they typed.
create function private.ensure_unassigned_request(p_student_id uuid) returns void
language sql security definer set search_path = '' as $$
  insert into public.enrolment_requests (
    applicant_id, applicant_role, source, student_id, subject_id, student_first_name, student_last_name, contact_phone,
    school, grade, profile_completed_at, listed_at, window_started_at)
  select s.profile_id, 'student', 'legacy', s.id, private.last_lesson_subject(s.id), p.first_name, p.last_name, ph.phone,
         nullif(btrim(s.school), ''), nullif(btrim(s.grade), ''),
         case when ph.phone is not null and nullif(btrim(s.school), '') is not null and nullif(btrim(s.grade), '') is not null
              then now() end,
         now(), now()
    from public.students s
    join public.profiles p on p.id = s.profile_id
    left join public.person_phones ph on ph.profile_id = s.profile_id
   where s.id = p_student_id and s.teacher_id is null
  on conflict (student_id) do update
    set status = 'open',
        source = 'legacy',
        subject_id = coalesce(excluded.subject_id, public.enrolment_requests.subject_id),
        listed_at = now(),
        window_started_at = now(),
        restarts = 0,
        choice_opened_at = null,
        chosen_teacher_id = null,
        chosen_by = null,
        chosen_at = null,
        assigned_at = null
$$;

create function private.students_became_unassigned() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.ensure_unassigned_request(new.id);
  return null;
end $$;

-- Whatever places the teacher (a person's choice, the administrator, the old takeover) closes the request.
create function private.students_got_a_teacher() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.enrolment_requests
     set status = 'assigned', chosen_teacher_id = new.teacher_id, assigned_at = coalesce(assigned_at, now())
   where student_id = new.id and status in ('open', 'chosen');
  delete from public.enrolment_offers
   where request_id in (select id from public.enrolment_requests where student_id = new.id) and teacher_id <> new.teacher_id;
  return null;
end $$;

create trigger students_unassigned_on_insert
  after insert on public.students
  for each row when (new.teacher_id is null)
  execute function private.students_became_unassigned();

create trigger students_unassigned_on_update
  after update of teacher_id on public.students
  for each row when (old.teacher_id is not null and new.teacher_id is null)
  execute function private.students_became_unassigned();

create trigger students_placed_on_update
  after update of teacher_id on public.students
  for each row when (old.teacher_id is null and new.teacher_id is not null)
  execute function private.students_got_a_teacher();

-- the students who are unassigned today
select private.ensure_unassigned_request(id) from public.students where teacher_id is null;

-- A student a teacher adds to the pool: the trigger has made the request, this fills it in.
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

-- Who sees an unassigned student ----------------------------------------------------------------------------------------------------
-- A teacher sees the student when the request is for a subject they teach, or has no subject yet (or there is no request).
create function private.teacher_may_see_unassigned(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_teacher_id() is not null
     and (
       not exists (select 1 from public.enrolment_requests r where r.student_id = p_student_id)
       or exists (
         select 1 from public.enrolment_requests r
          where r.student_id = p_student_id and private.teacher_teaches(private.current_teacher_id(), r.subject_id)
       )
     )
$$;

create or replace function private.can_teacher_see_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
     where s.id = p_student_id
       and private.current_teacher_id() is not null
       and (s.teacher_id = private.current_teacher_id()
            or (s.teacher_id is null and private.teacher_may_see_unassigned(s.id)))
  )
$$;

drop policy students_select on public.students;
create policy students_select on public.students for select to authenticated
  using (
    (select private.is_admin())
    or id in (select private.my_student_ids())
    or teacher_id = (select private.current_teacher_id())
    or (teacher_id is null and private.teacher_may_see_unassigned(id))
  );

-- A student who has no subject yet (the ones a teacher left behind without a lesson) says which one they want; the person
-- who signed up or a parent does it. Offers from teachers of other subjects go.
create function public.set_enrolment_subject(p_request_id uuid, p_subject_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
begin
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found or not private.can_act_on_request(p_request_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.status <> 'open' or v_request.source = 'signup' then
    raise exception 'the subject cannot be changed here' using errcode = 'PT409';
  end if;
  if p_subject_id is null or not exists (
       select 1 from public.teacher_subjects ts join public.teachers t on t.profile_id = ts.teacher_id and t.is_active
        where ts.subject_id = p_subject_id) then
    raise exception 'nobody teaches this subject' using errcode = 'PT400';
  end if;

  update public.enrolment_requests set subject_id = p_subject_id where id = p_request_id;
  delete from public.enrolment_offers o
   where o.request_id = p_request_id
     and not exists (select 1 from public.teacher_subjects ts where ts.teacher_id = o.teacher_id and ts.subject_id = p_subject_id);
end $$;

revoke all on function public.set_enrolment_subject(uuid, uuid) from public, anon;
grant execute on function public.set_enrolment_subject(uuid, uuid) to authenticated;

-- CVs -----------------------------------------------------------------------------------------------------------------------------------
-- The CV of a student's own teacher is readable by the student and the parents whatever the "signed-in users" switch says
-- (the public switch is for the landing page and has nothing to do with it).
create or replace function private.list_cvs(p_public boolean)
returns table (slug text, first_name text, last_name text, about text, photo_path text, subjects text[], updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.slug, p.first_name, p.last_name, c.about, c.photo_path,
         array(
           select s.name
             from public.teacher_subjects ts join public.subjects s on s.id = ts.subject_id
            where ts.teacher_id = c.teacher_id
            order by s.name
         ),
         c.updated_at
    from public.teacher_cv c
    join public.teachers t on t.profile_id = c.teacher_id and t.is_active
    join public.profiles p on p.id = c.teacher_id
   where case when p_public then c.show_public else (c.show_members or private.is_student_of_teacher(c.teacher_id)) end
   order by p.last_name, p.first_name
$$;

create or replace function private.get_cv(p_slug text, p_public boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.cv_json(c.id)
    from public.teacher_cv c
    join public.teachers t on t.profile_id = c.teacher_id and t.is_active
   where c.slug = p_slug
     and case when p_public then c.show_public else (c.show_members or private.is_student_of_teacher(c.teacher_id)) end
$$;

-- Assigning needs a finished profile only when there is no student record yet (a sign-up): a student the school already
-- knows (one a teacher left behind, one a teacher added) has all the data they need.
create or replace function public.admin_assign_enrolment(p_request_id uuid, p_teacher_id uuid, p_child_email text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found or v_request.status not in ('open', 'chosen') then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.profile_completed_at is null and v_request.student_id is null then
    raise exception 'the profile is not complete yet' using errcode = 'PT409';
  end if;
  if not exists (select 1 from public.teachers where profile_id = p_teacher_id and is_active) then
    raise exception 'unknown teacher' using errcode = 'PT400';
  end if;
  if v_request.status = 'chosen' and v_request.chosen_teacher_id is distinct from p_teacher_id then
    update public.enrolment_requests set status = 'open', chosen_teacher_id = null, chosen_by = null, chosen_at = null
     where id = p_request_id;
  end if;
  return private.place_enrolment(p_request_id, p_teacher_id, 'admin', p_child_email);
end $$;
