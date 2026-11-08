-- A student or parent can read the name of every teacher the student has a lesson with, not only the current teacher.
--
-- Until now a student could only read the profile of the teacher they are assigned to. After a takeover or a
-- deactivation the old teacher disappeared from their view, and so did the name on every lesson that teacher gave.
-- The link is a lesson the student really takes part in (a cancelled one no longer counts; an open slot never did).
--
-- Only the profile (name) opens up. The teacher row, the phone number and the classmates stay hidden: those rules
-- live in other policies and are untouched.

create or replace function private.can_see_profile(p_profile_id uuid) returns boolean
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
    or exists (
      select 1
        from public.lesson_students ls join public.lessons l on l.id = ls.lesson_id
       where l.teacher_id = p_profile_id
         and ls.student_id in (select private.my_student_ids())
    )
$$;
