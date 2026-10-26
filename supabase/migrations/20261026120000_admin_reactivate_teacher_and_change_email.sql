-- Two admin corrections: bring a deactivated teacher back, and fix a person's email.

-- Reactivation ---------------------------------------------------------------------------------------------------------
-- Only flips the teacher back to active. What deactivation did stays done: the future lessons are gone, the students were
-- released as "unassigned" and the pending takeover requests were closed. The teacher gets students back the normal
-- way, by asking for them (request_takeover) and the admin approving. The CV shows again where its switches say so.
create function public.reactivate_teacher(p_teacher_id uuid) returns void
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
  if v_active then
    raise exception 'the teacher is already active' using errcode = 'PT409';
  end if;

  update public.teachers set is_active = true where profile_id = p_teacher_id;
end $$;

-- Linking a profile to an existing Google account ------------------------------------------------------------------------
-- The same rules as the sign-in triggers (a confirmed Google account with this email, and not already someone's), for the
-- case where the profile's email changes and the account it should belong to may already exist.
create function private.link_profile_to_google_account(p_profile_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.profiles p
     set user_id = u.id,
         avatar_url = coalesce(p.avatar_url, u.raw_user_meta_data ->> 'avatar_url')
    from auth.users u
   where p.id = p_profile_id and p.user_id is null
     and lower(btrim(u.email)) = p.email
     and u.email_confirmed_at is not null
     and coalesce(u.raw_app_meta_data ->> 'provider', '') = 'google'
     and not exists (select 1 from public.profiles other where other.user_id = u.id)
$$;

-- Changing an email ---------------------------------------------------------------------------------------------------------
-- For a typo made when the person was approved, or an address that changed. Everything that belongs to the profile
-- (roles, students, lessons, CV, devices) stays; only the Google account behind it changes. The old account is cut off at
-- once: it is just an unknown Google account from now on. If the new address already has a Google account, the profile
-- is linked to it right away, otherwise at the first sign-in with it.
-- Not for the admin's own profile, which would lock them out.
create function public.change_profile_email(p_profile_id uuid, p_new_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_new_email, '')));
  v_current text;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254 then
    raise exception 'invalid email' using errcode = 'PT400';
  end if;

  select email into v_current from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'person not found' using errcode = 'PT404';
  end if;
  if p_profile_id = private.current_profile_id() then
    raise exception 'you cannot change your own email' using errcode = 'PT403';
  end if;

  if v_current = v_email then
    return;
  end if;
  if exists (select 1 from public.profiles where email = v_email) then
    raise exception 'this email already belongs to another person' using errcode = 'PT409';
  end if;

  begin
    update public.profiles set email = v_email, user_id = null, avatar_url = null where id = p_profile_id;
  exception when unique_violation then
    -- somebody took the address between the check and the update
    raise exception 'this email already belongs to another person' using errcode = 'PT409';
  end;

  perform private.link_profile_to_google_account(p_profile_id);
end $$;

revoke all on function public.reactivate_teacher(uuid) from public, anon;
revoke all on function public.change_profile_email(uuid, text) from public, anon;
grant execute on function public.reactivate_teacher(uuid) to authenticated;
grant execute on function public.change_profile_email(uuid, text) to authenticated;
