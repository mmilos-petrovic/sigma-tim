-- Phase 7b: what the CV editor needs from the database.
--
--  * two rules on the table itself, so no way of writing a CV can break them: a CV that anybody can see (either switch on)
--    has the "about" text, and the photo is a file of the teacher's own folder in the `cv-photos` bucket;
--  * `save_my_cv`: the whole CV in one call, in one transaction. The editor replaces the lists of experience, education and
--    skills, and doing that row by row from the browser could lose half of them when the connection drops.
-- The photo is changed on the table directly (an upload, then an update of `photo_path`, as the policies already allow).

-- A CV nobody could see anyway (both switches are off by default) does not need to be touched; one that was switched on
-- without text is switched off, so the new rule can hold for every row.
update public.teacher_cv
   set show_public = false, show_members = false
 where (show_public or show_members) and btrim(coalesce(about, '')) = '';

update public.teacher_cv
   set photo_path = null
 where photo_path is not null
   and photo_path !~ ('^' || teacher_id::text || '/[0-9a-f-]{36}\.(jpg|webp)$');

alter table public.teacher_cv
  add constraint teacher_cv_shown_has_about check (not (show_public or show_members) or btrim(coalesce(about, '')) <> ''),
  add constraint teacher_cv_photo_in_own_folder check (photo_path is null or photo_path ~ ('^' || teacher_id::text || '/[0-9a-f-]{36}\.(jpg|webp)$'));

-- Saves the caller's CV: the text, the two switches and the three lists. Creates the CV the first time (the public link is
-- made then and never changes). Each list is replaced by the one given, in that order. Nothing is saved when anything is wrong.
create function public.save_my_cv(
  p_about text, p_show_public boolean, p_show_members boolean,
  p_experience jsonb, p_education jsonb, p_skills jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := private.current_teacher_id();
  v_cv uuid;
  v_about text := nullif(btrim(coalesce(p_about, '')), '');
begin
  if v_me is null then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_show_public is null or p_show_members is null
     or jsonb_typeof(p_experience) is distinct from 'array' or jsonb_typeof(p_education) is distinct from 'array'
     or jsonb_typeof(p_skills) is distinct from 'array'
     or jsonb_array_length(p_experience) > 20 or jsonb_array_length(p_education) > 20 or jsonb_array_length(p_skills) > 50 then
    raise exception 'invalid CV' using errcode = 'PT400';
  end if;
  if (p_show_public or p_show_members) and v_about is null then
    raise exception 'write the about text before showing the CV' using errcode = 'PT409';
  end if;

  insert into public.teacher_cv (teacher_id, about, show_public, show_members)
  values (v_me, v_about, p_show_public, p_show_members)
  on conflict (teacher_id) do update
    set about = excluded.about, show_public = excluded.show_public, show_members = excluded.show_members
  returning id into v_cv;

  delete from public.cv_experience where cv_id = v_cv;
  insert into public.cv_experience (cv_id, employer, position, period, description, sort_order)
  select v_cv, coalesce(btrim(e ->> 'employer'), ''), coalesce(btrim(e ->> 'position'), ''),
         nullif(btrim(coalesce(e ->> 'period', '')), ''), nullif(btrim(coalesce(e ->> 'description', '')), ''), ord::integer
    from jsonb_array_elements(p_experience) with ordinality as t(e, ord);

  delete from public.cv_education where cv_id = v_cv;
  insert into public.cv_education (cv_id, institution, degree, period, sort_order)
  select v_cv, coalesce(btrim(e ->> 'institution'), ''), nullif(btrim(coalesce(e ->> 'degree', '')), ''),
         nullif(btrim(coalesce(e ->> 'period', '')), ''), ord::integer
    from jsonb_array_elements(p_education) with ordinality as t(e, ord);

  delete from public.cv_skills where cv_id = v_cv;
  insert into public.cv_skills (cv_id, skill, sort_order)
  select v_cv, coalesce(btrim(s #>> '{}'), ''), ord::integer
    from jsonb_array_elements(p_skills) with ordinality as t(s, ord);
end $$;

revoke all on function public.save_my_cv(text, boolean, boolean, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_my_cv(text, boolean, boolean, jsonb, jsonb, jsonb) to authenticated;
