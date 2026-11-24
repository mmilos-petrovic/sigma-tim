-- The profile of a student or a parent, and more than one request for lessons.
--
-- 1. A student or a parent has to confirm their profile once before they see anything else: a person a teacher added sees what
--    the teacher entered and says it is right (or fills in what is missing); a person who signed up through the form has done it
--    in the request. `profiles.profile_confirmed_at` is that moment (it is also the moment the privacy policy was accepted).
--    People who already have lessons count as confirmed.
-- 2. The profile can be changed afterwards (`my_profile`, `save_my_profile`): the person's own phone, and for each student the
--    name, phone, school, grade, the part of the town and a free note. A parent keeps one profile per child.
-- 3. A student may have several requests for lessons, one for each subject, and a parent may ask for a new subject for a child
--    who is a student already (the profile is reused: only the subject is asked).
-- 5. The person accepts an offer as soon as it has arrived: the choice no longer waits for days or for several offers.
-- 4. The student may say who teaches them at school (`school_teacher`, optional), with the school and the grade.

-- Confirmation ---------------------------------------------------------------------------------------------------------------------
alter table public.profiles add column profile_confirmed_at timestamptz;

-- Already in the app: a student with a lesson, a parent of one, and whoever accepted the policy while signing up.
update public.profiles p
   set profile_confirmed_at = now()
 where exists (select 1 from public.students s join public.lesson_students ls on ls.student_id = s.id
                where s.profile_id = p.id)
    or exists (select 1 from public.parent_students ps join public.lesson_students ls on ls.student_id = ps.student_id
                where ps.parent_id = p.id)
    or exists (select 1 from public.enrolment_requests r
                where r.applicant_id = p.id and r.source = 'signup' and r.consent_at is not null);

-- Only for the students: what the form of the request also asks, kept for a student who has no request.
create table public.student_details (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  city_part text check (char_length(city_part) <= 100),
  situation text check (char_length(situation) <= 1000),
  school_teacher text check (char_length(school_teacher) <= 100)
);
alter table public.student_details enable row level security;

alter table public.enrolment_requests add column school_teacher text check (char_length(school_teacher) <= 100);

-- The client needs to know whether to show the profile before anything else.
drop function public.my_roles();
create function public.my_roles()
returns table (
  profile_id uuid,
  email text,
  first_name text,
  last_name text,
  avatar_url text,
  is_admin boolean,
  is_teacher boolean,
  is_student boolean,
  is_parent boolean,
  is_main_admin boolean,
  profile_confirmed boolean
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.first_name, p.last_name, p.avatar_url, p.is_admin,
         exists (select 1 from public.teachers t where t.profile_id = p.id and t.is_active),
         exists (select 1 from public.students s where s.profile_id = p.id),
         exists (select 1 from public.parents pa where pa.profile_id = p.id),
         p.is_main_admin,
         p.profile_confirmed_at is not null
    from public.profiles p
   where p.user_id = auth.uid()
$$;

revoke all on function public.my_roles() from public, anon;
grant execute on function public.my_roles() to authenticated;

-- The people whose profile a person looks after: themselves (when they are a student) and the students they are a parent of.
create function private.member_people(p_me uuid) returns table (pid uuid, is_self boolean)
language sql stable security definer set search_path = '' as $$
  select p_me, true where exists (select 1 from public.students s where s.profile_id = p_me)
  union
  select distinct s.profile_id, false
    from public.parent_students ps join public.students s on s.id = ps.student_id
   where ps.parent_id = p_me and s.profile_id <> p_me
$$;

-- The newest school and grade somebody entered for a student (a student with two teachers has two records).
create function private.student_school(p_profile_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.school from public.students s
   where s.profile_id = p_profile_id and btrim(coalesce(s.school, '')) <> ''
   order by s.created_at desc limit 1
$$;

create function private.student_grade(p_profile_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.grade from public.students s
   where s.profile_id = p_profile_id and btrim(coalesce(s.grade, '')) <> ''
   order by s.created_at desc limit 1
$$;

-- Reading the profile -------------------------------------------------------------------------------------------------------------
-- { confirmed, is_parent, phone (the caller's own), people: [{ profile_id, self, first_name, last_name, email, phone, school,
--   grade, city_part, school_teacher, situation }] }. The phone of the caller is also the phone of the person who is the caller.
create function public.my_profile() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.current_profile_id();
begin
  if v_me is null or not (
       exists (select 1 from public.students where profile_id = v_me)
       or exists (select 1 from public.parents where profile_id = v_me)) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  return jsonb_build_object(
    'confirmed', (select profile_confirmed_at is not null from public.profiles where id = v_me),
    'is_parent', exists (select 1 from public.parents where profile_id = v_me),
    'phone', (select ph.phone from public.person_phones ph where ph.profile_id = v_me),
    'people', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'profile_id', p.id,
                 'self', m.is_self,
                 'first_name', p.first_name,
                 'last_name', p.last_name,
                 'email', p.email,
                 'phone', (select ph.phone from public.person_phones ph where ph.profile_id = p.id),
                 'school', private.student_school(p.id),
                 'grade', private.student_grade(p.id),
                 'city_part', d.city_part,
                 'school_teacher', d.school_teacher,
                 'situation', d.situation)
               order by m.is_self desc, p.first_name, p.last_name, p.id)
        from private.member_people(v_me) m
        join public.profiles p on p.id = m.pid
        left join public.student_details d on d.profile_id = p.id
    ), '[]')
  );
end $$;

-- Saving it --------------------------------------------------------------------------------------------------------------------------
-- `p_phone` is the caller's own number (a parent needs one, a student may leave it out). `p_people` has one entry for each of
-- the people `my_profile` lists, with the same keys; the number of the caller as a student is `p_phone`, so an entry for the
-- caller has no phone of its own. The first save also takes the privacy policy; it confirms the profiles of all the children.
create function public.save_my_profile(p_phone text, p_people jsonb, p_consent boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_profile_id();
  v_confirmed timestamptz;
  v_erased timestamptz;
  v_is_parent boolean;
  v_own text;
  v_person jsonb;
  v_pid uuid;
  v_self boolean;
  v_first text;
  v_last text;
  v_school text;
  v_grade text;
  v_city text;
  v_teacher text;
  v_situation text;
  v_phone text;
  v_seen uuid[] := '{}';
  v_request uuid;
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  select profile_confirmed_at, erased_at into v_confirmed, v_erased from public.profiles where id = v_me for update;
  if v_erased is not null then
    raise exception 'this person was erased' using errcode = 'PT409';
  end if;
  v_is_parent := exists (select 1 from public.parents where profile_id = v_me);
  if not v_is_parent and not exists (select 1 from public.students where profile_id = v_me) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_people is null or jsonb_typeof(p_people) <> 'array' then
    raise exception 'the people have to be a list' using errcode = 'PT400';
  end if;

  if btrim(coalesce(p_phone, '')) = '' then
    if v_is_parent then
      raise exception 'a parent needs a phone number' using errcode = 'PT400';
    end if;
    v_own := null;
  else
    v_own := private.normalize_phone(p_phone);
    if v_own is null then
      raise exception 'invalid phone number' using errcode = 'PT400';
    end if;
  end if;
  if v_confirmed is null and not coalesce(p_consent, false) then
    raise exception 'the privacy policy has to be accepted' using errcode = 'PT400';
  end if;

  -- every one of them, once
  for v_person in select * from jsonb_array_elements(p_people) loop
    begin
      v_pid := (v_person ->> 'profile_id')::uuid;
    exception when others then
      raise exception 'invalid person' using errcode = 'PT400';
    end;
    if v_pid is null or v_pid = any (v_seen) then
      raise exception 'invalid person' using errcode = 'PT400';
    end if;
    select m.is_self into v_self from private.member_people(v_me) m where m.pid = v_pid;
    if not found then
      raise exception 'not allowed' using errcode = 'PT403';
    end if;
    v_seen := v_seen || v_pid;

    v_first := btrim(coalesce(v_person ->> 'first_name', ''));
    v_last := btrim(coalesce(v_person ->> 'last_name', ''));
    v_school := btrim(coalesce(v_person ->> 'school', ''));
    v_grade := btrim(coalesce(v_person ->> 'grade', ''));
    v_city := nullif(btrim(coalesce(v_person ->> 'city_part', '')), '');
    v_teacher := nullif(btrim(coalesce(v_person ->> 'school_teacher', '')), '');
    v_situation := nullif(btrim(coalesce(v_person ->> 'situation', '')), '');
    if v_first = '' or v_last = '' or char_length(v_first) > 100 or char_length(v_last) > 100 then
      raise exception 'first and last name are required' using errcode = 'PT400';
    end if;
    if v_school = '' or char_length(v_school) > 200 then
      raise exception 'the school is required' using errcode = 'PT400';
    end if;
    if v_grade = '' or char_length(v_grade) > 50 then
      raise exception 'the grade is required' using errcode = 'PT400';
    end if;
    if char_length(coalesce(v_city, '')) > 100 or char_length(coalesce(v_teacher, '')) > 100
       or char_length(coalesce(v_situation, '')) > 1000 then
      raise exception 'the text is too long' using errcode = 'PT400';
    end if;

    -- the number of the person: the caller's own for the caller, an optional one for a child
    if v_self then
      v_phone := v_own;
    elsif btrim(coalesce(v_person ->> 'phone', '')) = '' then
      v_phone := null;
    else
      v_phone := private.normalize_phone(v_person ->> 'phone');
      if v_phone is null then
        raise exception 'invalid phone number' using errcode = 'PT400';
      end if;
    end if;

    update public.profiles set first_name = v_first, last_name = v_last where id = v_pid;
    update public.students set school = v_school, grade = v_grade where profile_id = v_pid;
    if v_city is null and v_teacher is null and v_situation is null then
      delete from public.student_details where profile_id = v_pid;
    else
      insert into public.student_details (profile_id, city_part, school_teacher, situation)
      values (v_pid, v_city, v_teacher, v_situation)
      on conflict (profile_id) do update
        set city_part = excluded.city_part, school_teacher = excluded.school_teacher, situation = excluded.situation;
    end if;
    if v_phone is null then
      -- a parent's number cannot be taken away; a parent who is also a student is covered by the check above
      if not (v_pid = v_me and v_is_parent) then
        delete from public.person_phones where profile_id = v_pid;
      end if;
    else
      insert into public.person_phones (profile_id, phone) values (v_pid, v_phone)
      on conflict (profile_id) do update set phone = excluded.phone;
    end if;
    update public.profiles set profile_confirmed_at = coalesce(profile_confirmed_at, now()) where id = v_pid;

    -- a request the school made for this student that waits for the profile has it now
    for v_request in
      select r.id from public.enrolment_requests r join public.students s on s.id = r.student_id
       where s.profile_id = v_pid and r.status = 'open' and r.profile_completed_at is null
    loop
      update public.enrolment_requests
         set student_first_name = v_first, student_last_name = v_last, school = v_school, grade = v_grade,
             city_part = v_city, school_teacher = v_teacher, situation = v_situation,
             contact_phone = coalesce(v_phone, v_own)
       where id = v_request;
      update public.enrolment_requests
         set consent_at = coalesce(consent_at, now()), profile_completed_at = now()
       where id = v_request and contact_phone is not null;
      perform private.refresh_listing(v_request);
    end loop;
  end loop;

  if exists (select 1 from private.member_people(v_me) m where m.pid <> all (v_seen)) then
    raise exception 'every person has to be in the list' using errcode = 'PT400';
  end if;

  if v_own is not null then
    insert into public.person_phones (profile_id, phone) values (v_me, v_own)
    on conflict (profile_id) do update set phone = excluded.phone;
  end if;
  update public.profiles set profile_confirmed_at = coalesce(profile_confirmed_at, now()) where id = v_me;
end $$;

revoke all on function public.my_profile() from public, anon;
revoke all on function public.save_my_profile(text, jsonb, boolean) from public, anon;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.save_my_profile(text, jsonb, boolean) to authenticated;

-- A request made through the form confirms the profile too (the policy was accepted there).
drop function public.complete_enrolment_profile(uuid, text, text, text, text, text, text, text, boolean);
create function public.complete_enrolment_profile(
  p_request_id uuid, p_first_name text, p_last_name text, p_phone text, p_school text, p_grade text,
  p_city_part text default null, p_situation text default null, p_consent boolean default false,
  p_school_teacher text default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
  v_phone text;
begin
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found or not private.can_act_on_request(p_request_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.status <> 'open' then
    raise exception 'a teacher was already chosen' using errcode = 'PT409';
  end if;

  if btrim(coalesce(p_first_name, '')) = '' or btrim(coalesce(p_last_name, '')) = ''
     or char_length(btrim(p_first_name)) > 100 or char_length(btrim(p_last_name)) > 100 then
    raise exception 'first and last name are required' using errcode = 'PT400';
  end if;
  v_phone := private.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'a valid phone number is required' using errcode = 'PT400';
  end if;
  if btrim(coalesce(p_school, '')) = '' or char_length(btrim(p_school)) > 200 then
    raise exception 'the school is required' using errcode = 'PT400';
  end if;
  if btrim(coalesce(p_grade, '')) = '' or char_length(btrim(p_grade)) > 50 then
    raise exception 'the grade is required' using errcode = 'PT400';
  end if;
  if char_length(coalesce(p_city_part, '')) > 100 or char_length(coalesce(p_situation, '')) > 1000
     or char_length(btrim(coalesce(p_school_teacher, ''))) > 100 then
    raise exception 'the text is too long' using errcode = 'PT400';
  end if;
  if v_request.source = 'signup' and v_request.consent_at is null and not coalesce(p_consent, false) then
    raise exception 'the privacy policy has to be accepted' using errcode = 'PT400';
  end if;

  update public.enrolment_requests
     set student_first_name = btrim(p_first_name),
         student_last_name = btrim(p_last_name),
         contact_phone = v_phone,
         school = btrim(p_school),
         grade = btrim(p_grade),
         city_part = nullif(btrim(coalesce(p_city_part, '')), ''),
         school_teacher = nullif(btrim(coalesce(p_school_teacher, '')), ''),
         situation = nullif(btrim(coalesce(p_situation, '')), ''),
         consent_at = case when source = 'signup' then coalesce(consent_at, now()) else consent_at end,
         profile_completed_at = coalesce(profile_completed_at, now())
   where id = p_request_id;

  if v_request.source = 'signup' then
    update public.profiles set profile_confirmed_at = coalesce(profile_confirmed_at, now())
     where id = v_request.applicant_id;
  end if;

  perform private.refresh_listing(p_request_id);
end $$;

revoke all on function public.complete_enrolment_profile(uuid, text, text, text, text, text, text, text, boolean, text) from public, anon;
grant execute on function public.complete_enrolment_profile(uuid, text, text, text, text, text, text, text, boolean, text) to authenticated;

-- More than one request ------------------------------------------------------------------------------------------------------------
-- A student has one open request for each subject (it was one in all). A parent's request may be about a child who is a student
-- already: then it says which one, and placing a teacher needs no email of the child.
alter table public.enrolment_requests
  add column child_profile_id uuid references public.profiles (id) on delete cascade;

drop index public.enrolment_one_student_signup;
create unique index enrolment_one_student_signup on public.enrolment_requests (applicant_id, subject_id)
  where source = 'signup' and applicant_role = 'student' and status in ('open', 'chosen');
create unique index enrolment_one_child_signup on public.enrolment_requests (applicant_id, child_profile_id, subject_id)
  where source = 'signup' and applicant_role = 'parent' and child_profile_id is not null and status in ('open', 'chosen');

-- The profile of the student (and the number of the person who is the contact) goes into a new request, so only the subject
-- is asked.
create function private.prefill_request(p_request_id uuid, p_person uuid, p_contact uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_consent timestamptz;
begin
  select profile_confirmed_at into v_consent from public.profiles where id = p_contact;
  update public.enrolment_requests r
     set student_first_name = (select p.first_name from public.profiles p where p.id = p_person),
         student_last_name = (select p.last_name from public.profiles p where p.id = p_person),
         contact_phone = (select ph.phone from public.person_phones ph where ph.profile_id = p_contact),
         school = private.student_school(p_person),
         grade = private.student_grade(p_person),
         city_part = (select d.city_part from public.student_details d where d.profile_id = p_person),
         school_teacher = (select d.school_teacher from public.student_details d where d.profile_id = p_person),
         situation = (select d.situation from public.student_details d where d.profile_id = p_person)
   where r.id = p_request_id;
  update public.enrolment_requests
     set consent_at = coalesce(v_consent, now()), profile_completed_at = now()
   where id = p_request_id and student_first_name is not null and student_last_name is not null
     and contact_phone is not null and school is not null and grade is not null;
  perform private.refresh_listing(p_request_id);
end $$;

drop function public.start_enrolment(uuid, text);
create function public.start_enrolment(p_subject_id uuid, p_role text, p_child_id uuid default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_user auth.users;
  v_role public.enrolment_role;
  v_settings public.enrolment_settings;
  v_profile uuid;
  v_meta jsonb;
  v_full text;
  v_first text;
  v_last text;
  v_request uuid;
  v_needs_approval boolean;
begin
  if v_uid is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  begin
    v_role := p_role::public.enrolment_role;
  exception when others then
    raise exception 'role must be student or parent' using errcode = 'PT400';
  end;
  if p_child_id is not null and v_role <> 'parent' then
    raise exception 'only a parent asks for a child' using errcode = 'PT400';
  end if;

  select * into v_user from auth.users where id = v_uid;
  if not found or v_user.email_confirmed_at is null or coalesce(v_user.raw_app_meta_data ->> 'provider', '') <> 'google' then
    raise exception 'a confirmed Google sign-in is required' using errcode = 'PT403';
  end if;

  select * into v_settings from public.enrolment_settings;
  if not v_settings.form_enabled then
    raise exception 'enrolment is off' using errcode = 'PT403';
  end if;
  if p_subject_id is null or not exists (
       select 1 from public.teacher_subjects ts join public.teachers t on t.profile_id = ts.teacher_id and t.is_active
        where ts.subject_id = p_subject_id) then
    raise exception 'nobody teaches this subject' using errcode = 'PT400';
  end if;

  -- one at a time, so the daily count below cannot be passed by two sign-ups at once
  perform pg_advisory_xact_lock(hashtext('enrolment-signup'));

  v_profile := private.current_profile_id();
  if v_profile is not null then
    -- a student and a parent of the school may ask for more lessons; nobody else who is a member
    if private.is_member() and not (
         (v_role = 'parent' and exists (select 1 from public.parents where profile_id = v_profile))
         or (v_role = 'student' and exists (select 1 from public.students where profile_id = v_profile))) then
      raise exception 'this person is already a member of the school' using errcode = 'PT409';
    end if;
    if exists (select 1 from public.profiles where id = v_profile and erased_at is not null) then
      raise exception 'this person was erased' using errcode = 'PT409';
    end if;
  else
    v_meta := coalesce(v_user.raw_user_meta_data, '{}');
    v_full := btrim(coalesce(nullif(btrim(v_meta ->> 'full_name'), ''), nullif(btrim(v_meta ->> 'name'), ''), ''));
    v_first := coalesce(nullif(btrim(v_meta ->> 'given_name'), ''), nullif(split_part(v_full, ' ', 1), ''),
                        nullif(split_part(lower(btrim(v_user.email)), '@', 1), ''), '-');
    v_last := coalesce(nullif(btrim(v_meta ->> 'family_name'), ''), nullif(btrim(substr(v_full, length(split_part(v_full, ' ', 1)) + 1)), ''), '-');
    begin
      insert into public.profiles (email, first_name, last_name, avatar_url)
      values (lower(btrim(v_user.email)), left(v_first, 100), left(v_last, 100), v_meta ->> 'avatar_url');
    exception when unique_violation then
      raise exception 'this email already belongs to another account' using errcode = 'PT409';
    end;
    v_profile := private.current_profile_id();
    if v_profile is null then
      raise exception 'the profile could not be linked' using errcode = 'PT409';
    end if;
  end if;

  -- a child has to be one of the parent's own students
  if p_child_id is not null and not exists (
       select 1 from private.member_people(v_profile) m where m.pid = p_child_id and not m.is_self) then
    raise exception 'child not found' using errcode = 'PT404';
  end if;

  -- asking again for the same thing gives the same request
  select id into v_request
    from public.enrolment_requests
   where applicant_id = v_profile and applicant_role = v_role and source = 'signup' and status = 'open'
     and case
           when v_role = 'student' then subject_id = p_subject_id or profile_completed_at is null
           when p_child_id is not null then subject_id = p_subject_id and child_profile_id = p_child_id
           else subject_id = p_subject_id and profile_completed_at is null and child_profile_id is null
         end
   order by created_at desc limit 1;
  if v_request is not null then
    update public.enrolment_requests set subject_id = p_subject_id
     where id = v_request and profile_completed_at is null and subject_id is distinct from p_subject_id;
    return v_request;
  end if;

  select (count(*) >= v_settings.daily_cap) into v_needs_approval
    from public.enrolment_requests
   where source = 'signup' and private.school_day(created_at) = private.school_day(now());

  begin
    insert into public.enrolment_requests (applicant_id, applicant_role, source, subject_id, needs_approval, child_profile_id)
    values (v_profile, v_role, 'signup', p_subject_id, v_needs_approval, p_child_id)
    returning id into v_request;
  exception when unique_violation then
    raise exception 'there is a request for this subject already' using errcode = 'PT409';
  end;

  -- the profile of a student who is in the school is not asked again
  if v_role = 'student' and exists (select 1 from public.students where profile_id = v_profile) then
    perform private.prefill_request(v_request, v_profile, v_profile);
  elsif p_child_id is not null then
    perform private.prefill_request(v_request, p_child_id, v_profile);
  end if;
  return v_request;
end $$;

revoke all on function public.start_enrolment(uuid, text, uuid) from public, anon;
grant execute on function public.start_enrolment(uuid, text, uuid) to authenticated;

-- The subject of a request is not one the person has a request for already.
create or replace function public.set_enrolment_subject(p_request_id uuid, p_subject_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
begin
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found or not private.can_act_on_request(p_request_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.status <> 'open' then
    raise exception 'the subject cannot be changed here' using errcode = 'PT409';
  end if;
  if p_subject_id is null or not exists (
       select 1 from public.teacher_subjects ts join public.teachers t on t.profile_id = ts.teacher_id and t.is_active
        where ts.subject_id = p_subject_id) then
    raise exception 'nobody teaches this subject' using errcode = 'PT400';
  end if;

  begin
    update public.enrolment_requests set subject_id = p_subject_id where id = p_request_id;
  exception when unique_violation then
    raise exception 'there is a request for this subject already' using errcode = 'PT409';
  end;
  delete from public.enrolment_offers o
   where o.request_id = p_request_id
     and not exists (select 1 from public.teacher_subjects ts where ts.teacher_id = o.teacher_id and ts.subject_id = p_subject_id);
end $$;

-- What a request said about the student stays with the student, where the profile shows it (nothing is overwritten).
create function private.keep_request_details(p_profile_id uuid, p_request public.enrolment_requests) returns void
language sql security definer set search_path = '' as $$
  insert into public.student_details (profile_id, city_part, school_teacher, situation)
  select p_profile_id, p_request.city_part, p_request.school_teacher, p_request.situation
   where p_request.city_part is not null or p_request.school_teacher is not null or p_request.situation is not null
  on conflict (profile_id) do nothing
$$;

-- Placing a teacher: a request about a child who is a student already needs no email, the child is known.
create or replace function private.place_enrolment(p_request_id uuid, p_teacher_id uuid, p_by text, p_child_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
  v_student uuid;
  v_child uuid;
  v_applicant_email text;
  v_name text;
  v_result text := 'assigned';
begin
  select * into v_request from public.enrolment_requests where id = p_request_id for update;

  begin
    if v_request.student_id is not null then
      update public.students set teacher_id = p_teacher_id where id = v_request.student_id and teacher_id is null;
      if not found then
        raise exception 'the student already has a teacher' using errcode = 'PT409';
      end if;
      v_student := v_request.student_id;
    elsif v_request.applicant_role = 'student' then
      update public.profiles set first_name = v_request.student_first_name, last_name = v_request.student_last_name
       where id = v_request.applicant_id;
      insert into public.students (profile_id, school, grade, teacher_id)
      values (v_request.applicant_id, v_request.school, v_request.grade, p_teacher_id)
      returning id into v_student;
      perform private.keep_phone(v_request.applicant_id, v_request.contact_phone);
      perform private.keep_request_details(v_request.applicant_id, v_request);
    elsif v_request.child_profile_id is not null then
      insert into public.students (profile_id, school, grade, teacher_id)
      values (v_request.child_profile_id, v_request.school, v_request.grade, p_teacher_id)
      returning id into v_student;
      insert into public.parents (profile_id) values (v_request.applicant_id) on conflict do nothing;
      insert into public.parent_students (parent_id, student_id) values (v_request.applicant_id, v_student);
      perform private.keep_request_details(v_request.child_profile_id, v_request);
    elsif btrim(coalesce(p_child_email, '')) = '' then
      v_result := 'chosen';
    else
      select email into v_applicant_email from public.profiles where id = v_request.applicant_id;
      if lower(btrim(p_child_email)) = v_applicant_email then
        raise exception 'the child needs an email of their own' using errcode = 'PT400';
      end if;
      v_child := private.upsert_profile(p_child_email, v_request.student_first_name, v_request.student_last_name);
      insert into public.students (profile_id, school, grade, teacher_id)
      values (v_child, v_request.school, v_request.grade, p_teacher_id)
      returning id into v_student;
      insert into public.parents (profile_id) values (v_request.applicant_id) on conflict do nothing;
      insert into public.parent_students (parent_id, student_id) values (v_request.applicant_id, v_student);
      perform private.keep_phone(v_request.applicant_id, v_request.contact_phone);
      perform private.keep_request_details(v_child, v_request);
    end if;
  exception when unique_violation then
    raise exception 'this person is already a student of that teacher' using errcode = 'PT409';
  end;

  if v_result = 'chosen' then
    update public.enrolment_requests
       set status = 'chosen', chosen_teacher_id = p_teacher_id, chosen_by = p_by, chosen_at = now()
     where id = p_request_id;
  else
    update public.enrolment_requests
       set status = 'assigned', student_id = v_student, chosen_teacher_id = p_teacher_id,
           chosen_by = coalesce(chosen_by, p_by), chosen_at = coalesce(chosen_at, now()), assigned_at = now()
     where id = p_request_id;
  end if;
  -- the other offers are closed
  delete from public.enrolment_offers where request_id = p_request_id and teacher_id <> p_teacher_id;

  v_name := v_request.student_first_name || ' ' || v_request.student_last_name;
  if p_by = 'student' then
    perform private.enqueue_enrolment_notice('enrolment_chosen', p_teacher_id, jsonb_build_object(
      'request_id', p_request_id, 'student', v_name, 'subject', (select name from public.subjects where id = v_request.subject_id),
      'needs_child_email', v_result = 'chosen'));
  else
    perform private.enqueue_enrolment_notice('enrolment_assigned', p_teacher_id, jsonb_build_object(
      'request_id', p_request_id, 'student', v_name, 'subject', (select name from public.subjects where id = v_request.subject_id),
      'needs_child_email', v_result = 'chosen'));
    perform private.enqueue_enrolment_notice('enrolment_assigned', r, jsonb_build_object(
      'request_id', p_request_id, 'teacher', (select first_name || ' ' || last_name from public.profiles where id = p_teacher_id),
      'student', v_name))
      from private.enrolment_recipients(p_request_id) r;
  end if;
  return v_result;
end $$;

-- The readers of a request show the teacher at school too --------------------------------------------------------------------------
drop function public.my_enrolment_requests();
create function public.my_enrolment_requests()
returns table (
  id uuid, applicant_role public.enrolment_role, source text, status public.enrolment_status,
  subject_id uuid, subject_name text, student_first_name text, student_last_name text, contact_phone text,
  school text, grade text, city_part text, situation text,
  profile_completed boolean, waiting_for_approval boolean, listed boolean, days_waiting integer,
  offers_count integer, chosen_teacher_id uuid, student_id uuid, school_teacher text
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.applicant_role, r.source, r.status, r.subject_id, sub.name,
         r.student_first_name, r.student_last_name, r.contact_phone, r.school, r.grade, r.city_part, r.situation,
         r.profile_completed_at is not null,
         r.needs_approval and r.approved_at is null,
         r.listed_at is not null,
         case when r.listed_at is null then 0 else greatest(0, floor(extract(epoch from (now() - r.listed_at)) / 86400))::integer end,
         (select count(*)::integer from public.enrolment_offers o join public.teachers t on t.profile_id = o.teacher_id and t.is_active
           where o.request_id = r.id),
         r.chosen_teacher_id, r.student_id, r.school_teacher
    from public.enrolment_requests r
    left join public.subjects sub on sub.id = r.subject_id
   where r.status <> 'rejected' and private.can_act_on_request(r.id)
   order by r.created_at desc
$$;
revoke all on function public.my_enrolment_requests() from public, anon;
grant execute on function public.my_enrolment_requests() to authenticated;

drop function public.list_enrolment_pool();
create function public.list_enrolment_pool()
returns table (
  request_id uuid, applicant_role public.enrolment_role, source text, subject_id uuid, subject_name text,
  student_first_name text, student_last_name text, applicant_email text, phone text, school text, grade text,
  city_part text, situation text, listed_at timestamptz, days_waiting integer, offered boolean, school_teacher text
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  return query
    select r.id, r.applicant_role, r.source, r.subject_id, sub.name, r.student_first_name, r.student_last_name,
           p.email, r.contact_phone, r.school, r.grade, r.city_part, r.situation, r.listed_at,
           greatest(0, floor(extract(epoch from (now() - r.listed_at)) / 86400))::integer,
           exists (select 1 from public.enrolment_offers o where o.request_id = r.id and o.teacher_id = v_me),
           r.school_teacher
      from public.enrolment_requests r
      join public.profiles p on p.id = r.applicant_id
      left join public.subjects sub on sub.id = r.subject_id
     where r.status = 'open' and r.listed_at is not null and private.teacher_teaches(v_me, r.subject_id)
     order by r.listed_at desc, r.id;
end $$;
revoke all on function public.list_enrolment_pool() from public, anon;
grant execute on function public.list_enrolment_pool() to authenticated;

drop function public.admin_list_enrolments(text);
create function public.admin_list_enrolments(p_state text default null)
returns table (
  request_id uuid, applicant_role public.enrolment_role, source text, status public.enrolment_status, state text,
  subject_name text, student_first_name text, student_last_name text, applicant_email text, phone text, school text, grade text,
  city_part text, situation text, created_at timestamptz, listed_at timestamptz, days_waiting integer,
  chosen_teacher_id uuid, offers jsonb, school_teacher text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  return query
    select * from (
      select r.id, r.applicant_role, r.source, r.status,
             case
               when r.status <> 'open' then r.status::text
               when r.needs_approval and r.approved_at is null then 'needs_approval'
               when r.profile_completed_at is null then 'incomplete'
               else 'open'
             end as state,
             sub.name, r.student_first_name, r.student_last_name, p.email, r.contact_phone, r.school, r.grade, r.city_part,
             r.situation, r.created_at, r.listed_at,
             case when r.listed_at is null then 0
                  else greatest(0, floor(extract(epoch from (now() - r.listed_at)) / 86400))::integer end,
             r.chosen_teacher_id,
             coalesce((
               select jsonb_agg(jsonb_build_object('teacher_id', o.teacher_id, 'name', tp.first_name || ' ' || tp.last_name,
                                                   'offered_at', o.created_at) order by o.created_at)
                 from public.enrolment_offers o join public.profiles tp on tp.id = o.teacher_id
                where o.request_id = r.id), '[]') as offers,
             r.school_teacher
        from public.enrolment_requests r
        join public.profiles p on p.id = r.applicant_id
        left join public.subjects sub on sub.id = r.subject_id
    ) x
     where p_state is null or x.state = p_state
     order by x.created_at desc, x.id
     limit 500;
end $$;
revoke all on function public.admin_list_enrolments(text) from public, anon;
grant execute on function public.admin_list_enrolments(text) to authenticated;

-- Accepting an offer ---------------------------------------------------------------------------------------------------------------------
-- The person (or a parent) accepts one of the offers at once; the other offers are closed. (It used to wait until the choice had
-- opened, some days after the request or when enough offers had come.)
create or replace function public.choose_enrolment_teacher(p_request_id uuid, p_teacher_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
begin
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found or not private.can_act_on_request(p_request_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.status <> 'open' then
    raise exception 'a teacher was already chosen' using errcode = 'PT409';
  end if;
  if not exists (
    select 1 from public.enrolment_offers o join public.teachers t on t.profile_id = o.teacher_id and t.is_active
     where o.request_id = p_request_id and o.teacher_id = p_teacher_id
  ) then
    raise exception 'this teacher has not offered' using errcode = 'PT400';
  end if;
  return private.place_enrolment(p_request_id, p_teacher_id, 'student', null);
end $$;
