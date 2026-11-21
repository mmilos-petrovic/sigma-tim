-- Phase 8a: somebody is told when notices do not get through, and old records do not pile up for ever.
--
-- 1. A notice that has given up now knows when (`failed_at`), so "three failed within an hour" can be counted.
-- 2. The administrator's overview asks for two numbers: notices that failed and still wait for a resend, and notices
--    that nobody has even tried for ten minutes (the sending job or the function is not running).
-- 3. A job every five minutes writes a `delivery_alert` notice to every administrator when three or more notices failed
--    within the last hour (at most one alert an hour). It travels through the same outbox, by push and by email.
--    It cannot report a function that does not run at all: that case shows only as the second number above.
-- 4. A job every night deletes notices older than a year that are done (sent, or failed for good) and the history of the
--    scheduled jobs older than seven days.

alter table public.notifications add column failed_at timestamptz;

-- Notices that failed before this migration are old news: they count as failed on the overview, but never raise an alert.
update public.notifications set failed_at = created_at
 where sent_at is null and attempts >= private.max_notification_attempts();

insert into public.notification_kinds (kind, email_fallback, always_email, ignores_quiet_hours)
values ('delivery_alert', true, true, true);

-- The attempt failed. Same as before, and when this was the last one (or nothing can be done) the notice is dated as failed.
create or replace function public.fail_notification(p_id bigint, p_error text, p_give_up boolean default false) returns void
language sql security definer set search_path = '' as $$
  update public.notifications n
     set last_error = left(coalesce(p_error, 'unknown error'), 500),
         attempts = case when coalesce(p_give_up, false) then private.max_notification_attempts() else n.attempts end,
         failed_at = case when coalesce(p_give_up, false) or n.attempts >= private.max_notification_attempts()
                          then now() else n.failed_at end
   where n.id = p_id and n.sent_at is null
$$;

-- Sends a failed notice again (a new round of attempts, at once); it is not a failure any more.
create or replace function public.admin_resend_notification(p_id bigint) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  update public.notifications
     set attempts = 0, last_error = null, deliver_after = now(), failed_at = null
   where id = p_id and sent_at is null and attempts >= private.max_notification_attempts();
  if not found then
    if exists (select 1 from public.notifications where id = p_id) then
      raise exception 'only a failed notice can be sent again' using errcode = 'PT409';
    end if;
    raise exception 'notice not found' using errcode = 'PT404';
  end if;
end $$;

-- The overview -------------------------------------------------------------------------------------------------------------
-- failed:  notices that gave up and were not sent again (the same ones the log shows as "failed")
-- overdue: notices that were due more than ten minutes ago and have not been tried (a notice that is being retried, held
--          back by quiet hours or by the daily email limit has a time in the future, so it is not counted)
create function public.admin_notification_health() returns table (failed integer, overdue integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  return query
  select (count(*) filter (where n.attempts >= private.max_notification_attempts()))::integer,
         (count(*) filter (where n.attempts < private.max_notification_attempts()
                             and n.deliver_after <= now() - interval '10 minutes'))::integer
    from public.notifications n
   where n.sent_at is null;
end $$;

revoke all on function public.admin_notification_health() from public, anon;
grant execute on function public.admin_notification_health() to authenticated;

-- The alert ------------------------------------------------------------------------------------------------------------------
-- Three failures within an hour (the alert's own failures do not count) tell every administrator once; the next alert
-- comes an hour later at the earliest, if it is still going on. Returns how many alerts were written.
create function private.alert_failing_notices() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_failed integer;
  v_written integer;
begin
  select count(*) into v_failed
    from public.notifications n
   where n.failed_at > now() - interval '1 hour' and n.kind <> 'delivery_alert';
  if v_failed < 3 then
    return 0;
  end if;
  if exists (
    select 1 from public.notifications n
     where n.kind = 'delivery_alert' and n.created_at > now() - interval '1 hour'
  ) then
    return 0;
  end if;

  insert into public.notifications (recipient_id, kind, payload)
  select p.id, 'delivery_alert', jsonb_build_object('failed', v_failed)
    from public.profiles p
   where p.is_admin and p.erased_at is null;
  get diagnostics v_written = row_count;
  return v_written;
end $$;

revoke all on function private.alert_failing_notices() from public, anon, authenticated;

-- Clearing out -----------------------------------------------------------------------------------------------------------------
-- A notice that is still to be sent or tried again is never deleted, however old. Returns how many notices were deleted.
create function private.purge_old_records() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_deleted integer;
begin
  delete from public.notifications n
   where n.created_at < now() - interval '1 year'
     and (n.sent_at is not null or n.attempts >= private.max_notification_attempts());
  get diagnostics v_deleted = row_count;

  -- pg_cron keeps a row for every run of every job (several thousand a day) and never deletes any
  if to_regclass('cron.job_run_details') is not null then
    execute 'delete from cron.job_run_details where coalesce(end_time, start_time) < now() - interval ''7 days''';
  end if;
  return v_deleted;
end $$;

revoke all on function private.purge_old_records() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('alert-failing-notices', '*/5 * * * *', 'select private.alert_failing_notices()');
    perform cron.schedule('purge-old-records', '15 3 * * *', 'select private.purge_old_records()');
  else
    raise notice 'pg_cron is not available: nobody will be alerted and old records will stay';
  end if;
end $$;
