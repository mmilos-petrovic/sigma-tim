-- Phase 7d: the enrolment flow replaces the takeover of unassigned students, and the sign-up form starts switched off.
--
--  * `form_enabled` was created on. The screens that teachers and the administrator need to handle sign-ups come with this
--    phase, so a database that receives the enrolment tables must not take sign-ups until the administrator switches the
--    form on. (A database that has the row already is switched off too: the administrator switches it on from the screen.)
--  * A teacher no longer asks for an unassigned student and the administrator no longer approves: the teacher offers, the
--    student or parent chooses, and the administrator may assign anybody at any time (`admin_assign_enrolment`). A pending
--    takeover request becomes an offer for the student's open request, and the old request is closed.
--  * `request_takeover`, `approve_takeover` and `reject_takeover` are dropped. The table `takeover_requests` stays as the
--    record of what happened (nothing writes to it any more); the functions that close or remove a teacher's or a student's
--    rows still touch it and have nothing to find.

alter table public.enrolment_settings alter column form_enabled set default false;
update public.enrolment_settings set form_enabled = false where singleton;

-- Pending takeover requests become offers, with the date of the request. A student who has no open request, or a teacher
-- who is no longer active, gets no offer. Every pending request is closed afterwards. Returns how many offers were made.
create function private.convert_takeovers_to_offers() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_offers integer;
begin
  insert into public.enrolment_offers (request_id, teacher_id, created_at)
  select r.id, tr.teacher_id, tr.created_at
    from public.takeover_requests tr
    join public.enrolment_requests r on r.student_id = tr.student_id and r.status = 'open'
    join public.teachers t on t.profile_id = tr.teacher_id and t.is_active
   where tr.status = 'pending'
  on conflict do nothing;
  get diagnostics v_offers = row_count;

  update public.takeover_requests
     set status = 'rejected', resolved_at = now()
   where status = 'pending';
  return v_offers;
end $$;

revoke all on function private.convert_takeovers_to_offers() from public, anon, authenticated;

select private.convert_takeovers_to_offers();

drop function public.request_takeover(uuid);
drop function public.approve_takeover(uuid);
drop function public.reject_takeover(uuid);
