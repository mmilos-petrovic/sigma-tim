-- Row level security and table privileges.
--
-- Two layers, both required: GRANTs decide which operations and columns a role may touch at all, policies decide
-- which rows. Anything not granted here is only reachable through the RPC functions or the service role.
-- `anon` is granted nothing: signed-out visitors only get the two public CV functions.

alter table public.profiles enable row level security;
alter table public.teachers enable row level security;
alter table public.subjects enable row level security;
alter table public.teacher_subjects enable row level security;
alter table public.locations enable row level security;
alter table public.rooms enable row level security;
alter table public.location_photos enable row level security;
alter table public.students enable row level security;
alter table public.parents enable row level security;
alter table public.parent_students enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_students enable row level security;
alter table public.takeover_requests enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notifications enable row level security;
alter table public.teacher_cv enable row level security;
alter table public.cv_experience enable row level security;
alter table public.cv_education enable row level security;
alter table public.cv_skills enable row level security;

-- Start from zero. (service_role keeps its privileges and bypasses RLS: it is the Edge Functions' role.)
revoke all on all tables in schema public from anon, authenticated;

-- People -----------------------------------------------------------------------------------------------------------------------
-- Identity rows are created by the RPCs (create_teacher, add_student, add_parent_to_student) and never by plain inserts,
-- so nobody can attach a role to a profile they happen to know the id of.

grant select on public.profiles to authenticated;
grant update (first_name, last_name, avatar_url) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (private.can_see_profile(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

grant select on public.teachers to authenticated;
grant update (bio, photo_path) on public.teachers to authenticated;
create policy teachers_select on public.teachers for select to authenticated
  using (private.can_see_teacher(profile_id));
create policy teachers_update_own on public.teachers for update to authenticated
  using (profile_id = (select private.current_teacher_id()))
  with check (profile_id = (select private.current_teacher_id()));

grant select, insert, delete on public.teacher_subjects to authenticated;
create policy teacher_subjects_select on public.teacher_subjects for select to authenticated
  using (private.can_see_teacher(teacher_id));
create policy teacher_subjects_insert_admin on public.teacher_subjects for insert to authenticated
  with check ((select private.is_admin()));
create policy teacher_subjects_delete_admin on public.teacher_subjects for delete to authenticated
  using ((select private.is_admin()));

-- teacher_id is not updatable: students change hands only through approve_takeover() and deactivate_teacher().
grant select on public.students to authenticated;
grant update (school, grade, class_section) on public.students to authenticated;
create policy students_select on public.students for select to authenticated
  using (
    (select private.is_admin())
    or id in (select private.my_student_ids())
    or teacher_id = (select private.current_teacher_id())
    or (teacher_id is null and (select private.current_teacher_id()) is not null)
  );
create policy students_update on public.students for update to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.current_teacher_id()))
  with check ((select private.is_admin()) or teacher_id = (select private.current_teacher_id()));

grant select on public.parents to authenticated;
create policy parents_select on public.parents for select to authenticated
  using (private.can_see_parent(profile_id));

grant select on public.parent_students to authenticated;
create policy parent_students_select on public.parent_students for select to authenticated
  using (
    (select private.is_admin())
    or parent_id = (select private.current_profile_id())
    or private.can_teacher_see_student(student_id)
  );

-- Reference data: every approved member reads, admin writes ------------------------------------------------------------------------

do $$
declare
  v_table text;
begin
  foreach v_table in array array['subjects', 'locations', 'rooms', 'location_photos'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', v_table);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_member()))',
                   v_table || '_select', v_table);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select private.is_admin()))',
                   v_table || '_insert_admin', v_table);
    execute format('create policy %I on public.%I for update to authenticated using ((select private.is_admin())) with check ((select private.is_admin()))',
                   v_table || '_update_admin', v_table);
    execute format('create policy %I on public.%I for delete to authenticated using ((select private.is_admin()))',
                   v_table || '_delete_admin', v_table);
  end loop;
end $$;

-- Lessons -------------------------------------------------------------------------------------------------------------------------------
-- Read:   admin everything; a teacher their own lessons and slots; participants (and their parents) their lessons;
--         a teacher's students (and parents) that teacher's free slots. Other teachers' lessons: busy_times() only.
-- Write:  a teacher edits their own lessons. Rows are inserted directly only as free slots; lessons with students come
--         from schedule_lesson(), bookings from claim_slot(), and status changes from the booking functions.

grant select on public.lessons to authenticated;
grant insert (teacher_id, subject_id, location_id, room_id, start_at, end_at, status, origin) on public.lessons to authenticated;
grant update (subject_id, location_id, room_id, start_at, end_at, outcome) on public.lessons to authenticated;
grant delete on public.lessons to authenticated;

create policy lessons_select on public.lessons for select to authenticated
  using (
    (select private.is_admin())
    or teacher_id = (select private.current_teacher_id())
    or (status <> 'open' and private.is_participant(id))
    or (status = 'open' and private.is_student_of_teacher(teacher_id))
  );
create policy lessons_insert_slot on public.lessons for insert to authenticated
  with check (teacher_id = (select private.current_teacher_id()) and status = 'open' and origin = 'slot');
create policy lessons_update_own on public.lessons for update to authenticated
  using (teacher_id = (select private.current_teacher_id()))
  with check (teacher_id = (select private.current_teacher_id()));
create policy lessons_delete_own on public.lessons for delete to authenticated
  using (teacher_id = (select private.current_teacher_id()));

-- A participant sees only their own row (and a parent their children's), never the classmates'.
grant select on public.lesson_students to authenticated;
grant update (note) on public.lesson_students to authenticated;
create policy lesson_students_select on public.lesson_students for select to authenticated
  using (
    (select private.is_admin())
    or student_id in (select private.my_student_ids())
    or private.is_teacher_of_lesson(lesson_id)
  );
create policy lesson_students_update_note on public.lesson_students for update to authenticated
  using (private.is_teacher_of_lesson(lesson_id))
  with check (private.is_teacher_of_lesson(lesson_id));

grant select on public.takeover_requests to authenticated;
create policy takeover_requests_select on public.takeover_requests for select to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.current_teacher_id()));

-- Devices and notifications ------------------------------------------------------------------------------------------------------------------

grant select, insert, delete on public.push_subscriptions to authenticated;
grant update (p256dh, auth, user_agent) on public.push_subscriptions to authenticated;
create policy push_subscriptions_select_own on public.push_subscriptions for select to authenticated
  using (profile_id = (select private.current_profile_id()));
create policy push_subscriptions_insert_own on public.push_subscriptions for insert to authenticated
  with check (profile_id = (select private.current_profile_id()));
create policy push_subscriptions_update_own on public.push_subscriptions for update to authenticated
  using (profile_id = (select private.current_profile_id()))
  with check (profile_id = (select private.current_profile_id()));
create policy push_subscriptions_delete_own on public.push_subscriptions for delete to authenticated
  using (profile_id = (select private.current_profile_id()));

-- notifications: no grant, no policy. Only the service role reads and writes the outbox.

-- CV --------------------------------------------------------------------------------------------------------------------------------------------------
-- The tables are for the owner (and admin, read-only). Everybody else reads CVs through list_/get_ functions, which
-- apply the two visibility switches and expose only CV fields.

grant select, delete on public.teacher_cv to authenticated;
grant insert (teacher_id, about, photo_path, show_public, show_members) on public.teacher_cv to authenticated;
grant update (about, photo_path, show_public, show_members) on public.teacher_cv to authenticated;
create policy teacher_cv_select on public.teacher_cv for select to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.current_teacher_id()));
create policy teacher_cv_insert_own on public.teacher_cv for insert to authenticated
  with check (teacher_id = (select private.current_teacher_id()));
create policy teacher_cv_update_own on public.teacher_cv for update to authenticated
  using (teacher_id = (select private.current_teacher_id()))
  with check (teacher_id = (select private.current_teacher_id()));
create policy teacher_cv_delete_own on public.teacher_cv for delete to authenticated
  using (teacher_id = (select private.current_teacher_id()));

do $$
declare
  v_table text;
begin
  foreach v_table in array array['cv_experience', 'cv_education', 'cv_skills'] loop
    execute format('grant select, insert, delete on public.%I to authenticated', v_table);
    execute format('create policy %I on public.%I for select to authenticated using ((select private.is_admin()) or private.owns_cv(cv_id))',
                   v_table || '_select', v_table);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.owns_cv(cv_id))',
                   v_table || '_insert_own', v_table);
    execute format('create policy %I on public.%I for update to authenticated using (private.owns_cv(cv_id)) with check (private.owns_cv(cv_id))',
                   v_table || '_update_own', v_table);
    execute format('create policy %I on public.%I for delete to authenticated using (private.owns_cv(cv_id))',
                   v_table || '_delete_own', v_table);
  end loop;
end $$;
grant update (employer, position, period, description, sort_order) on public.cv_experience to authenticated;
grant update (institution, degree, period, sort_order) on public.cv_education to authenticated;
grant update (skill, sort_order) on public.cv_skills to authenticated;
