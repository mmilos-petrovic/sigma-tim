-- What the signed-in account is allowed to be, in one call. The client uses it to pick the screen after sign-in.
--
-- No row: a Google account the school has not approved ("you are not a member yet").
-- A row with every role flag false: an approved profile whose only role is no longer in force (a deactivated teacher).
-- Flags follow private.is_member(), so a role the database does not honour is never offered to the client.
-- This only decides which screen to show; every query the client makes is still filtered by RLS.

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
  is_parent boolean
)
language sql stable security definer set search_path = '' as $$
  select p.id, p.email, p.first_name, p.last_name, p.avatar_url, p.is_admin,
         exists (select 1 from public.teachers t where t.profile_id = p.id and t.is_active),
         exists (select 1 from public.students s where s.profile_id = p.id),
         exists (select 1 from public.parents pa where pa.profile_id = p.id)
    from public.profiles p
   where p.user_id = auth.uid()
$$;

revoke all on function public.my_roles() from public, anon;
grant execute on function public.my_roles() to authenticated;
