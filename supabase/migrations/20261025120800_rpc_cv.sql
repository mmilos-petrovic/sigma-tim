-- Reading CVs outside the owner's own editor.
--
-- Two audiences, two independent switches on the CV: signed-out visitors see CVs with show_public, signed-in members
-- see CVs with show_members. A deactivated teacher's CV is hidden from both. The functions expose CV fields only:
-- never an email, a teacher id or anything else from the teacher's record.

create function private.list_cvs(p_public boolean)
returns table (slug text, first_name text, last_name text, about text, photo_path text, subjects text[], updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select c.slug, p.first_name, p.last_name, c.about, c.photo_path,
         array(
           select s.name
             from public.teacher_subjects ts join public.subjects s on s.id = ts.subject_id
            where ts.teacher_id = c.teacher_id
            order by s.name
         ),
         c.updated_at
    from public.teacher_cv c
    join public.teachers t on t.profile_id = c.teacher_id and t.is_active
    join public.profiles p on p.id = c.teacher_id
   where case when p_public then c.show_public else c.show_members end
   order by p.last_name, p.first_name
$$;

create function private.get_cv(p_slug text, p_public boolean) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
           'slug', c.slug,
           'first_name', p.first_name,
           'last_name', p.last_name,
           'about', c.about,
           'photo_path', c.photo_path,
           'subjects', coalesce((
             select jsonb_agg(s.name order by s.name)
               from public.teacher_subjects ts join public.subjects s on s.id = ts.subject_id
              where ts.teacher_id = c.teacher_id
           ), '[]'),
           'experience', coalesce((
             select jsonb_agg(
                      jsonb_build_object('employer', e.employer, 'position', e.position, 'period', e.period, 'description', e.description)
                      order by e.sort_order, e.id)
               from public.cv_experience e where e.cv_id = c.id
           ), '[]'),
           'education', coalesce((
             select jsonb_agg(
                      jsonb_build_object('institution', e.institution, 'degree', e.degree, 'period', e.period)
                      order by e.sort_order, e.id)
               from public.cv_education e where e.cv_id = c.id
           ), '[]'),
           'skills', coalesce((
             select jsonb_agg(k.skill order by k.sort_order, k.id)
               from public.cv_skills k where k.cv_id = c.id
           ), '[]'),
           'updated_at', c.updated_at
         )
    from public.teacher_cv c
    join public.teachers t on t.profile_id = c.teacher_id and t.is_active
    join public.profiles p on p.id = c.teacher_id
   where c.slug = p_slug
     and case when p_public then c.show_public else c.show_members end
$$;

create function public.list_public_cvs()
returns table (slug text, first_name text, last_name text, about text, photo_path text, subjects text[], updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select * from private.list_cvs(true)
$$;

create function public.get_public_cv(p_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.get_cv(p_slug, true)
$$;

create function public.list_member_cvs()
returns table (slug text, first_name text, last_name text, about text, photo_path text, subjects text[], updated_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  return query select * from private.list_cvs(false);
end $$;

create function public.get_member_cv(p_slug text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_member() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  return private.get_cv(p_slug, false);
end $$;

revoke all on function public.list_public_cvs() from public;
revoke all on function public.get_public_cv(text) from public;
revoke all on function public.list_member_cvs() from public, anon;
revoke all on function public.get_member_cv(text) from public, anon;

grant execute on function public.list_public_cvs() to anon, authenticated;
grant execute on function public.get_public_cv(text) to anon, authenticated;
grant execute on function public.list_member_cvs() to authenticated;
grant execute on function public.get_member_cv(text) to authenticated;
