-- Phase 6c: what the Edge Function `send-notifications` asks of the database: taking due notices (once, with a lease),
-- marking them sent, failed or held back, forgetting dead devices, the count of today's emails and the call that runs it all.
begin;
select plan(79);

select tests.seed_basic();
-- the helpers are used while acting as the service role too (rolled back with everything else)
grant usage on schema tests to service_role;
delete from public.notifications where true;
update public.notification_settings set welcome_text = 'Dobrodošli', school_contact = 'Tel 011 1234567' where singleton;

-- s1 has two devices, ta and s2 none
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
values (tests.id('p:s1'), 'https://push.example/one', 'key-one', 'auth-one'),
       (tests.id('p:s1'), 'https://push.example/two', 'key-two', 'auth-two');

-- Creates a notice and remembers its id under the label.
create function tests.mk(p_label text, p_kind text, p_person text, p_payload jsonb default '{}',
                         p_deliver_after timestamptz default now(), p_attempts integer default 0) returns bigint
language plpgsql as $$
declare
  v_id bigint;
begin
  insert into public.notifications (recipient_id, kind, payload, deliver_after, attempts)
  values (tests.id('p:' || p_person), p_kind, p_payload, p_deliver_after, p_attempts)
  returning id into v_id;
  perform set_config('t.n_' || p_label, v_id::text, true);
  return v_id;
end $$;

create function tests.nid(p_label text) returns bigint
language sql stable as $$ select current_setting('t.n_' || p_label)::bigint $$;

-- The ids of the notices a claim returned, in the order returned.
create function tests.claimed(p_claim text) returns bigint[]
language sql stable as $$
  select coalesce(array_agg((n ->> 'id')::bigint order by ord), '{}')
    from jsonb_array_elements(current_setting(p_claim)::jsonb -> 'notices') with ordinality as t (n, ord)
$$;

-- One field of the notice with this label from a claim.
create function tests.notice(p_claim text, p_label text) returns jsonb
language sql stable as $$
  select n from jsonb_array_elements(current_setting(p_claim)::jsonb -> 'notices') n
   where (n ->> 'id')::bigint = tests.nid(p_label)
$$;

create function tests.attempts_of(p_label text) returns integer
language sql stable as $$ select attempts from public.notifications where id = tests.nid(p_label) $$;

create function tests.soon(p_label text, p_from interval, p_to interval) returns boolean
language sql stable as $$
  select deliver_after between now() + p_from and now() + p_to from public.notifications where id = tests.nid(p_label)
$$;

select tests.mk('test', 'test', 'admin');
select tests.mk('sched', 'lesson_scheduled', 's1', jsonb_build_object('lesson_id', tests.id('les:group')));
select tests.mk('rem', 'lesson_reminder', 'ta', jsonb_build_object('lesson_id', tests.id('les:group')));
select tests.mk('held', 'lesson_moved', 's1', '{}', now() + interval '1 hour');
select tests.mk('sent', 'welcome', 's2', '{}', now(), 0);
update public.notifications set sent_at = now(), channel = 'push' where id = tests.nid('sent');
select tests.mk('failed', 'lesson_cancelled', 's2', '{}', now(), 5);
select tests.mk('last', 'lesson_reminder', 's1', jsonb_build_object('lesson_id', gen_random_uuid()), now(), 4);

-- Who may call what ------------------------------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array[
    'public.claim_notifications(integer)', 'public.complete_notification(bigint,text)',
    'public.fail_notification(bigint,text,boolean)', 'public.defer_notification(bigint,timestamptz,text)',
    'public.forget_push_subscriptions(uuid[])', 'private.invoke_send_notifications()'
  ]) f where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  0, 'neither a signed-in person nor a visitor can call the sending functions');
select is(
  (select count(*)::int from unnest(array[
    'public.claim_notifications(integer)', 'public.complete_notification(bigint,text)',
    'public.fail_notification(bigint,text,boolean)', 'public.defer_notification(bigint,timestamptz,text)',
    'public.forget_push_subscriptions(uuid[])'
  ]) f where has_function_privilege('service_role', f, 'execute')),
  5, 'the service role can');
select tests.login_as('admin');
select throws_ok($$ select public.claim_notifications() $$, '42501', null, 'even the administrator cannot take notices');
select throws_ok($$ select public.complete_notification(1, 'push') $$, '42501', null, 'nor mark one sent');
select tests.logout();

-- The retry delays ------------------------------------------------------------------------------------------------------------------
select is(private.notification_retry_delay(1), interval '1 minute', 'after the first attempt: a minute');
select is(private.notification_retry_delay(2), interval '5 minutes', 'then five minutes');
select is(private.notification_retry_delay(3), interval '15 minutes', 'then a quarter of an hour');
select is(private.notification_retry_delay(4), interval '1 hour', 'then an hour');
select is(private.notification_retry_delay(5), interval '1 hour', 'and an hour after that');

-- Taking notices ---------------------------------------------------------------------------------------------------------------------
set local role service_role;
select set_config('t.claim1', public.claim_notifications(10)::text, true);
reset role;

select is(tests.claimed('t.claim1'),
          array[tests.nid('test'), tests.nid('sched'), tests.nid('rem'), tests.nid('last')],
          'the notices that are due are taken, oldest first');
select is(tests.claimed('t.claim1') && array[tests.nid('held'), tests.nid('sent'), tests.nid('failed')], false,
          'a held one, a sent one and a failed one are not');
select is(tests.attempts_of('test'), 1, 'taking a notice counts an attempt');
select is(tests.attempts_of('last'), 5, 'the fifth attempt is counted too');
select ok(tests.soon('test', interval '50 seconds', interval '70 seconds'), 'and holds it for a minute (the lease)');
select ok(tests.soon('last', interval '59 minutes', interval '61 minutes'), 'an hour after the fifth attempt');
select is((tests.notice('t.claim1', 'test') ->> 'final_attempt')::boolean, false, 'the first attempt is not the last');
select is((tests.notice('t.claim1', 'last') ->> 'final_attempt')::boolean, true, 'the fifth is');
select is((tests.notice('t.claim1', 'test') ->> 'attempt')::int, 1, 'the attempt number is passed on');

select is(current_setting('t.claim1')::jsonb -> 'settings' ->> 'welcome_text', 'Dobrodošli', 'the welcome text comes along');
select is(current_setting('t.claim1')::jsonb -> 'settings' ->> 'school_contact', 'Tel 011 1234567', 'and the school contact');

select is(tests.notice('t.claim1', 'sched') -> 'recipient' ->> 'email', 's1@t.test', 'the recipient is named: email');
select is(tests.notice('t.claim1', 'sched') -> 'recipient' ->> 'first_name', 'Test', 'first name');
select is((tests.notice('t.claim1', 'sched') -> 'recipient' ->> 'is_student')::boolean, true, 'a student is a student');
select is((tests.notice('t.claim1', 'sched') -> 'recipient' ->> 'is_teacher')::boolean, false, 'not a teacher');
select is((tests.notice('t.claim1', 'sched') -> 'recipient' ->> 'is_parent')::boolean, false, 'not a parent');
select is((tests.notice('t.claim1', 'sched') -> 'recipient' ->> 'is_admin')::boolean, false, 'not an administrator');
select is((tests.notice('t.claim1', 'sched') -> 'recipient' ->> 'teaches_lesson')::boolean, false, 'and does not teach that lesson');
select is((tests.notice('t.claim1', 'rem') -> 'recipient' ->> 'teaches_lesson')::boolean, true, 'the teacher of the lesson is told so');
select is((tests.notice('t.claim1', 'rem') -> 'recipient' ->> 'is_teacher')::boolean, true, 'a teacher is a teacher');
select is((tests.notice('t.claim1', 'last') -> 'recipient' ->> 'teaches_lesson')::boolean, false, 'a lesson that is gone teaches nobody');
select is((tests.notice('t.claim1', 'test') -> 'recipient' ->> 'is_admin')::boolean, true, 'the administrator is one');

select is(jsonb_array_length(tests.notice('t.claim1', 'sched') -> 'subscriptions'), 2, 'both devices of a student are listed');
select is(tests.notice('t.claim1', 'sched') -> 'subscriptions' -> 0 ->> 'endpoint', 'https://push.example/one', 'with the endpoint');
select is(tests.notice('t.claim1', 'sched') -> 'subscriptions' -> 0 ->> 'p256dh', 'key-one', 'and the keys');
select is(tests.notice('t.claim1', 'sched') -> 'subscriptions' -> 0 ->> 'auth', 'auth-one', 'both of them');
select is(jsonb_array_length(tests.notice('t.claim1', 'rem') -> 'subscriptions'), 0, 'a person without a device has an empty list');
select is((tests.notice('t.claim1', 'sched') -> 'config' ->> 'email_fallback')::boolean, true, 'the rules of the kind: email instead of push');
select is((tests.notice('t.claim1', 'rem') -> 'config' ->> 'email_fallback')::boolean, false, 'a reminder has none');
select is((tests.notice('t.claim1', 'test') -> 'config' ->> 'always_email')::boolean, true, 'a test is always an email');

set local role service_role;
select set_config('t.claim2', public.claim_notifications(10)::text, true);
reset role;
select is(tests.claimed('t.claim2'), '{}'::bigint[], 'what was just taken is not taken again');

-- The limit, and the order
select tests.mk('h', 'test', 'admin');
select tests.mk('i', 'test', 'admin');
select tests.mk('j', 'test', 'admin');
set local role service_role;
select set_config('t.claim3', public.claim_notifications(2)::text, true);
reset role;
select is(tests.claimed('t.claim3'), array[tests.nid('h'), tests.nid('i')], 'no more than the limit are taken, oldest first');
set local role service_role;
select set_config('t.claim4', public.claim_notifications(10)::text, true);
reset role;
select is(tests.claimed('t.claim4'), array[tests.nid('j')], 'the rest stay for the next run');

-- Sent
update public.notifications set last_error = 'earlier trouble' where id = tests.nid('test');
set local role service_role;
select public.complete_notification(tests.nid('test'), 'push');
reset role;
select ok((select sent_at is not null from public.notifications where id = tests.nid('test')), 'a sent notice is marked');
select is((select channel from public.notifications where id = tests.nid('test')), 'push', 'with how it went out');
select is((select last_error from public.notifications where id = tests.nid('test')), null, 'and earlier trouble is forgotten');
select set_config('t.sent_at', (select sent_at::text from public.notifications where id = tests.nid('test')), true);
set local role service_role;
select public.complete_notification(tests.nid('test'), 'email');
select public.fail_notification(tests.nid('test'), 'too late');
select public.defer_notification(tests.nid('test'), now() + interval '1 day', 'too late');
reset role;
select is((select channel from public.notifications where id = tests.nid('test')), 'push', 'a sent notice is not changed again: channel');
select is((select sent_at::text from public.notifications where id = tests.nid('test')), current_setting('t.sent_at'), 'time');
select is((select last_error from public.notifications where id = tests.nid('test')), null, 'error');
select throws_ok($$ update public.notifications set channel = 'sms' where id = tests.nid('test') $$, '23514', null, 'there are only two channels');

-- Failed
set local role service_role;
select public.fail_notification(tests.nid('sched'), repeat('x', 600));
reset role;
select is((select length(last_error) from public.notifications where id = tests.nid('sched')), 500, 'the reason is kept, cut to 500 characters');
select is(tests.attempts_of('sched'), 1, 'a failed attempt is not counted twice');
update public.notifications set deliver_after = now() where id = tests.nid('sched');
set local role service_role;
select set_config('t.claim5', public.claim_notifications(10)::text, true);
reset role;
select is(tests.claimed('t.claim5'), array[tests.nid('sched')], 'it comes back when its time is up');
select is((tests.notice('t.claim5', 'sched') ->> 'attempt')::int, 2, 'as the second attempt');
select ok(tests.soon('sched', interval '4 minutes', interval '6 minutes'), 'with five minutes before the third');

set local role service_role;
select public.fail_notification(tests.nid('rem'), 'no device and no email', true);
reset role;
select is(tests.attempts_of('rem'), 5, 'a notice that cannot be delivered at all is given up at once');
update public.notifications set deliver_after = now() where id = tests.nid('rem');
set local role service_role;
select set_config('t.claim6', public.claim_notifications(10)::text, true);
reset role;
select is(tests.claimed('t.claim6'), '{}'::bigint[], 'and never taken again');

-- Held back
select is(tests.attempts_of('h'), 1, 'a notice taken once has one attempt');
set local role service_role;
select public.defer_notification(tests.nid('h'), now() + interval '1 day', 'Dnevno ograničenje emailova');
reset role;
select is(tests.attempts_of('h'), 0, 'holding it back gives the attempt back');
select ok(tests.soon('h', interval '23 hours', interval '25 hours'), 'until the time given');
select is((select last_error from public.notifications where id = tests.nid('h')), 'Dnevno ograničenje emailova', 'and says why');
select tests.mk('fresh', 'test', 'admin');
set local role service_role;
select public.defer_notification(tests.nid('fresh'), now() + interval '1 day', 'again');
reset role;
select is(tests.attempts_of('fresh'), 0, 'the attempts never go below zero');

-- Dead devices
select set_config('t.dead', (select id::text from public.push_subscriptions where endpoint = 'https://push.example/one'), true);
set local role service_role;
select public.forget_push_subscriptions(array[current_setting('t.dead')::uuid, gen_random_uuid()]);
select public.forget_push_subscriptions(null);
reset role;
select is((select array_agg(endpoint) from public.push_subscriptions where profile_id = tests.id('p:s1')),
          array['https://push.example/two'], 'only the devices named are forgotten');

-- Emails today
select tests.mk('em1', 'welcome', 's2');
select tests.mk('em2', 'welcome', 's2');
select tests.mk('em3', 'welcome', 's2');
select tests.mk('em4', 'welcome', 's2');
update public.notifications set sent_at = now(), channel = 'email' where id = tests.nid('em1');
update public.notifications set sent_at = tests.today_start() - interval '1 hour', channel = 'email' where id = tests.nid('em2');
update public.notifications set sent_at = now(), channel = 'push' where id = tests.nid('em3');
update public.notifications set deliver_after = now() + interval '1 day' where id = tests.nid('em4');
set local role service_role;
select set_config('t.claim7', public.claim_notifications(1)::text, true);
reset role;
select is((current_setting('t.claim7')::jsonb ->> 'emails_today')::int, 1,
          'only emails sent since midnight count (not yesterday''s, not pushes)');

select is((current_setting('t.claim7')::jsonb ->> 'emails_resume_at')::timestamptz,
          (((now() at time zone 'Europe/Belgrade')::date + 1)::timestamp at time zone 'Europe/Belgrade'),
          'what the limit holds back goes at midnight');
update public.notification_settings set quiet_hours_enabled = true, quiet_start = '22:00', quiet_end = '07:00' where singleton;
set local role service_role;
select set_config('t.claim8', public.claim_notifications(1)::text, true);
reset role;
select is((current_setting('t.claim8')::jsonb ->> 'emails_resume_at')::timestamptz,
          ((((now() at time zone 'Europe/Belgrade')::date + 1) + time '07:00')::timestamp at time zone 'Europe/Belgrade'),
          'or when the quiet hours end, if they are on');
update public.notification_settings set quiet_hours_enabled = false where singleton;

-- The log -----------------------------------------------------------------------------------------------------------------------------
select tests.mk('queued', 'test', 'admin', '{}', now() - interval '1 minute');
select tests.mk('waiting', 'test', 'admin', '{}', now() + interval '2 hours');
select tests.login_as('admin');
select is((select state from public.admin_list_notifications(200) where id = tests.nid('queued')), 'queued', 'a notice nobody has taken shows as queued');
select is((select state from public.admin_list_notifications(200) where id = tests.nid('waiting')), 'waiting', 'one held back before any attempt as waiting');
select is((select state from public.admin_list_notifications(200) where id = tests.nid('i')), 'retrying', 'one taken and not yet sent as retrying');
select is((select state from public.admin_list_notifications(200) where id = tests.nid('sched')), 'retrying', 'one that failed and waits for its next try too');
select is((select state from public.admin_list_notifications(200) where id = tests.nid('h')), 'waiting', 'one held back by the email limit as waiting');
select is((select state from public.admin_list_notifications(200) where id = tests.nid('rem')), 'failed', 'one given up as failed');
select is((select state from public.admin_list_notifications(200) where id = tests.nid('test')), 'sent', 'and a sent one as sent');
select tests.logout();

-- The call to the function --------------------------------------------------------------------------------------------------------
select ok(
  not exists (select 1 from pg_extension where extname = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'send-notifications' and schedule = '* * * * *'),
  'the sending job runs every minute (when pg_cron exists)');

select is(private.invoke_send_notifications(), false, 'without the address and the secret in the Vault nothing is called');
select vault.create_secret('http://127.0.0.1:1/send-notifications', 'notifications_function_url');
select is(private.invoke_send_notifications(), false, 'an address alone is not enough');
select is((select count(*)::int from net.http_request_queue), 0, 'no request was made');
select vault.create_secret('s3cret-value', 'notifications_cron_secret');
select is(private.invoke_send_notifications(), true, 'with both, the function is called');
select is((select count(*)::int from net.http_request_queue where url = 'http://127.0.0.1:1/send-notifications' and method = 'POST'), 1,
          'with one POST to the address');
select is((select headers ->> 'x-cron-secret' from net.http_request_queue), 's3cret-value', 'that carries the shared secret');

select * from finish();
rollback;
