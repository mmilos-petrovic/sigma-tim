-- Phase 7-4a, part 1: enrolment. A person who finds the school on the landing page signs up with Google, says which subject
-- they want and fills in a profile; the teachers of that subject offer to take them; after 3 days or 3 offers the student
-- (or the parent) chooses one of the offering teachers. The administrator can assign a teacher at any moment.
--
-- A new sign-up is NOT a member: `private.is_member()` stays false, so the member-only things (CVs for signed-in users,
-- location photos, the calendar) stay closed. Everything an applicant does goes through the functions below, and the
-- tables have no grants, like the notification outbox. The person becomes a student (and a parent, if a parent signed up)
-- only when a teacher is placed.
--
-- A request is one of three kinds (`source`): `signup` (the landing page), `teacher` (a teacher or the administrator added
-- a student who nobody teaches yet) and `legacy` (a student a teacher left behind; part 2). The last two already have a
-- `students` row with no teacher (`student_id`); a sign-up gets its row when a teacher is placed.

create type public.enrolment_role as enum ('student', 'parent');
-- open: waiting for offers or a choice. chosen: a parent chose a teacher, who still has to say the child's email.
-- assigned: done. rejected: the administrator turned the sign-up down.
create type public.enrolment_status as enum ('open', 'chosen', 'assigned', 'rejected');

-- Settings ---------------------------------------------------------------------------------------------------------------------------
-- One row. `daily_cap` sign-ups a day (school time) go straight to the teachers; later ones wait for the administrator.
create table public.enrolment_settings (
  singleton boolean primary key default true check (singleton),
  form_enabled boolean not null default true,
  daily_cap integer not null default 10 check (daily_cap between 1 and 1000),
  choice_after_days integer not null default 3 check (choice_after_days between 1 and 30),
  choice_after_offers integer not null default 3 check (choice_after_offers between 1 and 20),
  updated_at timestamptz not null default now()
);
insert into public.enrolment_settings default values;
alter table public.enrolment_settings enable row level security;

-- Requests and offers ------------------------------------------------------------------------------------------------------------
create table public.enrolment_requests (
  id uuid primary key default gen_random_uuid(),
  -- the person who signed up (the student or a parent); for a request a teacher added, the student's own profile
  applicant_id uuid not null references public.profiles (id) on delete cascade,
  applicant_role public.enrolment_role not null,
  source text not null check (source in ('signup', 'teacher', 'legacy')),
  added_by uuid references public.profiles (id) on delete set null,
  -- the student's record when there is one already (a teacher added it, or a teacher left it behind)
  student_id uuid unique references public.students (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete restrict,
  -- what was typed about the student (it may differ from the Google account, which can be the parent's)
  student_first_name text check (btrim(student_first_name) <> '' and char_length(student_first_name) <= 100),
  student_last_name text check (btrim(student_last_name) <> '' and char_length(student_last_name) <= 100),
  contact_phone text check (contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  school text check (btrim(school) <> '' and char_length(school) <= 200),
  grade text check (btrim(grade) <> '' and char_length(grade) <= 50),
  city_part text check (char_length(city_part) <= 100),
  situation text check (char_length(situation) <= 1000),
  consent_at timestamptz,
  profile_completed_at timestamptz,
  -- a sign-up past the daily cap is not shown to teachers until the administrator approves it
  needs_approval boolean not null default false,
  approved_at timestamptz,
  -- when teachers first see it; the days of waiting count from here
  listed_at timestamptz,
  -- start of the current waiting period (it starts again when nobody offered), and how often that happened
  window_started_at timestamptz,
  restarts integer not null default 0,
  choice_opened_at timestamptz,
  status public.enrolment_status not null default 'open',
  chosen_teacher_id uuid references public.teachers (profile_id) on delete set null,
  chosen_by text check (chosen_by in ('student', 'admin')),
  chosen_at timestamptz,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  constraint enrolment_complete_has_the_data check (
    profile_completed_at is null
    or (student_first_name is not null and student_last_name is not null and contact_phone is not null
        and school is not null and grade is not null)
  ),
  constraint enrolment_signup_has_consent check (source <> 'signup' or profile_completed_at is null or consent_at is not null)
);
create unique index enrolment_one_student_signup on public.enrolment_requests (applicant_id)
  where source = 'signup' and applicant_role = 'student' and status in ('open', 'chosen');
create index enrolment_requests_subject_idx on public.enrolment_requests (subject_id);
create index enrolment_requests_applicant_idx on public.enrolment_requests (applicant_id);
create index enrolment_requests_listed_idx on public.enrolment_requests (listed_at desc) where status = 'open';
alter table public.enrolment_requests enable row level security;

create table public.enrolment_offers (
  request_id uuid not null references public.enrolment_requests (id) on delete cascade,
  teacher_id uuid not null references public.teachers (profile_id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, teacher_id)
);
create index enrolment_offers_teacher_idx on public.enrolment_offers (teacher_id);
alter table public.enrolment_offers enable row level security;

-- Notices (see Phase 6): the first two go to the person who signed up (and the parents of a student a teacher added), the
-- last two to the teacher. Held back by quiet hours like any lesson notice.
insert into public.notification_kinds (kind, email_fallback, always_email, ignores_quiet_hours) values
  ('enrolment_offer',       true, false, false),
  ('enrolment_choice_open', true, false, false),
  ('enrolment_chosen',      true, false, false),
  ('enrolment_assigned',    true, false, false);

-- Helpers ----------------------------------------------------------------------------------------------------------------------------
-- The calendar day in the school's time zone.
create function private.school_day(p_at timestamptz) returns date
language sql immutable set search_path = '' as $$
  select (p_at at time zone 'Europe/Belgrade')::date
$$;

-- The person who signed up, or a parent of the student the request is about.
create function private.can_act_on_request(p_request_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.enrolment_requests r
     where r.id = p_request_id
       and (
         r.applicant_id = private.current_profile_id()
         or (r.student_id is not null and exists (
               select 1 from public.parent_students ps
                where ps.student_id = r.student_id and ps.parent_id = private.current_profile_id()))
       )
  )
$$;

-- A request without a subject (an old one) is for every teacher.
create function private.teacher_teaches(p_teacher_id uuid, p_subject_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_teacher_id is not null
     and exists (select 1 from public.teachers t where t.profile_id = p_teacher_id and t.is_active)
     and (p_subject_id is null
          or exists (select 1 from public.teacher_subjects ts where ts.teacher_id = p_teacher_id and ts.subject_id = p_subject_id))
$$;

-- Who is told about a request: the person who signed up and, when the student has a record, their parents.
create function private.enrolment_recipients(p_request_id uuid) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select r.applicant_id from public.enrolment_requests r where r.id = p_request_id
  union
  select ps.parent_id
    from public.enrolment_requests r join public.parent_students ps on ps.student_id = r.student_id
   where r.id = p_request_id
$$;

create function private.enqueue_enrolment_notice(p_kind text, p_recipient uuid, p_payload jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.notifications (recipient_id, kind, payload)
  values (p_recipient, p_kind, p_payload || jsonb_build_object('actor', private.current_profile_id()))
$$;

-- Teachers see the request when it is listed; it is listed once the profile is complete and, for a sign-up past the cap,
-- the administrator approved it.
create function private.refresh_listing(p_request_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.enrolment_requests
     set listed_at = now(), window_started_at = now()
   where id = p_request_id and listed_at is null and profile_completed_at is not null
     and (not needs_approval or approved_at is not null)
$$;

-- The CV of a teacher as the readers see it (the same fields whoever reads it; who may read is decided by the caller).
create function private.cv_json(p_cv_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'slug', c.slug,
           'first_name', p.first_name,
           'last_name', p.last_name,
           'about', c.about,
           'photo_path', c.photo_path,
           'subjects', coalesce((
             select jsonb_agg(s.name order by s.name)
               from public.teacher_subjects ts join public.subjects s on s.id = ts.subject_id
              where ts.teacher_id = c.teacher_id
           ), '[]'),
           'experience', coalesce((
             select jsonb_agg(
                      jsonb_build_object('employer', e.employer, 'position', e.position, 'period', e.period, 'description', e.description)
                      order by e.sort_order, e.id)
               from public.cv_experience e where e.cv_id = c.id
           ), '[]'),
           'education', coalesce((
             select jsonb_agg(
                      jsonb_build_object('institution', e.institution, 'degree', e.degree, 'period', e.period)
                      order by e.sort_order, e.id)
               from public.cv_education e where e.cv_id = c.id
           ), '[]'),
           'skills', coalesce((
             select jsonb_agg(k.skill order by k.sort_order, k.id)
               from public.cv_skills k where k.cv_id = c.id
           ), '[]'),
           'updated_at', c.updated_at
         )
    from public.teacher_cv c
    join public.profiles p on p.id = c.teacher_id
   where c.id = p_cv_id
$$;

create or replace function private.get_cv(p_slug text, p_public boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.cv_json(c.id)
    from public.teacher_cv c
    join public.teachers t on t.profile_id = c.teacher_id and t.is_active
   where c.slug = p_slug
     and case when p_public then c.show_public else c.show_members end
$$;

-- The landing page ----------------------------------------------------------------------------------------------------------------
-- What the form needs, for a visitor who has not signed in: whether it is on and the subjects somebody teaches, the ones with
-- the most teachers first.
create function public.enrolment_form_info() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'enabled', s.form_enabled,
           'subjects', coalesce((
             select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name) order by x.teachers desc, x.name)
               from (
                 select sub.id, sub.name, count(*) as teachers
                   from public.subjects sub
                   join public.teacher_subjects ts on ts.subject_id = sub.id
                   join public.teachers t on t.profile_id = ts.teacher_id and t.is_active
                  group by sub.id, sub.name
               ) x
           ), '[]')
         )
    from public.enrolment_settings s
$$;

-- Signing up ----------------------------------------------------------------------------------------------------------------------
-- Called right after the Google sign-in that follows the form. It makes the profile of a Google account the school does not
-- know yet (the email comes from the confirmed Google account, never from the client) and the request. Calling it again for
-- the same person and subject returns the same request.
create function public.start_enrolment(p_subject_id uuid, p_role text) returns uuid
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
    if private.is_member() and not (v_role = 'parent' and exists (select 1 from public.parents where profile_id = v_profile)) then
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

  -- asking again for the same thing gives the same request
  select id into v_request
    from public.enrolment_requests
   where applicant_id = v_profile and applicant_role = v_role and source = 'signup' and status = 'open'
     and (v_role = 'student' or (subject_id = p_subject_id and profile_completed_at is null))
   order by created_at desc limit 1;
  if v_request is not null then
    update public.enrolment_requests set subject_id = p_subject_id
     where id = v_request and profile_completed_at is null and subject_id is distinct from p_subject_id;
    return v_request;
  end if;

  select (count(*) >= v_settings.daily_cap) into v_needs_approval
    from public.enrolment_requests
   where source = 'signup' and private.school_day(created_at) = private.school_day(now());

  insert into public.enrolment_requests (applicant_id, applicant_role, source, subject_id, needs_approval)
  values (v_profile, v_role, 'signup', p_subject_id, v_needs_approval)
  returning id into v_request;
  return v_request;
end $$;

-- The profile ----------------------------------------------------------------------------------------------------------------------
-- The applicant (or a parent of the student) fills it in, and may change it until a teacher is chosen. Once it is complete the
-- teachers of the subject see it (a sign-up past the cap waits for the administrator). The consent is for the privacy policy.
create function public.complete_enrolment_profile(
  p_request_id uuid, p_first_name text, p_last_name text, p_phone text, p_school text, p_grade text,
  p_city_part text default null, p_situation text default null, p_consent boolean default false
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
  if char_length(coalesce(p_city_part, '')) > 100 or char_length(coalesce(p_situation, '')) > 1000 then
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
         situation = nullif(btrim(coalesce(p_situation, '')), ''),
         consent_at = case when source = 'signup' then coalesce(consent_at, now()) else consent_at end,
         profile_completed_at = coalesce(profile_completed_at, now())
   where id = p_request_id;

  perform private.refresh_listing(p_request_id);
end $$;

-- A parent who already has a child at the school can send another request (another child or subject) from their screen.
-- (start_enrolment covers that too: a parent may call it again.)

-- What the applicant sees --------------------------------------------------------------------------------------------------------
create function public.my_enrolment_requests()
returns table (
  id uuid, applicant_role public.enrolment_role, source text, status public.enrolment_status,
  subject_id uuid, subject_name text, student_first_name text, student_last_name text, contact_phone text,
  school text, grade text, city_part text, situation text,
  profile_completed boolean, waiting_for_approval boolean, listed boolean, days_waiting integer,
  offers_count integer, choice_open boolean, chosen_teacher_id uuid, student_id uuid
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
         r.choice_opened_at is not null,
         r.chosen_teacher_id, r.student_id
    from public.enrolment_requests r
    left join public.subjects sub on sub.id = r.subject_id
   where r.status <> 'rejected' and private.can_act_on_request(r.id)
   order by r.created_at desc
$$;

-- The teachers who offered, with what the person needs to choose: name, phone, subjects and whether there is a CV.
create function public.my_enrolment_offers(p_request_id uuid)
returns table (teacher_id uuid, first_name text, last_name text, phone text, subjects text[], cv_slug text, photo_path text,
               offered_at timestamptz, is_chosen boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_act_on_request(p_request_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  return query
    select t.profile_id, p.first_name, p.last_name, ph.phone,
           array(select s.name from public.teacher_subjects ts join public.subjects s on s.id = ts.subject_id
                  where ts.teacher_id = t.profile_id order by s.name),
           c.slug, c.photo_path, o.created_at, coalesce(r.chosen_teacher_id = t.profile_id, false)
      from public.enrolment_requests r
      join public.enrolment_offers o on o.request_id = r.id
      join public.teachers t on t.profile_id = o.teacher_id and t.is_active
      join public.profiles p on p.id = t.profile_id
      left join public.person_phones ph on ph.profile_id = t.profile_id
      left join public.teacher_cv c on c.teacher_id = t.profile_id
     where r.id = p_request_id and r.status in ('open', 'chosen')
     order by o.created_at;
end $$;

-- The CV of a teacher who offered. It cannot be hidden from the person who has to choose (nor from a parent of the student),
-- whatever the two switches say.
create function public.get_offered_cv(p_request_id uuid, p_teacher_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_act_on_request(p_request_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  return (
    select private.cv_json(c.id)
      from public.enrolment_offers o
      join public.enrolment_requests r on r.id = o.request_id and r.status in ('open', 'chosen')
      join public.teachers t on t.profile_id = o.teacher_id and t.is_active
      join public.teacher_cv c on c.teacher_id = t.profile_id
     where o.request_id = p_request_id and o.teacher_id = p_teacher_id
  );
end $$;

-- Placing a teacher -------------------------------------------------------------------------------------------------------------------
-- Makes the person a student of the teacher. An existing record (a teacher added it, or it was left behind) gets the teacher; a
-- student who signed up gets a record; for a parent who signed up the record needs the child's email, which the teacher gives
-- afterwards (`complete_chosen_enrolment`) unless it is known already. Returns 'assigned' or 'chosen' (still waiting for that).
create function private.place_enrolment(p_request_id uuid, p_teacher_id uuid, p_by text, p_child_email text) returns text
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

-- The person (or a parent) chooses one of the teachers who offered, once the choice is open.
create function public.choose_enrolment_teacher(p_request_id uuid, p_teacher_id uuid) returns text
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
  if v_request.choice_opened_at is null then
    raise exception 'the choice is not open yet' using errcode = 'PT409';
  end if;
  if not exists (
    select 1 from public.enrolment_offers o join public.teachers t on t.profile_id = o.teacher_id and t.is_active
     where o.request_id = p_request_id and o.teacher_id = p_teacher_id
  ) then
    raise exception 'this teacher has not offered' using errcode = 'PT400';
  end if;
  return private.place_enrolment(p_request_id, p_teacher_id, 'student', null);
end $$;

-- The teacher a parent chose gives the child's email; that completes the student record.
create function public.complete_chosen_enrolment(p_request_id uuid, p_child_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
begin
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if not (private.is_admin() or coalesce(v_request.chosen_teacher_id = private.current_teacher_id(), false)) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.status <> 'chosen' then
    raise exception 'this request is not waiting for an email' using errcode = 'PT409';
  end if;
  if btrim(coalesce(p_child_email, '')) = '' then
    raise exception 'the child''s email is required' using errcode = 'PT400';
  end if;
  perform private.place_enrolment(p_request_id, v_request.chosen_teacher_id, coalesce(v_request.chosen_by, 'admin'), p_child_email);
end $$;

-- Teachers ------------------------------------------------------------------------------------------------------------------------
-- The listed requests for the subjects the teacher teaches, newest first. A teacher sees everything the person typed, with
-- phone and email and whether it is a parent or the student, and for how many days they have waited.
create function public.list_enrolment_pool()
returns table (
  request_id uuid, applicant_role public.enrolment_role, source text, subject_id uuid, subject_name text,
  student_first_name text, student_last_name text, applicant_email text, phone text, school text, grade text,
  city_part text, situation text, listed_at timestamptz, days_waiting integer, offered boolean
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
           exists (select 1 from public.enrolment_offers o where o.request_id = r.id and o.teacher_id = v_me)
      from public.enrolment_requests r
      join public.profiles p on p.id = r.applicant_id
      left join public.subjects sub on sub.id = r.subject_id
     where r.status = 'open' and r.listed_at is not null and private.teacher_teaches(v_me, r.subject_id)
     order by r.listed_at desc, r.id;
end $$;

-- Requests where a parent chose the teacher and the teacher still has to say the child's email.
create function public.list_chosen_enrolments()
returns table (request_id uuid, subject_name text, student_first_name text, student_last_name text, applicant_email text,
               phone text, school text, grade text, chosen_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  return query
    select r.id, sub.name, r.student_first_name, r.student_last_name, p.email, r.contact_phone, r.school, r.grade, r.chosen_at
      from public.enrolment_requests r
      join public.profiles p on p.id = r.applicant_id
      left join public.subjects sub on sub.id = r.subject_id
     where r.status = 'chosen' and r.chosen_teacher_id = v_me
     order by r.chosen_at;
end $$;

-- A teacher cannot take anybody: they offer, and the person chooses. A teacher needs a CV with at least the "about" text,
-- because the person decides by it.
create function public.offer_enrolment(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_request public.enrolment_requests;
  v_inserted integer;
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found or v_request.status <> 'open' or v_request.listed_at is null
     or not private.teacher_teaches(v_me, v_request.subject_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if not exists (select 1 from public.teacher_cv c where c.teacher_id = v_me and btrim(coalesce(c.about, '')) <> '') then
    raise exception 'write the about text of your CV first' using errcode = 'PT409';
  end if;
  if v_request.student_id is not null and exists (
       select 1 from public.students s join public.students s0 on s0.profile_id = s.profile_id
        where s0.id = v_request.student_id and s.teacher_id = v_me) then
    raise exception 'this person is already your student' using errcode = 'PT409';
  end if;

  insert into public.enrolment_offers (request_id, teacher_id) values (p_request_id, v_me) on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    return;
  end if;

  perform private.enqueue_enrolment_notice('enrolment_offer', r, jsonb_build_object(
      'request_id', p_request_id,
      'teacher', (select first_name || ' ' || last_name from public.profiles where id = v_me),
      'subject', (select name from public.subjects where id = v_request.subject_id)))
    from private.enrolment_recipients(p_request_id) r;
end $$;

create function public.withdraw_enrolment_offer(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if exists (select 1 from public.enrolment_requests where id = p_request_id and status <> 'open') then
    raise exception 'a teacher was already chosen' using errcode = 'PT409';
  end if;
  delete from public.enrolment_offers where request_id = p_request_id and teacher_id = v_me;
end $$;

-- A teacher (or the administrator) adds a student nobody teaches yet; the student goes to the pool like a sign-up that
-- needs no approval. (add_student without this makes the teacher the student's teacher at once.)
create function public.add_unassigned_student(
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

  insert into public.enrolment_requests (
    applicant_id, applicant_role, source, added_by, student_id, subject_id, student_first_name, student_last_name,
    contact_phone, school, grade, city_part, situation, profile_completed_at, listed_at, window_started_at)
  select v_profile, 'student', 'teacher', private.current_profile_id(), v_student, p_subject_id, p.first_name, p.last_name,
         v_phone, btrim(p_school), btrim(p_grade), nullif(btrim(coalesce(p_city_part, '')), ''),
         nullif(btrim(coalesce(p_situation, '')), ''), now(), now(), now()
    from public.profiles p where p.id = v_profile
  returning id into v_request;
  return v_request;
end $$;

-- When a teacher stops being active the offers go with them; a parent's choice they were to complete goes back to open.
create function private.teacher_deactivated_enrolments() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.enrolment_offers where teacher_id = new.profile_id;
  update public.enrolment_requests
     set status = 'open', chosen_teacher_id = null, chosen_by = null, chosen_at = null
   where status = 'chosen' and chosen_teacher_id = new.profile_id;
  return null;
end $$;

create trigger teachers_deactivated_enrolments
  after update of is_active on public.teachers
  for each row when (old.is_active and not new.is_active)
  execute function private.teacher_deactivated_enrolments();

-- The administrator ----------------------------------------------------------------------------------------------------------------
create function public.get_enrolment_settings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  return (select to_jsonb(s) - 'singleton' from public.enrolment_settings s);
end $$;

create function public.set_enrolment_settings(
  p_form_enabled boolean, p_daily_cap integer, p_choice_after_days integer, p_choice_after_offers integer
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_form_enabled is null or p_daily_cap not between 1 and 1000 or p_choice_after_days not between 1 and 30
     or p_choice_after_offers not between 1 and 20 then
    raise exception 'invalid settings' using errcode = 'PT400';
  end if;
  update public.enrolment_settings
     set form_enabled = p_form_enabled, daily_cap = p_daily_cap, choice_after_days = p_choice_after_days,
         choice_after_offers = p_choice_after_offers, updated_at = now()
   where singleton;
end $$;

-- Every request with who offered, newest first. `state`: needs_approval, incomplete, open, choice_open, chosen, assigned,
-- rejected (null for all).
create function public.admin_list_enrolments(p_state text default null)
returns table (
  request_id uuid, applicant_role public.enrolment_role, source text, status public.enrolment_status, state text,
  subject_name text, student_first_name text, student_last_name text, applicant_email text, phone text, school text, grade text,
  city_part text, situation text, created_at timestamptz, listed_at timestamptz, days_waiting integer, restarts integer,
  choice_opened_at timestamptz, chosen_teacher_id uuid, offers jsonb
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
               when r.choice_opened_at is not null then 'choice_open'
               else 'open'
             end as state,
             sub.name, r.student_first_name, r.student_last_name, p.email, r.contact_phone, r.school, r.grade, r.city_part,
             r.situation, r.created_at, r.listed_at,
             case when r.listed_at is null then 0
                  else greatest(0, floor(extract(epoch from (now() - r.listed_at)) / 86400))::integer end,
             r.restarts, r.choice_opened_at, r.chosen_teacher_id,
             coalesce((
               select jsonb_agg(jsonb_build_object('teacher_id', o.teacher_id, 'name', tp.first_name || ' ' || tp.last_name,
                                                   'offered_at', o.created_at) order by o.created_at)
                 from public.enrolment_offers o join public.profiles tp on tp.id = o.teacher_id
                where o.request_id = r.id), '[]')
        from public.enrolment_requests r
        join public.profiles p on p.id = r.applicant_id
        left join public.subjects sub on sub.id = r.subject_id
    ) x
     where p_state is null or x.state = p_state
     order by x.created_at desc, x.id
     limit 500;
end $$;

create function public.approve_enrolment(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  update public.enrolment_requests set approved_at = coalesce(approved_at, now())
   where id = p_request_id and status = 'open';
  if not found then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  perform private.refresh_listing(p_request_id);
end $$;

create function public.reject_enrolment(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_student uuid;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  update public.enrolment_requests set status = 'rejected'
   where id = p_request_id and status in ('open', 'chosen') and student_id is null
   returning id into v_student;
  if not found then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  delete from public.enrolment_offers where request_id = p_request_id;
end $$;

-- The administrator places any active teacher at any moment, also one who does not teach the subject.
create function public.admin_assign_enrolment(p_request_id uuid, p_teacher_id uuid, p_child_email text default null) returns text
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
  if v_request.profile_completed_at is null then
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

-- The job (every minute) -------------------------------------------------------------------------------------------------------------
-- A listed request opens its choice at the earlier of `choice_after_offers` offers and `choice_after_days` days after the
-- waiting period began, but only when somebody offered. With no offers after the days the period begins again (and the
-- administrator sees `restarts` grow). More offers keep arriving until a teacher is chosen. Returns how many choices opened.
create function private.advance_enrolments() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  s public.enrolment_settings;
  v_request record;
  v_opened integer := 0;
begin
  select * into s from public.enrolment_settings;

  for v_request in
    select r.id, r.subject_id, (select count(*) from public.enrolment_offers o join public.teachers t on t.profile_id = o.teacher_id and t.is_active
                                 where o.request_id = r.id) as offers, r.window_started_at
      from public.enrolment_requests r
     where r.status = 'open' and r.listed_at is not null and r.choice_opened_at is null
     order by r.listed_at
       for update of r skip locked
  loop
    if v_request.offers >= s.choice_after_offers
       or (v_request.offers >= 1 and now() >= v_request.window_started_at + s.choice_after_days * interval '1 day') then
      update public.enrolment_requests set choice_opened_at = now() where id = v_request.id;
      perform private.enqueue_enrolment_notice('enrolment_choice_open', r, jsonb_build_object(
          'request_id', v_request.id, 'offers', v_request.offers,
          'subject', (select name from public.subjects where id = v_request.subject_id)))
        from private.enrolment_recipients(v_request.id) r;
      v_opened := v_opened + 1;
    elsif v_request.offers = 0 and now() >= v_request.window_started_at + s.choice_after_days * interval '1 day' then
      update public.enrolment_requests set window_started_at = now(), restarts = restarts + 1 where id = v_request.id;
    end if;
  end loop;
  return v_opened;
end $$;

revoke all on function private.advance_enrolments() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('advance-enrolments', '* * * * *', 'select private.advance_enrolments()');
  else
    raise notice 'pg_cron is not available: enrolment choices will not open by themselves';
  end if;
end $$;

-- Grants -------------------------------------------------------------------------------------------------------------------------------
-- The tables have no grants and no policies: only the functions above read or write them.
revoke all on function public.enrolment_form_info() from public;
grant execute on function public.enrolment_form_info() to anon, authenticated;

revoke all on function public.start_enrolment(uuid, text) from public, anon;
revoke all on function public.complete_enrolment_profile(uuid, text, text, text, text, text, text, text, boolean) from public, anon;
revoke all on function public.my_enrolment_requests() from public, anon;
revoke all on function public.my_enrolment_offers(uuid) from public, anon;
revoke all on function public.get_offered_cv(uuid, uuid) from public, anon;
revoke all on function public.choose_enrolment_teacher(uuid, uuid) from public, anon;
revoke all on function public.complete_chosen_enrolment(uuid, text) from public, anon;
revoke all on function public.list_enrolment_pool() from public, anon;
revoke all on function public.list_chosen_enrolments() from public, anon;
revoke all on function public.offer_enrolment(uuid) from public, anon;
revoke all on function public.withdraw_enrolment_offer(uuid) from public, anon;
revoke all on function public.add_unassigned_student(text, text, text, text, uuid, text, text, text, text) from public, anon;
revoke all on function public.get_enrolment_settings() from public, anon;
revoke all on function public.set_enrolment_settings(boolean, integer, integer, integer) from public, anon;
revoke all on function public.admin_list_enrolments(text) from public, anon;
revoke all on function public.approve_enrolment(uuid) from public, anon;
revoke all on function public.reject_enrolment(uuid) from public, anon;
revoke all on function public.admin_assign_enrolment(uuid, uuid, text) from public, anon;

grant execute on function public.start_enrolment(uuid, text) to authenticated;
grant execute on function public.complete_enrolment_profile(uuid, text, text, text, text, text, text, text, boolean) to authenticated;
grant execute on function public.my_enrolment_requests() to authenticated;
grant execute on function public.my_enrolment_offers(uuid) to authenticated;
grant execute on function public.get_offered_cv(uuid, uuid) to authenticated;
grant execute on function public.choose_enrolment_teacher(uuid, uuid) to authenticated;
grant execute on function public.complete_chosen_enrolment(uuid, text) to authenticated;
grant execute on function public.list_enrolment_pool() to authenticated;
grant execute on function public.list_chosen_enrolments() to authenticated;
grant execute on function public.offer_enrolment(uuid) to authenticated;
grant execute on function public.withdraw_enrolment_offer(uuid) to authenticated;
grant execute on function public.add_unassigned_student(text, text, text, text, uuid, text, text, text, text) to authenticated;
grant execute on function public.get_enrolment_settings() to authenticated;
grant execute on function public.set_enrolment_settings(boolean, integer, integer, integer) to authenticated;
grant execute on function public.admin_list_enrolments(text) to authenticated;
grant execute on function public.approve_enrolment(uuid) to authenticated;
grant execute on function public.reject_enrolment(uuid) to authenticated;
grant execute on function public.admin_assign_enrolment(uuid, uuid, text) to authenticated;
