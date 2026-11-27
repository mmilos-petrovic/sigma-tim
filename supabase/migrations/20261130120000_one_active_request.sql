-- A student has one active request at a time, and so has a child of a parent: somebody who wants another one deletes the one they
-- have first. (The request that is still being filled in stays the one a second try gives back.) The person deletes a request of
-- their own, while it waits for a teacher or for the email of the child.

create or replace function public.start_enrolment(p_subject_id uuid, p_role text, p_child_id uuid default null) returns uuid
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

  -- one active request at a time for a student (and for a child of a parent): a new one needs the old one deleted first
  if exists (
    select 1 from public.enrolment_requests r
     where r.applicant_id = v_profile and r.applicant_role = v_role and r.status in ('open', 'chosen')
       and case
             when v_role = 'student' then true
             else p_child_id is not null and r.child_profile_id = p_child_id
           end
  ) then
    raise exception 'there is an active request already' using errcode = 'PT409';
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

create function public.cancel_enrolment_request(p_request_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
begin
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found or not private.can_act_on_request(p_request_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.status not in ('open', 'chosen') then
    raise exception 'the request is over' using errcode = 'PT409';
  end if;
  -- the offers go with it
  delete from public.enrolment_requests where id = p_request_id;
end $$;

revoke all on function public.cancel_enrolment_request(uuid) from public, anon;
grant execute on function public.cancel_enrolment_request(uuid) to authenticated;
