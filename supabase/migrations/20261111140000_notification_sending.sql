-- Phase 6c: what the Edge Function `send-notifications` needs from the database. The function only talks to the database
-- through the functions below (service role), and a pg_cron job calls the function every minute.
--
-- A notice is taken ("claimed") before it is sent: claiming counts an attempt and moves `deliver_after` forward by the retry
-- delay, so it works as a lease. A function that dies half way, or two runs that overlap, never send the same notice twice;
-- the notice simply comes back after its delay. A notice that was sent is marked by complete_notification().

-- How long a notice waits after an attempt before the next one: 1, 5, 15 minutes, then an hour.
create function private.notification_retry_delay(p_attempt integer) returns interval
language sql immutable set search_path = '' as $$
  select case p_attempt
           when 1 then interval '1 minute'
           when 2 then interval '5 minutes'
           when 3 then interval '15 minutes'
           else interval '1 hour'
         end
$$;

-- Takes the notices that are due and everything needed to send them, in one call:
--   { settings: { welcome_text, school_contact },
--     emails_today: how many emails went out since midnight (school time),
--     emails_resume_at: when a notice held back by the daily email limit may go again (tomorrow, outside quiet hours),
--     notices: [ { id, kind, payload, attempt, final_attempt, recipient: { id, email, first_name, roles... },
--                  config: { email_fallback, always_email }, subscriptions: [ { id, endpoint, p256dh, auth } ] } ] }
create function public.claim_notifications(p_limit integer default 50) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.notification_settings;
  v_notices jsonb;
  v_midnight timestamptz := date_trunc('day', now() at time zone 'Europe/Belgrade') at time zone 'Europe/Belgrade';
  v_tomorrow timestamptz := (date_trunc('day', now() at time zone 'Europe/Belgrade') + interval '1 day') at time zone 'Europe/Belgrade';
begin
  select * into s from public.notification_settings;

  with due as (
    select n.id
      from public.notifications n
     where n.sent_at is null
       and n.attempts < private.max_notification_attempts()
       and n.deliver_after <= now()
     order by n.deliver_after, n.id
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
       for update skip locked
  ), claimed as (
    update public.notifications n
       set attempts = n.attempts + 1,
           deliver_after = now() + private.notification_retry_delay(n.attempts + 1)
      from due
     where n.id = due.id
    returning n.id, n.recipient_id, n.kind, n.payload, n.attempts
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'kind', c.kind,
             'payload', c.payload,
             'attempt', c.attempts,
             'final_attempt', c.attempts >= private.max_notification_attempts(),
             'recipient', jsonb_build_object(
               'id', p.id,
               'email', p.email,
               'first_name', p.first_name,
               'is_admin', p.is_admin,
               'is_teacher', exists (select 1 from public.teachers t where t.profile_id = p.id and t.is_active),
               'is_student', exists (select 1 from public.students st where st.profile_id = p.id),
               'is_parent', exists (select 1 from public.parents pa where pa.profile_id = p.id),
               -- the lesson may be gone (a cancelled one): then this is false and the notice goes to the person's other role
               'teaches_lesson', exists (
                 select 1 from public.lessons l where l.id::text = c.payload ->> 'lesson_id' and l.teacher_id = p.id
               )
             ),
             'config', jsonb_build_object('email_fallback', k.email_fallback, 'always_email', k.always_email),
             'subscriptions', coalesce((
               select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)
                                order by ps.created_at)
                 from public.push_subscriptions ps
                where ps.profile_id = p.id
             ), '[]')
           ) order by c.id), '[]')
    into v_notices
    from claimed c
    join public.profiles p on p.id = c.recipient_id
    join public.notification_kinds k on k.kind = c.kind;

  return jsonb_build_object(
    'settings', jsonb_build_object('welcome_text', s.welcome_text, 'school_contact', s.school_contact),
    'emails_today', (
      select count(*) from public.notifications n where n.channel = 'email' and n.sent_at >= v_midnight
    ),
    'emails_resume_at', coalesce(private.quiet_hours_end(v_tomorrow), v_tomorrow),
    'notices', v_notices
  );
end $$;

-- The notice went out. `p_channel` is how: push, or email when an email was sent (even if a push went too).
create function public.complete_notification(p_id bigint, p_channel text) returns void
language sql security definer set search_path = '' as $$
  update public.notifications
     set sent_at = now(), channel = p_channel, last_error = null
   where id = p_id and sent_at is null
$$;

-- The attempt failed. It is tried again after the retry delay set when it was claimed, unless `p_give_up` is set (nothing can
-- be done about it: no device and no email allowed): then it shows as failed at once, and the administrator can send it again.
create function public.fail_notification(p_id bigint, p_error text, p_give_up boolean default false) returns void
language sql security definer set search_path = '' as $$
  update public.notifications
     set last_error = left(coalesce(p_error, 'unknown error'), 500),
         attempts = case when coalesce(p_give_up, false) then private.max_notification_attempts() else attempts end
   where id = p_id and sent_at is null
$$;

-- Hold a claimed notice back until `p_until` without counting the attempt (the daily email limit was reached).
create function public.defer_notification(p_id bigint, p_until timestamptz, p_reason text) returns void
language sql security definer set search_path = '' as $$
  update public.notifications
     set attempts = greatest(attempts - 1, 0), deliver_after = p_until, last_error = left(coalesce(p_reason, ''), 500)
   where id = p_id and sent_at is null
$$;

-- Devices the push service says are gone (404, 410).
create function public.forget_push_subscriptions(p_ids uuid[]) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where id = any (coalesce(p_ids, '{}'))
$$;

revoke all on function public.claim_notifications(integer) from public, anon, authenticated;
revoke all on function public.complete_notification(bigint, text) from public, anon, authenticated;
revoke all on function public.fail_notification(bigint, text, boolean) from public, anon, authenticated;
revoke all on function public.defer_notification(bigint, timestamptz, text) from public, anon, authenticated;
revoke all on function public.forget_push_subscriptions(uuid[]) from public, anon, authenticated;
grant execute on function public.claim_notifications(integer) to service_role;
grant execute on function public.complete_notification(bigint, text) to service_role;
grant execute on function public.fail_notification(bigint, text, boolean) to service_role;
grant execute on function public.defer_notification(bigint, timestamptz, text) to service_role;
grant execute on function public.forget_push_subscriptions(uuid[]) to service_role;

-- The log: a notice that is being tried, or waits for its next try, is "retrying" (not "waiting", which is quiet hours and the
-- daily email limit). Same function as before apart from the order of the states.
create or replace function public.admin_list_notifications(p_limit integer default 50, p_before bigint default null, p_state text default null)
returns table (
  id bigint, kind text, recipient_name text, recipient_email text, created_at timestamptz, deliver_after timestamptz,
  sent_at timestamptz, channel text, attempts integer, last_error text, state text
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  return query
  select * from (
    select n.id, n.kind, p.first_name || ' ' || p.last_name, p.email, n.created_at, n.deliver_after,
           n.sent_at, n.channel, n.attempts, n.last_error,
           case when n.sent_at is not null then 'sent'
                when n.attempts >= private.max_notification_attempts() then 'failed'
                when n.attempts > 0 then 'retrying'
                when n.deliver_after > now() then 'waiting'
                else 'queued' end as state
      from public.notifications n
      join public.profiles p on p.id = n.recipient_id
     where p_before is null or n.id < p_before
  ) x
  where p_state is null or x.state = p_state
  order by x.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;

-- The call to the Edge Function. The address and the shared secret live in the Vault (two secrets, set once per project by
-- hand, see supabase/README.md); until both exist this does nothing, so a database without them (CI, a new local one) is fine.
create function private.invoke_send_notifications() returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  if to_regclass('vault.decrypted_secrets') is null or to_regclass('net.http_request_queue') is null then
    return false;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_url using 'notifications_function_url';
  execute 'select decrypted_secret from vault.decrypted_secrets where name = $1' into v_secret using 'notifications_cron_secret';
  if coalesce(v_url, '') = '' or coalesce(v_secret, '') = '' then
    return false;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  return true;
end $$;

revoke all on function private.invoke_send_notifications() from public, anon, authenticated;

-- Every minute, like the reminders. pg_net and pg_cron are Supabase extensions; without them nothing is sent.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
    create extension if not exists pg_cron;
    perform cron.schedule('send-notifications', '* * * * *', 'select private.invoke_send_notifications()');
  else
    raise notice 'pg_cron or pg_net is not available: notifications will not be sent';
  end if;
end $$;
