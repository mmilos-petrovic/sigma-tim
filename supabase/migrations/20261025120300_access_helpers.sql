-- Functions the RLS policies are built from.
--
-- They are SECURITY DEFINER so they can read the identity tables without going through RLS themselves, which is what
-- keeps policies on different tables from recursing into each other. They only ever answer questions about the
-- caller (`auth.uid()`), and they live in `private`, a schema the Data API does not expose.

-- The caller's profile id, or null for a Google account the school has not approved.
create function private.current_profile_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.profiles where user_id = auth.uid()
$$;

-- The caller's profile id if they are an active teacher; deactivated teachers lose every teacher privilege.
create function private.current_teacher_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select t.profile_id
    from public.teachers t join public.profiles p on p.id = t.profile_id
   where p.user_id = auth.uid() and t.is_active
$$;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select is_admin from public.profiles where user_id = auth.uid()), false)
$$;

create function private.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select private.current_teacher_id() is not null
$$;

-- Anyone the school has approved in a role that is still in force.
create function private.is_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.profiles p
     where p.user_id = auth.uid()
       and (
         p.is_admin
         or exists (select 1 from public.teachers t where t.profile_id = p.id and t.is_active)
         or exists (select 1 from public.students s where s.profile_id = p.id)
         or exists (select 1 from public.parents pa where pa.profile_id = p.id)
       )
  )
$$;

-- Student records the caller is, or is a parent of.
create function private.my_student_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select s.id
    from public.students s join public.profiles p on p.id = s.profile_id
   where p.user_id = auth.uid()
  union
  select ps.student_id
    from public.parent_students ps join public.profiles p on p.id = ps.parent_id
   where p.user_id = auth.uid()
$$;

-- The caller is the student's own teacher.
create function private.is_teacher_of(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
     where s.id = p_student_id and s.teacher_id = private.current_teacher_id()
  )
$$;

-- Teachers see their own students and the unassigned ones.
create function private.can_teacher_see_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
     where s.id = p_student_id
       and private.current_teacher_id() is not null
       and (s.teacher_id = private.current_teacher_id() or s.teacher_id is null)
  )
$$;

-- The caller is the student or a parent of one of the lesson's participants.
create function private.is_participant(p_lesson_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lesson_students ls
     where ls.lesson_id = p_lesson_id and ls.student_id in (select private.my_student_ids())
  )
$$;

create function private.is_teacher_of_lesson(p_lesson_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.lessons l
     where l.id = p_lesson_id and l.teacher_id = private.current_teacher_id()
  )
$$;

-- The caller is a student of this teacher, or a parent of one.
create function private.is_student_of_teacher(p_teacher_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.students s
     where s.teacher_id = p_teacher_id and s.id in (select private.my_student_ids())
  )
$$;

create function private.owns_cv(p_cv_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.teacher_cv c
     where c.id = p_cv_id and c.teacher_id = private.current_teacher_id()
  )
$$;

-- Teacher rows: colleagues and admin see all; students and parents see the teachers of their children.
create function private.can_see_teacher(p_teacher_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin()
      or private.current_teacher_id() is not null
      or p_teacher_id = private.current_profile_id()
      or private.is_student_of_teacher(p_teacher_id)
$$;

create function private.can_see_parent(p_parent_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin()
      or p_parent_id = private.current_profile_id()
      or exists (
        select 1 from public.parent_students ps
         where ps.parent_id = p_parent_id and private.can_teacher_see_student(ps.student_id)
      )
$$;

-- Whose name and email the caller may read.
--   everybody: themselves          admin: everybody
--   teachers:  colleagues, their own and the unassigned students, and those students' parents
--   students and parents: the teachers of their records, and a parent also sees their children
create function private.can_see_profile(p_profile_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select
    private.is_admin()
    or p_profile_id = private.current_profile_id()
    or (
      private.current_teacher_id() is not null
      and (
        exists (select 1 from public.teachers t where t.profile_id = p_profile_id)
        or exists (
          select 1 from public.students s
           where s.profile_id = p_profile_id and private.can_teacher_see_student(s.id)
        )
        or exists (
          select 1 from public.parent_students ps
           where ps.parent_id = p_profile_id and private.can_teacher_see_student(ps.student_id)
        )
      )
    )
    or exists (
      select 1 from public.students s
       where (s.teacher_id = p_profile_id or s.profile_id = p_profile_id)
         and s.id in (select private.my_student_ids())
    )
$$;

-- Participant limit per lesson: one constant, used by the database and readable by the client.
create function public.max_lesson_students() returns integer
language sql immutable set search_path = '' as $$
  select 4
$$;
revoke all on function public.max_lesson_students() from public, anon;
grant execute on function public.max_lesson_students() to authenticated;
