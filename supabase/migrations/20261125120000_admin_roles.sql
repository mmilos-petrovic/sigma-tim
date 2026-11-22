-- The main administrator can make a teacher an administrator, and take that away again.
--
-- There is exactly one MAIN administrator (`profiles.is_main_admin`, set here for petrovicmilos@gmail.com and by the
-- bootstrap script and the seed; the app cannot change it). Every administrator has every administrator ability, because
-- they all go through `private.is_admin()`, except two that only the main administrator has:
--   - `grant_admin(teacher)`   makes an active teacher an administrator
--   - `revoke_admin(person)`   takes the role away again (the person stays a teacher); never from the main administrator
--
-- An account that is an administrator is protected from the OTHER administrators in everything that decides who the account
-- is or whether it can work: its email (changing it would hand the account to whoever owns the new address), whether the
-- teacher is active, the phone number and the teacher's subjects and locations. Only the main administrator may change those
-- of another administrator; an administrator may still change their own phone, locations and subjects. Erasing an
-- administrator is refused for everybody (take the role away first), which is unchanged.

alter table public.profiles add column is_main_admin boolean not null default false;
alter table public.profiles add constraint profiles_main_admin_is_admin check (not is_main_admin or is_admin);
create unique index profiles_one_main_admin on public.profiles (is_main_admin) where is_main_admin;

update public.profiles set is_main_admin = true where email = 'petrovicmilos@gmail.com' and is_admin;

-- Who is asking ----------------------------------------------------------------------------------------------------------------
create function private.is_main_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_main_admin from public.profiles where user_id = auth.uid()), false)
$$;

revoke all on function private.is_main_admin() from public, anon;
grant execute on function private.is_main_admin() to authenticated;

-- True when the profile is an administrator and the caller is neither the main administrator nor that very person: the caller
-- may not change who the account is or whether it can work.
create function private.admin_account_is_off_limits(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = p_profile_id and is_admin)
     and not private.is_main_admin()
     and p_profile_id is distinct from private.current_profile_id()
$$;

revoke all on function private.admin_account_is_off_limits(uuid) from public, anon;
grant execute on function private.admin_account_is_off_limits(uuid) to authenticated;

-- The screen needs to know whether to offer the two buttons ------------------------------------------------------------------------
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
  is_main_admin boolean
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.first_name, p.last_name, p.avatar_url, p.is_admin,
         exists (select 1 from public.teachers t where t.profile_id = p.id and t.is_active),
         exists (select 1 from public.students s where s.profile_id = p.id),
         exists (select 1 from public.parents pa where pa.profile_id = p.id),
         p.is_main_admin
    from public.profiles p
   where p.user_id = auth.uid()
$$;

revoke all on function public.my_roles() from public, anon;
grant execute on function public.my_roles() to authenticated;

-- Making and unmaking an administrator ---------------------------------------------------------------------------------------------
create function public.grant_admin(p_teacher_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_active boolean;
  v_erased timestamptz;
  v_admin boolean;
begin
  if not private.is_main_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select t.is_active, p.erased_at, p.is_admin into v_active, v_erased, v_admin
    from public.teachers t join public.profiles p on p.id = t.profile_id
   where t.profile_id = p_teacher_id
     for update of t, p;
  if not found then
    raise exception 'teacher not found' using errcode = 'PT404';
  end if;
  if v_erased is not null then
    raise exception 'this person was erased' using errcode = 'PT409';
  end if;
  if not v_active then
    raise exception 'only an active teacher can become an administrator' using errcode = 'PT409';
  end if;
  if v_admin then
    raise exception 'this person is already an administrator' using errcode = 'PT409';
  end if;

  update public.profiles set is_admin = true where id = p_teacher_id;
end $$;

create function public.revoke_admin(p_profile_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_admin boolean;
  v_main boolean;
begin
  if not private.is_main_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select is_admin, is_main_admin into v_admin, v_main from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception 'person not found' using errcode = 'PT404';
  end if;
  if v_main then
    raise exception 'the main administrator cannot be removed' using errcode = 'PT409';
  end if;
  if not v_admin then
    raise exception 'this person is not an administrator' using errcode = 'PT409';
  end if;

  update public.profiles set is_admin = false where id = p_profile_id;
end $$;

revoke all on function public.grant_admin(uuid) from public, anon;
revoke all on function public.revoke_admin(uuid) from public, anon;
grant execute on function public.grant_admin(uuid) to authenticated;
grant execute on function public.revoke_admin(uuid) to authenticated;

-- An administrator's account is protected from the other administrators -----------------------------------------------------------------
-- (each function below is the latest version of the same function with one added check, marked)

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
  -- added: only the main administrator changes the email of an administrator
  if private.admin_account_is_off_limits(p_profile_id) then
    raise exception 'not allowed' using errcode = 'PT403';
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

create or replace function public.deactivate_teacher(p_teacher_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_active boolean;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  -- added
  if private.admin_account_is_off_limits(p_teacher_id) then
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

create or replace function public.reactivate_teacher(p_teacher_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_active boolean;
  v_erased timestamptz;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  -- added
  if private.admin_account_is_off_limits(p_teacher_id) then
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

create or replace function public.set_person_phone(p_profile_id uuid, p_phone text) returns void
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
  -- added: another administrator's number is the main administrator's to change
  if private.admin_account_is_off_limits(p_profile_id) then
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

create or replace function public.set_teacher_locations(p_teacher_id uuid, p_location_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_erased timestamptz;
  v_locations uuid[];
  v_removed uuid[];
  v_blockers jsonb;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  -- added
  if private.admin_account_is_off_limits(p_teacher_id) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select p.erased_at into v_erased
    from public.teachers t join public.profiles p on p.id = t.profile_id
   where t.profile_id = p_teacher_id;
  if not found then
    raise exception 'teacher not found' using errcode = 'PT404';
  end if;
  if v_erased is not null then
    raise exception 'this teacher was erased' using errcode = 'PT409';
  end if;

  select coalesce(array_agg(l), '{}') into v_locations from unnest(p_location_ids) as l where l is not null;
  if cardinality(v_locations) = 0 then
    raise exception 'a teacher needs at least one location' using errcode = 'PT400';
  end if;
  if exists (select 1 from unnest(v_locations) as l where not exists (select 1 from public.locations x where x.id = l)) then
    raise exception 'unknown location' using errcode = 'PT400';
  end if;

  select coalesce(array_agg(tl.location_id), '{}') into v_removed
    from public.teacher_locations tl
   where tl.teacher_id = p_teacher_id and not (tl.location_id = any (v_locations));
  v_blockers := private.location_blockers(p_teacher_id, v_removed);
  if v_blockers is not null then
    raise exception 'this teacher still has lessons or free slots at this location'
      using errcode = 'PT409', detail = v_blockers::text;
  end if;

  insert into public.teacher_locations (teacher_id, location_id)
  select p_teacher_id, l from unnest(v_locations) as l
  on conflict do nothing;
  delete from public.teacher_locations where teacher_id = p_teacher_id and not (location_id = any (v_locations));
end $$;

-- the subjects are written straight to the table, so the policies carry the same rule
drop policy teacher_subjects_insert_admin on public.teacher_subjects;
drop policy teacher_subjects_delete_admin on public.teacher_subjects;
create policy teacher_subjects_insert_admin on public.teacher_subjects for insert to authenticated
  with check ((select private.is_admin()) and not (select private.admin_account_is_off_limits(teacher_id)));
create policy teacher_subjects_delete_admin on public.teacher_subjects for delete to authenticated
  using ((select private.is_admin()) and not (select private.admin_account_is_off_limits(teacher_id)));
