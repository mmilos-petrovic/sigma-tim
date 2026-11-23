-- The subject of a request is the choice of the person who made it, for as long as the request is open.
--
-- Until now only a request without a subject (a student a teacher left behind) could be given one, and a request made
-- through the sign-up form kept the subject it was made for. A parent or a student may now change it on any open request:
-- the offers of teachers who do not teach the new subject are withdrawn (as before), and the teachers of the new subject
-- see the request from then on. A request whose teacher has been chosen or assigned keeps its subject.

create or replace function public.set_enrolment_subject(p_request_id uuid, p_subject_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_request public.enrolment_requests;
begin
  select * into v_request from public.enrolment_requests where id = p_request_id for update;
  if not found or not private.can_act_on_request(p_request_id) then
    raise exception 'request not found' using errcode = 'PT404';
  end if;
  if v_request.status <> 'open' then
    raise exception 'the subject cannot be changed here' using errcode = 'PT409';
  end if;
  if p_subject_id is null or not exists (
       select 1 from public.teacher_subjects ts join public.teachers t on t.profile_id = ts.teacher_id and t.is_active
        where ts.subject_id = p_subject_id) then
    raise exception 'nobody teaches this subject' using errcode = 'PT400';
  end if;

  update public.enrolment_requests set subject_id = p_subject_id where id = p_request_id;
  delete from public.enrolment_offers o
   where o.request_id = p_request_id
     and not exists (select 1 from public.teacher_subjects ts where ts.teacher_id = o.teacher_id and ts.subject_id = p_subject_id);
end $$;
