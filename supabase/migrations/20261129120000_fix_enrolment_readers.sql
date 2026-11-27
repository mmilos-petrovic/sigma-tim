-- Brings a database that applied `20261127120000_member_profile.sql` in its first form up to what that file says now.
-- The file was edited in place after it had run on staging and production (the teacher at school on a request and a profile,
-- the readers of a request without the waiting period, accepting an offer at once). A migration that has run is never run
-- again, so those edits never arrived: the deployed readers still read `choice_opened_at`, which
-- `20261128120000_remove_choice_waiting.sql` dropped, and `school_teacher` does not exist. Everything here is written to run on
-- both kinds of database: one that has the first form, and one that already has the edited file (a new one).

-- The teacher at school ------------------------------------------------------------------------------------------------------------
alter table public.student_details add column if not exists school_teacher text check (char_length(school_teacher) <= 100);
alter table public.enrolment_requests add column if not exists school_teacher text check (char_length(school_teacher) <= 100);


-- The profile --------------------------------------------------------------------------------------------------------------------
create or replace function public.my_profile() returns jsonb
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

create or replace function public.save_my_profile(p_phone text, p_people jsonb, p_consent boolean default false) returns void
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


-- The form of a request takes the teacher at school ----------------------------------------------------------------------------------
drop function if exists public.complete_enrolment_profile(uuid, text, text, text, text, text, text, text, boolean);
drop function if exists public.complete_enrolment_profile(uuid, text, text, text, text, text, text, text, boolean, text);
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

-- A new request is prefilled with it, and a placed request keeps it with the student ---------------------------------------------------
create or replace function private.prefill_request(p_request_id uuid, p_person uuid, p_contact uuid) returns void
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

create or replace function private.keep_request_details(p_profile_id uuid, p_request public.enrolment_requests) returns void
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
drop function if exists public.my_enrolment_requests();
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

drop function if exists public.list_enrolment_pool();
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

drop function if exists public.admin_list_enrolments(text);
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
