-- Repairs the readers of a request on databases that applied `20261127120000_member_profile.sql` before it was edited. That
-- file was changed in place (the readers no longer say anything about the waiting period), but a migration that has run is
-- never run again, so the deployed `my_enrolment_requests` and `admin_list_enrolments` still read `choice_opened_at`, which
-- `20261128120000_remove_choice_waiting.sql` dropped. The three functions are created again as they are in that file.

-- The readers of a request show the teacher at school too --------------------------------------------------------------------------
drop function if exists public.my_enrolment_requests();
create function public.my_enrolment_requests()
returns table (
  id uuid, applicant_role public.enrolment_role, source text, status public.enrolment_status,
  subject_id uuid, subject_name text, student_first_name text, student_last_name text, contact_phone text,
  school text, grade text, city_part text, situation text,
  profile_completed boolean, waiting_for_approval boolean, listed boolean, days_waiting integer,
  offers_count integer, chosen_teacher_id uuid, student_id uuid, school_teacher text
)
language sql stable security definer set search_path = '' as $$
  select r.id, r.applicant_role, r.source, r.status, r.subject_id, sub.name,
         r.student_first_name, r.student_last_name, r.contact_phone, r.school, r.grade, r.city_part, r.situation,
         r.profile_completed_at is not null,
         r.needs_approval and r.approved_at is null,
         r.listed_at is not null,
         case when r.listed_at is null then 0 else greatest(0, floor(extract(epoch from (now() - r.listed_at)) / 86400))::integer end,
         (select count(*)::integer from public.enrolment_offers o join public.teachers t on t.profile_id = o.teacher_id and t.is_active
           where o.request_id = r.id),
         r.chosen_teacher_id, r.student_id, r.school_teacher
    from public.enrolment_requests r
    left join public.subjects sub on sub.id = r.subject_id
   where r.status <> 'rejected' and private.can_act_on_request(r.id)
   order by r.created_at desc
$$;
revoke all on function public.my_enrolment_requests() from public, anon;
grant execute on function public.my_enrolment_requests() to authenticated;

drop function if exists public.admin_list_enrolments(text);
create function public.admin_list_enrolments(p_state text default null)
returns table (
  request_id uuid, applicant_role public.enrolment_role, source text, status public.enrolment_status, state text,
  subject_name text, student_first_name text, student_last_name text, applicant_email text, phone text, school text, grade text,
  city_part text, situation text, created_at timestamptz, listed_at timestamptz, days_waiting integer,
  chosen_teacher_id uuid, offers jsonb, school_teacher text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  return query
    select * from (
      select r.id, r.applicant_role, r.source, r.status,
             case
               when r.status <> 'open' then r.status::text
               when r.needs_approval and r.approved_at is null then 'needs_approval'
               when r.profile_completed_at is null then 'incomplete'
               else 'open'
             end as state,
             sub.name, r.student_first_name, r.student_last_name, p.email, r.contact_phone, r.school, r.grade, r.city_part,
             r.situation, r.created_at, r.listed_at,
             case when r.listed_at is null then 0
                  else greatest(0, floor(extract(epoch from (now() - r.listed_at)) / 86400))::integer end,
             r.chosen_teacher_id,
             coalesce((
               select jsonb_agg(jsonb_build_object('teacher_id', o.teacher_id, 'name', tp.first_name || ' ' || tp.last_name,
                                                   'offered_at', o.created_at) order by o.created_at)
                 from public.enrolment_offers o join public.profiles tp on tp.id = o.teacher_id
                where o.request_id = r.id), '[]') as offers,
             r.school_teacher
        from public.enrolment_requests r
        join public.profiles p on p.id = r.applicant_id
        left join public.subjects sub on sub.id = r.subject_id
    ) x
     where p_state is null or x.state = p_state
     order by x.created_at desc, x.id
     limit 500;
end $$;
revoke all on function public.admin_list_enrolments(text) from public, anon;
grant execute on function public.admin_list_enrolments(text) to authenticated;

-- Accepting an offer needs no waiting either
create or replace function public.choose_enrolment_teacher(p_request_id uuid, p_teacher_id uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
begin
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found or not private.can_act_on_request(p_request_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.status <> 'open' then
    raise exception 'a teacher was already chosen' using errcode = 'PT409';
  end if;
  if not exists (
    select 1 from public.enrolment_offers o join public.teachers t on t.profile_id = o.teacher_id and t.is_active
     where o.request_id = p_request_id and o.teacher_id = p_teacher_id
  ) then
    raise exception 'this teacher has not offered' using errcode = 'PT400';
  end if;
  return private.place_enrolment(p_request_id, p_teacher_id, 'student', null);
end $$;
