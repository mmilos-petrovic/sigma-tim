-- Phase 8a: notices that do not get through are dated and counted, the administrator is told once an hour when three failed,
-- and what is done and old is cleared out every night.
begin;
select plan(31);

select tests.seed_basic();
delete from public.notifications where true;

-- A notice for a person; `p_age` is how old it is, `p_due` when it is due, `p_failed` when it gave up (null: it did not).
create function tests.mk(
  p_label text, p_kind text, p_person text, p_attempts integer default 0, p_sent boolean default false,
  p_age interval default '0 seconds', p_due interval default '0 seconds', p_failed interval default null
) returns bigint
language plpgsql as $$
declare
  v_id bigint;
begin
  insert into public.notifications (recipient_id, kind, attempts, sent_at, created_at, deliver_after, failed_at)
  values (tests.id('p:' || p_person), p_kind, p_attempts, case when p_sent then now() end, now() - p_age, now() + p_due,
          case when p_failed is not null then now() - p_failed end)
  returning id into v_id;
  perform set_config('t.n_' || p_label, v_id::text, true);
  return v_id;
end $$;

create function tests.nid(p_label text) returns bigint
language sql stable as $$ select current_setting('t.n_' || p_label)::bigint $$;

create function tests.failed_at_of(p_label text) returns timestamptz
language sql stable as $$ select failed_at from public.notifications where id = tests.nid(p_label) $$;

-- who may call what ----------------------------------------------------------------------------------------------------------
select is(
  (select count(*)::int
     from unnest(array['private.alert_failing_notices()', 'private.purge_old_records()',
                       'public.fail_notification(bigint, text, boolean)']) f
    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  0, 'neither a signed-in person nor a visitor can run the alert, the clearing out or a failure report');
select ok(has_function_privilege('authenticated', 'public.admin_notification_health()', 'execute'),
  'the overview numbers can be asked for by a signed-in person (the function checks who)');
select ok(not has_function_privilege('anon', 'public.admin_notification_health()', 'execute'),
  'and not by a visitor');
select is(
  (select (email_fallback, always_email, ignores_quiet_hours)::text from public.notification_kinds where kind = 'delivery_alert'),
  '(t,t,t)', 'the alert always goes by email too, and quiet hours never hold it back');

select tests.login_as('ta');
select throws_ok($$ select * from public.admin_notification_health() $$, 'PT403', null, 'a teacher cannot see the numbers');
select tests.logout();

-- failed_at ---------------------------------------------------------------------------------------------------------------------
select tests.mk('retry', 'test', 'ta', 1);
select tests.mk('last', 'test', 'ta', 5);
select tests.mk('giveup', 'test', 'ta', 1);
select tests.mk('sent', 'test', 'ta', 5, true);
select tests.mk('again', 'test', 'ta', 5, false, '0 seconds', '0 seconds', '30 minutes');

select public.fail_notification(tests.nid('retry'), 'boom');
select is(tests.failed_at_of('retry'), null, 'a failed attempt that will be tried again is not "failed" yet');
select is((select last_error from public.notifications where id = tests.nid('retry')), 'boom', 'it keeps the error');

select public.fail_notification(tests.nid('last'), 'boom');
select is(tests.failed_at_of('last'), now(), 'the last attempt failing dates the failure');

select public.fail_notification(tests.nid('giveup'), 'no device', true);
select is((select attempts from public.notifications where id = tests.nid('giveup')), 5, 'giving up uses up the attempts');
select is(tests.failed_at_of('giveup'), now(), 'and dates the failure');

select public.fail_notification(tests.nid('sent'), 'late');
select is(tests.failed_at_of('sent'), null, 'a notice that was sent cannot fail afterwards');

select public.fail_notification(tests.nid('again'), 'boom again');
select is(tests.failed_at_of('again'), now(), 'failing once more moves the date');

select tests.login_as('admin');
select public.admin_resend_notification(tests.nid('last'));
select tests.logout();
select is(
  (select (attempts, failed_at is null)::text from public.notifications where id = tests.nid('last')),
  '(0,t)', 'sending a failed notice again takes the failure away');

-- the overview --------------------------------------------------------------------------------------------------------------------
delete from public.notifications where true;
select tests.mk('sent', 'test', 'ta', 1, true, '1 hour', '-1 hour');           -- sent: never counted
select tests.mk('failed1', 'test', 'ta', 5);                                   -- failed
select tests.mk('failed2', 'test', 'ta', 5, false, '3 hours', '-2 hours');     -- failed, long due: not "overdue" as well
select tests.mk('retrying', 'test', 'ta', 2, false, '0 seconds', '5 minutes');  -- waits for its next attempt
select tests.mk('fresh', 'test', 'ta', 0);                                     -- due now, the job comes every minute
select tests.mk('late1', 'test', 'ta', 0, false, '0 seconds', '-11 minutes');  -- overdue
select tests.mk('late2', 'test', 'ta', 1, false, '0 seconds', '-30 minutes');  -- overdue (its lease ran out)
select tests.mk('edge', 'test', 'ta', 0, false, '0 seconds', '-9 minutes');    -- not yet
select tests.mk('quiet', 'test', 'ta', 0, false, '0 seconds', '3 hours');      -- held back on purpose

select tests.login_as('admin');
select is((select failed from public.admin_notification_health()), 2, 'the overview counts the notices that gave up');
select is((select overdue from public.admin_notification_health()), 2, 'and those nobody tried for ten minutes');
select tests.login_as('boss');
select is((select (failed, overdue)::text from public.admin_notification_health()), '(2,2)',
  'an administrator who teaches sees the same');
select tests.logout();

-- the alert -----------------------------------------------------------------------------------------------------------------------
delete from public.notifications where true;
select tests.mk('f1', 'test', 'ta', 5, false, '1 day', '0 seconds', '10 minutes');
select tests.mk('f2', 'test', 'ta', 5, false, '1 day', '0 seconds', '50 minutes');
select tests.mk('old', 'test', 'ta', 5, false, '1 day', '0 seconds', '61 minutes');        -- too long ago
-- the alert's own failure does not count (and is two hours old, so it does not stop a new alert)
select tests.mk('own', 'delivery_alert', 'admin', 5, false, '2 hours', '0 seconds', '5 minutes');
-- on its last attempt but not failed yet (the function is still working on it)
select tests.mk('busy', 'test', 'ta', 5);
select is(private.alert_failing_notices(), 0, 'two failures in an hour are not an alert');
select is((select count(*)::int from public.notifications where created_at > now() - interval '1 hour' and kind = 'delivery_alert'), 0,
  'and nobody is told');

select tests.mk('f3', 'test', 'tb', 5, false, '1 day', '0 seconds', '1 minute');
select is(private.alert_failing_notices(), (select count(*)::int from public.profiles where is_admin and erased_at is null), 'the third in an hour tells every administrator');
select is(
  (select array_agg(recipient_id order by recipient_id) from public.notifications
    where kind = 'delivery_alert' and created_at > now() - interval '1 hour'),
  (select array_agg(id order by id) from public.profiles where is_admin and erased_at is null),
  'and nobody else');
select is(
  (select payload from public.notifications where kind = 'delivery_alert' and created_at > now() - interval '1 hour' limit 1),
  '{"failed": 3}'::jsonb, 'the alert says how many');
select is(private.alert_failing_notices(), 0, 'it does not repeat while the hour goes on');
select is((select count(*)::int from public.notifications where kind = 'delivery_alert' and created_at > now() - interval '1 hour'),
  (select count(*)::int from public.profiles where is_admin and erased_at is null), 'one alert for each administrator was written, not two'); 

update public.notifications set created_at = now() - interval '61 minutes'
 where kind = 'delivery_alert' and created_at > now() - interval '1 hour';
select is(private.alert_failing_notices(), (select count(*)::int from public.profiles where is_admin and erased_at is null), 'an hour later it is told again, if it still goes on');

-- an administrator who was erased is not told, a teacher who is not an administrator never is
delete from public.notifications where true;
update public.profiles set erased_at = now() where id = tests.id('p:boss');
select tests.mk('g1', 'test', 'ta', 5, false, '1 day', '0 seconds', '1 minute');
select tests.mk('g2', 'test', 'ta', 5, false, '1 day', '0 seconds', '2 minutes');
select tests.mk('g3', 'test', 'ta', 5, false, '1 day', '0 seconds', '3 minutes');
select is(private.alert_failing_notices(), (select count(*)::int from public.profiles where is_admin and erased_at is null), 'an erased administrator is not counted');
select ok(
  exists (select 1 from public.notifications where kind = 'delivery_alert' and recipient_id = tests.id('p:admin'))
  and not exists (select 1 from public.notifications where kind = 'delivery_alert' and recipient_id = tests.id('p:boss')),
  'the alert goes to the administrator and not to the erased one');
update public.profiles set erased_at = null where id = tests.id('p:boss');

-- clearing out ------------------------------------------------------------------------------------------------------------------
delete from public.notifications where true;
select tests.mk('old_sent', 'test', 'ta', 1, true, '400 days');
select tests.mk('old_failed', 'test', 'ta', 5, false, '400 days', '0 seconds', '399 days');
select tests.mk('old_queued', 'test', 'ta', 0, false, '400 days');
select tests.mk('old_retry', 'test', 'ta', 2, false, '400 days', '1 hour');
select tests.mk('new_sent', 'test', 'ta', 1, true, '364 days');
select tests.mk('today', 'test', 'ta', 1, true);
do $$
begin
  if to_regclass('cron.job_run_details') is not null then
    -- the run numbers are given, the sequence is not ours to use
    insert into cron.job_run_details (runid, command, status, start_time, end_time) values
      (-1, 't-8d', 'succeeded', now() - interval '8 days', now() - interval '8 days'),
      (-2, 't-8d-open', 'running', now() - interval '8 days', null),
      (-3, 't-6d', 'succeeded', now() - interval '6 days', now() - interval '6 days');
  end if;
end $$;

select is(private.purge_old_records(), 2, 'a done notice older than a year is deleted: sent, or failed for good');
select is(
  (select array_agg(id order by id) from public.notifications),
  (select array_agg(i order by i) from unnest(array[tests.nid('old_queued'), tests.nid('old_retry'), tests.nid('new_sent'),
                                                    tests.nid('today')]) i),
  'one still to be sent or tried again is kept however old, and so is a recent one');
select is(
  case when to_regclass('cron.job_run_details') is null then '{t-6d}'::text[]
       else (select array_agg(command order by command) from cron.job_run_details where command like 't-%') end,
  '{t-6d}'::text[], 'the history of the scheduled jobs keeps a week (running or not)');

-- the jobs ------------------------------------------------------------------------------------------------------------------------
select ok(
  not exists (select 1 from pg_available_extensions where name = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'alert-failing-notices' and schedule = '*/5 * * * *'),
  'the alert is looked for every five minutes (when pg_cron exists)');
select ok(
  not exists (select 1 from pg_available_extensions where name = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'purge-old-records' and schedule = '15 3 * * *'),
  'old records are cleared out every night (when pg_cron exists)');

select * from finish();
rollback;
