-- Phone numbers of teachers, parents and students.
--
-- A number is required for a teacher and for a parent and optional for a student, from any country: it is kept in the
-- international form (`+` and 7 to 15 digits). The notifications to come (push, email, SMS) and the calls a teacher makes
-- need it. It lives in a table of its own, not on `profiles`, so that who may read a number is decided per number:
--
--   the administrator          every number
--   a person                   their own
--   a teacher                  the numbers of their own students and of those students' parents (not of colleagues, not
--                              of students nobody teaches)
--   a student, a parent        the number of their teacher; a parent also the numbers of their children
--
-- Numbers are only written by the functions below. Existing teachers and parents have none yet: the app asks for it, the
-- database cannot make them.

create function private.normalize_phone(p_phone text) returns text
language plpgsql immutable set search_path = '' as $$
declare
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
begin
  if v_phone like '00%' then
    v_phone := '+' || substr(v_phone, 3);
  end if;
  if v_phone ~ '^\+[1-9][0-9]{6,14}$' then
    return v_phone;
  end if;
  return null;
end $$;

create table public.person_phones (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$')
);

-- The profile is a student of the calling teacher, or a parent of one.
create function private.teacher_has_person(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  -- (for anybody who is not an active teacher current_teacher_id() is null, which equals no teacher_id)
  select exists (
           select 1 from public.students s
            where s.profile_id = p_profile_id and s.teacher_id = private.current_teacher_id()
         )
      or exists (
           select 1 from public.parent_students ps join public.students s on s.id = ps.student_id
            where ps.parent_id = p_profile_id and s.teacher_id = private.current_teacher_id()
         )
$$;

create function private.can_see_phone(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin()
      or p_profile_id = private.current_profile_id()
      or private.teacher_has_person(p_profile_id)
      -- a student and a parent read the number of their teacher
      or private.is_student_of_teacher(p_profile_id)
      -- and a parent the numbers of their children
      or exists (
        select 1 from public.parent_students ps join public.students s on s.id = ps.student_id
         where s.profile_id = p_profile_id and ps.parent_id = private.current_profile_id()
      )
$$;

alter table public.person_phones enable row level security;
grant select on public.person_phones to authenticated;
create policy person_phones_select on public.person_phones for select to authenticated
  using (private.can_see_phone(profile_id));

-- An erased person keeps nothing of this, whoever erases them and however.
create function private.forget_phone_of_erased() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.person_phones where profile_id = new.id;
  return null;
end $$;

create trigger profiles_erased_forget_phone
  after update of erased_at on public.profiles
  for each row when (new.erased_at is not null and old.erased_at is null)
  execute function private.forget_phone_of_erased();

-- The number is stored only when the person has none yet: whoever adds a known person again does not get to change what
-- they gave (the same rule as for the name). `set_person_phone` is the way to change it.
create function private.keep_phone(p_profile_id uuid, p_phone text) returns void
language sql security definer set search_path = '' as $$
  insert into public.person_phones (profile_id, phone) values (p_profile_id, p_phone)
  on conflict (profile_id) do nothing
$$;

-- Setting a number -------------------------------------------------------------------------------------------------------------
-- The administrator, the person themselves, and a teacher for a student of theirs or a parent of one. An empty number takes
-- it away, which is only for people who need none (a student): not for a teacher, also a deactivated one, and not for a
-- parent. Nothing can be set for an erased person.

create function public.set_person_phone(p_profile_id uuid, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_erased timestamptz;
  v_phone text;
begin
  -- (coalesce: a Google account without a profile has no profile id, and "not unknown" is unknown, not true)
  if not (
    private.is_admin()
    or coalesce(p_profile_id = private.current_profile_id(), false)
    or private.teacher_has_person(p_profile_id)
  ) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  -- a share lock: erasing the person at the same moment either waits for this or is waited for
  select erased_at into v_erased from public.profiles where id = p_profile_id for share;
  if not found then
    raise exception 'person not found' using errcode = 'PT404';
  end if;
  if v_erased is not null then
    raise exception 'this person was erased' using errcode = 'PT409';
  end if;

  if btrim(coalesce(p_phone, '')) = '' then
    if exists (select 1 from public.teachers where profile_id = p_profile_id)
       or exists (select 1 from public.parents where profile_id = p_profile_id) then
      raise exception 'a teacher or parent needs a phone number' using errcode = 'PT409';
    end if;
    delete from public.person_phones where profile_id = p_profile_id;
    return;
  end if;

  v_phone := private.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'invalid phone number' using errcode = 'PT400';
  end if;
  insert into public.person_phones (profile_id, phone) values (p_profile_id, v_phone)
  on conflict (profile_id) do update set phone = excluded.phone;
end $$;

-- Teachers, parents and students are added with their number -----------------------------------------------------------------------
-- (create_teacher and add_parent_to_student: the versions without a number are gone, so there is no way around it;
--  add_student takes it as an option, and calls that do not send one keep working.)

drop function public.create_teacher(text, text, text, uuid[], uuid[]);

create function public.create_teacher(
  p_email text, p_first_name text, p_last_name text, p_subject_ids uuid[], p_location_ids uuid[], p_phone text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile uuid;
  v_locations uuid[];
  v_phone text;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_subject_ids is null or cardinality(p_subject_ids) = 0 then
    raise exception 'a teacher needs at least one subject' using errcode = 'PT400';
  end if;

  select coalesce(array_agg(distinct l), '{}') into v_locations from unnest(p_location_ids) as l where l is not null;
  if cardinality(v_locations) = 0 then
    raise exception 'a teacher needs at least one location' using errcode = 'PT400';
  end if;
  if exists (select 1 from unnest(v_locations) as l where not exists (select 1 from public.locations x where x.id = l)) then
    raise exception 'unknown location' using errcode = 'PT400';
  end if;

  if btrim(coalesce(p_phone, '')) = '' then
    raise exception 'a teacher needs a phone number' using errcode = 'PT400';
  end if;
  v_phone := private.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'invalid phone number' using errcode = 'PT400';
  end if;

  v_profile := private.upsert_profile(p_email, p_first_name, p_last_name);
  if exists (select 1 from public.teachers where profile_id = v_profile) then
    raise exception 'this person is already a teacher' using errcode = 'PT409';
  end if;

  insert into public.teachers (profile_id) values (v_profile);
  insert into public.teacher_subjects (teacher_id, subject_id)
  select v_profile, s from unnest(p_subject_ids) as s group by s;
  insert into public.teacher_locations (teacher_id, location_id)
  select v_profile, l from unnest(v_locations) as l;
  perform private.keep_phone(v_profile, v_phone);

  return v_profile;
end $$;

drop function public.add_parent_to_student(uuid, text, text, text);

create function public.add_parent_to_student(
  p_student_id uuid, p_email text, p_first_name text, p_last_name text, p_phone text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile uuid;
  v_phone text;
begin
  if not (private.is_admin() or private.is_teacher_of(p_student_id)) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  if btrim(coalesce(p_phone, '')) = '' then
    raise exception 'a parent needs a phone number' using errcode = 'PT400';
  end if;
  v_phone := private.normalize_phone(p_phone);
  if v_phone is null then
    raise exception 'invalid phone number' using errcode = 'PT400';
  end if;

  v_profile := private.upsert_profile(p_email, p_first_name, p_last_name);
  insert into public.parents (profile_id) values (v_profile) on conflict do nothing;
  perform private.keep_phone(v_profile, v_phone);

  if not exists (select 1 from public.parent_students where parent_id = v_profile and student_id = p_student_id) then
    insert into public.parent_students (parent_id, student_id) values (v_profile, p_student_id);
  end if;

  return v_profile;
end $$;

drop function public.add_student(text, text, text, text, text, text, uuid);

create function public.add_student(
  p_email text, p_first_name text, p_last_name text,
  p_school text default null, p_grade text default null, p_class_section text default null,
  p_teacher_id uuid default null, p_phone text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_admin boolean := private.is_admin();
  v_teacher uuid;
  v_profile uuid;
  v_student uuid;
  v_phone text;
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

  -- a student's number is optional: none, or an empty one, means none; one that is given has to be a number
  if btrim(coalesce(p_phone, '')) <> '' then
    v_phone := private.normalize_phone(p_phone);
    if v_phone is null then
      raise exception 'invalid phone number' using errcode = 'PT400';
    end if;
  end if;

  v_profile := private.upsert_profile(p_email, p_first_name, p_last_name);

  if exists (select 1 from public.students where profile_id = v_profile and teacher_id is not distinct from v_teacher) then
    raise exception 'this person is already a student of this teacher' using errcode = 'PT409';
  end if;

  insert into public.students (profile_id, school, grade, class_section, teacher_id)
  values (v_profile, nullif(btrim(p_school), ''), nullif(btrim(p_grade), ''), nullif(btrim(p_class_section), ''), v_teacher)
  returning id into v_student;

  if v_phone is not null then
    perform private.keep_phone(v_profile, v_phone);
  end if;

  return v_student;
end $$;

revoke all on function public.set_person_phone(uuid, text) from public, anon;
revoke all on function public.create_teacher(text, text, text, uuid[], uuid[], text) from public, anon;
revoke all on function public.add_parent_to_student(uuid, text, text, text, text) from public, anon;
revoke all on function public.add_student(text, text, text, text, text, text, uuid, text) from public, anon;
grant execute on function public.set_person_phone(uuid, text) to authenticated;
grant execute on function public.create_teacher(text, text, text, uuid[], uuid[], text) to authenticated;
grant execute on function public.add_parent_to_student(uuid, text, text, text, text) to authenticated;
grant execute on function public.add_student(text, text, text, text, text, text, uuid, text) to authenticated;
