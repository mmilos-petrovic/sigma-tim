-- A teacher corrects the email of their own student.
--
-- The core of changing an email (validate, refuse an address that belongs to somebody else, cut off the old Google
-- account, link the new one if it already exists) moves into one private function, so that the administrator's and the
-- teacher's version cannot drift apart. change_profile_email behaves exactly as before.

create function private.apply_email_change(p_profile_id uuid, p_new_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_new_email, '')));
  v_current text;
begin
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
  begin
    update public.profiles set email = v_email, user_id = null, avatar_url = null where id = p_profile_id;
  exception when unique_violation then
    -- the address belongs to somebody else (the column is unique)
    raise exception 'this email already belongs to another person' using errcode = 'PT409';
  end;

  perform private.link_profile_to_google_account(p_profile_id);
end $$;

create or replace function public.change_profile_email(p_profile_id uuid, p_new_email text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  perform private.apply_email_change(p_profile_id, p_new_email);
end $$;

-- Only for a person who is this teacher's and nobody else's. Changing the email moves the person to a different Google
-- account at once, which would also change what another teacher's student, a colleague or the parent of another
-- teacher's child can reach: those go through the administrator.
create function public.change_student_email(p_student_id uuid, p_new_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid;
  v_profile uuid;
begin
  if not private.is_teacher_of(p_student_id) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  v_me := private.current_teacher_id();
  select profile_id into v_profile from public.students where id = p_student_id;

  if exists (select 1 from public.teachers where profile_id = v_profile)
     or exists (select 1 from public.profiles where id = v_profile and is_admin) then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if exists (select 1 from public.students where profile_id = v_profile and teacher_id is distinct from v_me)
     or exists (
       select 1
         from public.parent_students ps join public.students child on child.id = ps.student_id
        where ps.parent_id = v_profile and child.teacher_id is distinct from v_me
     ) then
    raise exception 'this person is also connected to another teacher' using errcode = 'PT409';
  end if;

  perform private.apply_email_change(v_profile, p_new_email);
end $$;

revoke all on function public.change_student_email(uuid, text) from public, anon;
grant execute on function public.change_student_email(uuid, text) to authenticated;
