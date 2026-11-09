-- Phase 6a: the events that are written to the outbox, who is told, the reminder job, the quiet hours and the
-- administrator's settings. Nobody is told about their own action; each person reads only about their own students.
begin;
select plan(138);

select tests.seed_basic();
select tests.mklesson('slot1', 'ta', 'math', 'L1', null, tests.at(30 * 60), 60, 'open', 'slot');
select tests.mklesson('slot2', 'ta', 'math', 'L1', null, tests.at(31 * 60), 60, 'open', 'slot');
select tests.mklesson('late',  'ta', 'math', 'L1', null, tests.at(5 * 60),  60, 'open', 'slot');
select tests.mklesson('late2', 'ta', 'math', 'L1', null, tests.at(6 * 60),  60, 'open', 'slot');
select tests.mklesson('mv',    'ta', 'math', 'L1', 'R1', tests.at(40 * 60), 60, 'confirmed', 'teacher', array['s1', 's2']);
select tests.mklesson('mvslot', 'ta', 'math', 'L1', null, tests.at(41 * 60), 60, 'open', 'slot');

-- Who was queued a notice of this kind for the lesson (sorted keys), and what the notice told one of them. Only meaningful
-- as postgres: clients never see the outbox.
create function tests.who(p_kind text, p_lesson_key text) returns text[]
language sql stable as $$
  select coalesce(array_agg(split_part(p.email, '@', 1) order by p.email), '{}')
    from public.notifications n join public.profiles p on p.id = n.recipient_id
   where n.kind = p_kind and (n.payload->>'lesson_id')::uuid = tests.id('les:' || p_lesson_key)
$$;

create function tests.said(p_kind text, p_lesson_key text, p_person text, p_field text) returns text
language sql stable as $$
  select n.payload ->> p_field
    from public.notifications n
   where n.kind = p_kind and (n.payload->>'lesson_id')::uuid = tests.id('les:' || p_lesson_key)
     and n.recipient_id = tests.id('p:' || p_person)
$$;

create function tests.count_of(p_kind text, p_person text) returns int
language sql stable as $$
  select count(*)::int from public.notifications where kind = p_kind and recipient_id = tests.id('p:' || p_person)
$$;

-- Plumbing ---------------------------------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.notification_kinds), 10, 'ten kinds of notice are known');
select is((select count(*)::int from public.notification_settings), 1, 'there is one row of settings');
select throws_ok($$ insert into public.notification_settings (singleton) values (false) $$, '23514', null, 'there can only be one row of settings');
select throws_ok($$ insert into public.notifications (recipient_id, kind) values (tests.id('p:ta'), 'nonsense') $$, '23503', null,
  'a notice must be of a known kind');
select is((select count(*)::int from pg_proc where proname = 'upsert_profile' and pronamespace = 'private'::regnamespace), 1, 'one upsert_profile');
select is((select count(*)::int from pg_proc where proname = 'enqueue_cancellation' and pronamespace = 'private'::regnamespace), 1, 'one enqueue_cancellation');
select ok(
  not exists (select 1 from pg_extension where extname = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'enqueue-lesson-reminders' and schedule = '* * * * *'),
  'the reminder job runs every minute (when pg_cron exists)');

select tests.login_as('ta');
select throws_ok($$ select * from public.notifications $$, '42501', null, 'a teacher cannot read the outbox');
select throws_ok($$ select * from public.notification_settings $$, '42501', null, 'a teacher cannot read the settings table');
select throws_ok($$ select * from public.notification_kinds $$, '42501', null, 'a teacher cannot read the kinds table');
select throws_ok($$ select private.enqueue_due_reminders() $$, '42501', null, 'nobody calls the reminder job from outside');

-- A teacher schedules a lesson ------------------------------------------------------------------------------------------------------
select lives_ok(
  $$ select public.schedule_lesson(tests.id('subj:math'), tests.id('loc:L1'), null, tests.at(60 * 60), tests.at(61 * 60), array[tests.id('s:s1'), tests.id('s:s2')]) $$,
  'the teacher schedules a lesson for two students');
select tests.logout();
select tests.reg('les:new', (select id from public.lessons where teacher_id = tests.id('p:ta') and start_at = tests.at(60 * 60) limit 1));
select is(tests.who('lesson_scheduled', 'new'), array['p1', 'p2', 's1', 's2'], 'the students and their parents are told, not the teacher');
select is(tests.said('lesson_scheduled', 'new', 's1', 'students'), '["Test Prvi"]', 'a student reads only about themselves');
select is(tests.said('lesson_scheduled', 'new', 'p2', 'students'), '["Test Drugi"]', 'a parent reads only about their own child');
select is(tests.said('lesson_scheduled', 'new', 's1', 'location'), 'Test Centar', 'the notice names the place');
select is(tests.said('lesson_scheduled', 'new', 's1', 'teacher'), 'Test Alfa', 'the notice names the teacher');

select tests.login_as('ta');
select lives_ok($$ select public.set_lesson_students(tests.id('les:new'), array[tests.id('s:s1'), tests.id('s:s2')]) $$, 'nothing changes: nobody new');
select tests.logout();
select is((select count(*)::int from public.notifications where kind = 'lesson_scheduled' and recipient_id = tests.id('p:s1') and (payload->>'lesson_id')::uuid = tests.id('les:new')), 1,
  'a student who was already on the lesson is not told again');

select tests.mkstudent('s4', 'Test', 'Cetvrti', 'ta');
select tests.mkparent('p4', 'Test', 'Roditelj4', array['s4']);
select tests.login_as('ta');
select lives_ok($$ select public.set_lesson_students(tests.id('les:new'), array[tests.id('s:s1'), tests.id('s:s2'), tests.id('s:s4')]) $$, 'the teacher adds a student');
select tests.logout();
select is(tests.who('lesson_scheduled', 'new'), array['p1', 'p2', 'p4', 's1', 's2', 's4'], 'only the student who was added, and the parent, are told');

select tests.mkstudent('s5', 'Test', 'Peti', 'ta');
select tests.mklesson('earlier', 'ta', 'math', 'L1', null, tests.at(-30), 60, 'confirmed', 'teacher', array['s1']);
select is(tests.who('lesson_scheduled', 'earlier'), '{}'::text[], 'a lesson that has started tells nobody');
select tests.login_as('ta');
select lives_ok($$ select public.set_lesson_students(tests.id('les:earlier'), array[tests.id('s:s1'), tests.id('s:s5')]) $$, 'a correction of who was there');
select tests.logout();
select is(tests.who('lesson_scheduled', 'earlier'), '{}'::text[], 'a correction after the start tells nobody');

-- A free slot is booked ------------------------------------------------------------------------------------------------------------------
select tests.login_as('s2');
select is(public.claim_slot(tests.id('les:slot1'), array[tests.id('s:s2')])::text, 'confirmed', 'a student books a slot far ahead');
select tests.logout();
select is(tests.who('slot_claimed', 'slot1'), array['ta'], 'the teacher is told');
select is(tests.said('slot_claimed', 'slot1', 'ta', 'students'), '["Test Drugi"]', 'and who booked');
select is(tests.said('slot_claimed', 'slot1', 'ta', 'status'), 'confirmed', 'and that it is settled');
select is(tests.who('booking_confirmed', 'slot1'), array['p2'], 'the parent is told it is confirmed, not the student who booked');

select tests.login_as('p2');
select is(public.claim_slot(tests.id('les:slot2'), array[tests.id('s:s2')])::text, 'confirmed', 'a parent books for the child');
select tests.logout();
select is(tests.who('booking_confirmed', 'slot2'), array['s2'], 'the child is told, not the parent who booked');
select is(tests.who('slot_claimed', 'slot2'), array['ta'], 'the teacher is told');

select tests.login_as('s1');
select is(public.claim_slot(tests.id('les:late'), array[tests.id('s:s1')])::text, 'pending', 'a late booking waits');
select tests.logout();
select is(tests.who('slot_claimed', 'late'), array['ta'], 'the teacher is told about a late booking');
select is(tests.said('slot_claimed', 'late', 'ta', 'status'), 'pending', 'and that it waits for them');
select is(tests.who('booking_confirmed', 'late'), '{}'::text[], 'nobody is told it is confirmed yet');

select tests.login_as('ta');
select lives_ok($$ select public.confirm_booking(tests.id('les:late')) $$, 'the teacher confirms');
select tests.logout();
select is(tests.who('booking_confirmed', 'late'), array['p1', 's1'], 'the student and the parent are told, not the teacher');
select is(tests.count_of('slot_claimed', 'ta'), 3, 'the teacher was told of three bookings, and not again of the confirmation');

select tests.login_as('s1');
select is(public.claim_slot(tests.id('les:late2'), array[tests.id('s:s1')])::text, 'pending', 'another late booking');
select tests.logout();
select tests.login_as('ta');
select lives_ok($$ select public.decline_booking(tests.id('les:late2'), 'Nema me') $$, 'the teacher declines it');
select tests.logout();
select is(tests.who('lesson_cancelled', 'late2'), array['p1', 's1'], 'declining tells the student and the parent that it was cancelled');
select is(tests.said('lesson_cancelled', 'late2', 's1', 'reason'), 'declined', 'with the reason declined');
select is(tests.who('booking_confirmed', 'late2'), '{}'::text[], 'and nobody that it was confirmed');

-- Confirming after the start is how an outcome is recorded for a booking nobody answered
select tests.mklesson('overdue', 'ta', 'math', 'L1', null, tests.at(-60), 60, 'pending', 'slot', array['s2']);
select tests.login_as('ta');
select lives_ok($$ select public.confirm_booking(tests.id('les:overdue')) $$, 'the teacher confirms a booking after it started');
select tests.logout();
select is(tests.who('booking_confirmed', 'overdue'), '{}'::text[], 'nobody is told');

-- Moved: start or location --------------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select is(tests.affected($$ update public.lessons set room_id = tests.id('room:R2') where id = tests.id('les:mv') $$), 1, 'the teacher changes the room');
select is(tests.affected($$ update public.lessons set end_at = end_at + interval '15 minutes' where id = tests.id('les:mv') $$), 1, 'and the end');
select is(tests.affected($$ update public.lessons set subject_id = tests.id('subj:math') where id = tests.id('les:mv') $$), 1, 'and saves the subject unchanged');
select tests.logout();
select is(tests.who('lesson_moved', 'mv'), '{}'::text[], 'room, end and subject are not a move');

select tests.login_as('ta');
select is(tests.affected($$ update public.lessons set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = tests.id('les:mv') $$), 1, 'the teacher moves the lesson to another hour');
select tests.logout();
select is(tests.who('lesson_moved', 'mv'), array['p1', 'p2', 's1', 's2'], 'the students and their parents are told, not the teacher');
select ok(tests.said('lesson_moved', 'mv', 's1', 'old_start_at') is not null, 'the notice says when it was');
select is(tests.said('lesson_moved', 'mv', 's1', 'students'), '["Test Prvi"]', 'and names only their own student');

select tests.login_as('ta');
select is(tests.affected($$ update public.lessons set location_id = tests.id('loc:L2'), room_id = null where id = tests.id('les:mv') $$), 1, 'the teacher moves the lesson to another place');
select tests.logout();
select is((select count(*)::int from public.notifications where kind = 'lesson_moved' and recipient_id = tests.id('p:s1')), 2, 'the student is told of the second move too');
select is(
  (select n.payload ->> 'old_location' from public.notifications n
    where n.kind = 'lesson_moved' and n.recipient_id = tests.id('p:s1') order by n.id desc limit 1),
  'Test Centar', 'the notice says where it was');
select is(
  (select n.payload ->> 'location' from public.notifications n
    where n.kind = 'lesson_moved' and n.recipient_id = tests.id('p:s1') order by n.id desc limit 1),
  'Test Zemun', 'and where it is now');

select tests.login_as('ta');
select is(tests.affected($$ update public.lessons set start_at = start_at + interval '1 hour', end_at = end_at + interval '1 hour' where id = tests.id('les:mvslot') $$), 1, 'the teacher moves a free slot');
select tests.logout();
select is(tests.who('lesson_moved', 'mvslot'), '{}'::text[], 'a free slot has nobody to tell');

-- A lesson that has started is moved by a correction afterwards: nobody is told
update public.lessons set start_at = start_at + interval '15 minutes', end_at = end_at + interval '15 minutes' where id = tests.id('les:earlier');
select is(tests.who('lesson_moved', 'earlier'), '{}'::text[], 'moving a lesson that has started tells nobody');

-- Welcome ----------------------------------------------------------------------------------------------------------------------------------
select tests.login_as('admin');
select ok(public.create_teacher('fresh@t.test', 'Nova', 'Nastavnica', array[tests.id('subj:math')], array[tests.id('loc:L1')], '+381641234567') is not null, 'the administrator adds a teacher');
select tests.logout();
select is((select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id where n.kind = 'welcome' and p.email = 'fresh@t.test'), 1,
  'the new teacher is welcomed');
select is((select n.payload ->> 'first_name' from public.notifications n join public.profiles p on p.id = n.recipient_id where n.kind = 'welcome' and p.email = 'fresh@t.test'), 'Nova',
  'by name');

select tests.login_as('ta');
select ok(public.add_student('kid@t.test', 'Mali', 'Ucenik', 'Skola', '4', 'A', null, null) is not null, 'a teacher adds a student');
select tests.logout();
select is((select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id where n.kind = 'welcome' and p.email = 'kid@t.test'), 1, 'the student is welcomed');

select tests.login_as('ta');
select ok(public.add_parent_to_student((select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'kid@t.test'), 'mama@t.test', 'Mama', 'Ucenika', '+381641234567') is not null,
  'and a parent');
select tests.logout();
select is((select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id where n.kind = 'welcome' and p.email = 'mama@t.test'), 1, 'the parent is welcomed');

select tests.login_as('ta');
select ok(public.add_parent_to_student(tests.id('s:s5'), 'mama@t.test', 'Mama', 'Ucenika', '+381641234567') is not null, 'the same parent is added to a second child');
select tests.logout();
select is((select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id where n.kind = 'welcome' and p.email = 'mama@t.test'), 1,
  'a person who already exists is not welcomed again');

-- The first device of a welcomed person
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  select id, 'https://push.test/a', 'k', 'a' from public.profiles where email = 'kid@t.test';
select is((select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id where n.kind = 'welcome_push' and p.email = 'kid@t.test'), 1,
  'the first device of a welcomed person gets the welcome push');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth)
  select id, 'https://push.test/b', 'k', 'a' from public.profiles where email = 'kid@t.test';
select is((select count(*)::int from public.notifications n join public.profiles p on p.id = n.recipient_id where n.kind = 'welcome_push' and p.email = 'kid@t.test'), 1,
  'a second device does not get it again');
insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth) values (tests.id('p:ta'), 'https://push.test/c', 'k', 'a');
select is(tests.count_of('welcome_push', 'ta'), 0, 'somebody who was never welcomed (they were here before) gets none');

-- Reminders ---------------------------------------------------------------------------------------------------------------------------------
-- settled_at says how long the lesson has been in place: a booking made less than the reminder time before the start gets none.
select tests.mklesson('r_ok',   'ta', 'math', 'L1', null, tests.at(30), 60, 'confirmed', 'teacher', array['s1', 's2']);
select tests.mklesson('r_new',  'ta', 'math', 'L1', null, tests.at(30), 60, 'confirmed', 'teacher', array['s1']);
select tests.mklesson('r_far',  'ta', 'math', 'L1', null, tests.at(120), 60, 'confirmed', 'teacher', array['s1']);
select tests.mklesson('r_pend', 'ta', 'math', 'L1', null, tests.at(30), 60, 'pending', 'slot', array['s2']);
select tests.mklesson('r_open', 'ta', 'math', 'L1', null, tests.at(30), 60, 'open', 'slot');
select tests.mklesson('r_mv',   'ta', 'math', 'L1', null, tests.at(300), 60, 'confirmed', 'teacher', array['s2']);
update public.lessons set settled_at = now() - interval '5 hours'
 where id = any (array[tests.id('les:r_ok'), tests.id('les:r_far'), tests.id('les:r_pend'), tests.id('les:r_open'), tests.id('les:r_mv')]);

select is(private.enqueue_due_reminders() >= 5, true, 'the job queues reminders');
select is(tests.who('lesson_reminder', 'r_ok'), array['p1', 'p2', 's1', 's2', 'ta'], 'participants, parents and the teacher get a reminder');
select is(tests.said('lesson_reminder', 'r_ok', 'p1', 'students'), '["Test Prvi"]', 'a parent reads only about their child');
select is(tests.said('lesson_reminder', 'r_ok', 'ta', 'students'), '["Test Drugi", "Test Prvi"]', 'the teacher reads about everybody');
select is(tests.who('lesson_reminder', 'r_new'), '{}'::text[], 'a lesson settled less than an hour before gets no reminder');
select is(tests.who('lesson_reminder', 'r_far'), '{}'::text[], 'nor one that is more than an hour away');
select is(tests.who('lesson_reminder', 'r_pend'), '{}'::text[], 'nor a late booking the teacher has not answered');
select is(tests.who('lesson_reminder', 'r_open'), '{}'::text[], 'nor a free slot');
select is(private.enqueue_due_reminders(), 0, 'running the job again queues nothing');

update public.lessons set start_at = tests.at(45), end_at = tests.at(105) where id = tests.id('les:r_mv');
select is(private.enqueue_due_reminders(), 0, 'a lesson moved to within the hour gets no reminder');

-- a booking confirmed less than an hour before the start
select tests.mklesson('r_book', 'ta', 'math', 'L1', null, tests.at(30), 60, 'open', 'slot');
update public.lessons set settled_at = now() - interval '5 hours' where id = tests.id('les:r_book');
select tests.login_as('s2');
select is(public.claim_slot(tests.id('les:r_book'), array[tests.id('s:s2')])::text, 'pending', 'a student books a slot that starts soon');
select tests.login_as('ta');
select lives_ok($$ select public.confirm_booking(tests.id('les:r_book')) $$, 'the teacher confirms it');
select tests.logout();
select is(private.enqueue_due_reminders(), 0, 'a booking confirmed less than an hour before the start gets no reminder');
select is(tests.who('lesson_reminder', 'r_book'), '{}'::text[], 'for anybody');

update public.notification_settings set reminder_minutes = 240;
select is(private.enqueue_due_reminders() >= 1, true, 'a longer reminder time reaches lessons that are further away');
select is(tests.who('lesson_reminder', 'r_far'), array['p1', 's1', 'ta'], 'such as this one');
update public.notification_settings set reminder_enabled = false;
select is(private.enqueue_due_reminders(), 0, 'with reminders switched off nothing is queued');
update public.notification_settings set reminder_enabled = true, reminder_minutes = 60;

-- Quiet hours -----------------------------------------------------------------------------------------------------------------------------------
update public.notification_settings set quiet_hours_enabled = true, quiet_start = '22:00', quiet_end = '07:00';
select is(private.quiet_hours_end('2026-12-01 23:30 Europe/Belgrade'), '2026-12-02 07:00 Europe/Belgrade'::timestamptz, 'late in the evening it waits until the next morning');
select is(private.quiet_hours_end('2026-12-02 03:00 Europe/Belgrade'), '2026-12-02 07:00 Europe/Belgrade'::timestamptz, 'in the night until the same morning');
select is(private.quiet_hours_end('2026-12-02 12:00 Europe/Belgrade'), null, 'by day there is nothing to wait for');
select is(private.quiet_hours_end('2026-12-02 07:00 Europe/Belgrade'), null, 'the window ends exactly at its end time');
select is(private.quiet_hours_end('2026-12-02 22:00 Europe/Belgrade'), '2026-12-03 07:00 Europe/Belgrade'::timestamptz, 'and begins exactly at its start time');
update public.notification_settings set quiet_start = '13:00', quiet_end = '15:00';
select is(private.quiet_hours_end('2026-12-02 14:00 Europe/Belgrade'), '2026-12-02 15:00 Europe/Belgrade'::timestamptz, 'a window within one day works too');
select is(private.quiet_hours_end('2026-12-02 16:00 Europe/Belgrade'), null, 'and ends');
select is(private.quiet_hours_end('2026-12-02 15:00 Europe/Belgrade'), null, 'exactly at its end time');
update public.notification_settings set quiet_hours_enabled = false;
select is(private.quiet_hours_end('2026-12-02 14:00 Europe/Belgrade'), null, 'switched off, nothing waits');

-- a window around the present moment, whatever time it is
update public.notification_settings set
  quiet_hours_enabled = true,
  quiet_start = ((now() at time zone 'Europe/Belgrade')::time - interval '1 hour'),
  quiet_end = ((now() at time zone 'Europe/Belgrade')::time + interval '1 hour');
insert into public.notifications (recipient_id, kind) values (tests.id('p:s1'), 'lesson_moved');
insert into public.notifications (recipient_id, kind) values (tests.id('p:s1'), 'lesson_reminder');
insert into public.notifications (recipient_id, kind) values (tests.id('p:s1'), 'welcome');
select ok(
  (select deliver_after > now() + interval '59 minutes' and deliver_after <= now() + interval '61 minutes'
     from public.notifications where kind = 'lesson_moved' and recipient_id = tests.id('p:s1') order by id desc limit 1),
  'in the quiet hours a notice is held until they end');
select ok(
  (select deliver_after <= now() from public.notifications where kind = 'lesson_reminder' and recipient_id = tests.id('p:s1') order by id desc limit 1),
  'a reminder is not held back');
select ok(
  (select deliver_after <= now() from public.notifications where kind = 'welcome' and recipient_id = tests.id('p:s1') order by id desc limit 1),
  'nor is a welcome');
update public.notification_settings set quiet_hours_enabled = false, quiet_start = '22:00', quiet_end = '07:00';

-- The administrator's page --------------------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ select public.get_notification_settings() $$, 'PT403', null, 'a teacher cannot read the settings');
select throws_ok($$ select public.set_email_fallback('lesson_moved', false) $$, 'PT403', null, 'nor change the email rules');
select throws_ok($$ select * from public.admin_list_notifications() $$, 'PT403', null, 'nor read the log');
select throws_ok($$ select public.admin_resend_notification(1) $$, 'PT403', null, 'nor send a notice again');
select throws_ok($$ select public.admin_send_test_notification() $$, 'PT403', null, 'nor send a test notice');
select tests.login_as('s1');
select throws_ok($$ select public.get_notification_settings() $$, 'PT403', null, 'a student cannot read the settings');
select tests.login_anon();
select throws_ok($$ select public.get_notification_settings() $$, '42501', null, 'a visitor cannot call it at all');

select tests.login_as('admin');
select is((public.get_notification_settings() ->> 'reminder_minutes')::int, 60, 'the administrator reads the settings: 60 minutes');
select is(public.get_notification_settings() ->> 'quiet_start', '22:00', 'quiet hours as clock times');
select is(jsonb_array_length(public.get_notification_settings() -> 'kinds'), 10, 'with every kind of notice');
select lives_ok($$ select public.set_notification_settings(true, '21:30', '06:45', true, 90, '  Dobrodošli  ', 'Tel 011 1234567') $$, 'the administrator saves the settings');
select is(public.get_notification_settings() ->> 'quiet_end', '06:45', 'quiet hours are saved');
select is((public.get_notification_settings() ->> 'reminder_minutes')::int, 90, 'and the reminder time');
select is(public.get_notification_settings() ->> 'welcome_text', 'Dobrodošli', 'and the welcome text, trimmed');
select throws_ok($$ select public.set_notification_settings(true, '07:00', '07:00', true, 60, '', '') $$, 'PT400', null, 'an empty quiet window is refused');
select throws_ok($$ select public.set_notification_settings(true, '22:00', '07:00', true, 2, '', '') $$, 'PT400', null, 'a reminder time under 5 minutes is refused');
select throws_ok($$ select public.set_notification_settings(true, '22:00', '07:00', true, 721, '', '') $$, 'PT400', null, 'and over 12 hours');
select throws_ok($$ select public.set_notification_settings(true, '22:00', '07:00', true, 60, repeat('x', 1001), '') $$, 'PT400', null, 'a welcome text that is too long is refused');
select throws_ok($$ select public.set_notification_settings(null, '22:00', '07:00', true, 60, '', '') $$, 'PT400', null, 'a missing value is refused');

select lives_ok($$ select public.set_email_fallback('lesson_moved', false) $$, 'the administrator switches off the email for moved lessons');
select is((select (k ->> 'email_fallback')::boolean from jsonb_array_elements(public.get_notification_settings() -> 'kinds') k where k ->> 'kind' = 'lesson_moved'), false, 'and it shows');
select throws_ok($$ select public.set_email_fallback('welcome', false) $$, 'PT409', null, 'the welcome is always an email');
select throws_ok($$ select public.set_email_fallback('nonsense', false) $$, 'PT404', null, 'an unknown kind is refused');

select lives_ok($$ select public.admin_send_test_notification() $$, 'the administrator sends a test');
select tests.logout();
select is(tests.count_of('test', 'admin'), 1, 'it goes to the administrator');

-- The log, and sending again
update public.notifications set attempts = 5, last_error = 'push service said no' where kind = 'test' and recipient_id = tests.id('p:admin');
update public.notifications set sent_at = now(), channel = 'push' where kind = 'welcome' and recipient_id = tests.id('p:s1');
select set_config('t.maxid', (select max(id) from public.notifications)::text, true);
select tests.login_as('admin');
select is((select state from public.admin_list_notifications(200) where kind = 'test' and recipient_email = 'admin@t.test'), 'failed', 'after five attempts a notice shows as failed');
select is((select state from public.admin_list_notifications(200) where kind = 'welcome' and recipient_email = 's1@t.test'), 'sent', 'a sent one as sent');
select is((select count(*)::int from public.admin_list_notifications(200, null, 'failed') where recipient_email like '%@t.test'), 1, 'the log can be filtered by state');
select ok((select id from public.admin_list_notifications(1)) = current_setting('t.maxid')::bigint, 'the newest is first');
select is((select count(*)::int from public.admin_list_notifications(3)), 3, 'a page has the size asked for');
select is((select max(id) from public.admin_list_notifications(3, current_setting('t.maxid')::bigint, null)) < current_setting('t.maxid')::bigint, true, 'the next page starts below the cursor');
select is((select last_error from public.admin_list_notifications(200) where kind = 'test' and recipient_email = 'admin@t.test'), 'push service said no', 'the log says what went wrong');

select lives_ok($$ select public.admin_resend_notification((select id from public.admin_list_notifications(200, null, 'failed') where recipient_email = 'admin@t.test' limit 1)) $$, 'a failed notice is sent again');
select is((select state from public.admin_list_notifications(200) where kind = 'test' and recipient_email = 'admin@t.test'), 'queued', 'it is queued with a clean slate');
select throws_ok($$ select public.admin_resend_notification((select id from public.admin_list_notifications(200) where kind = 'test' and recipient_email = 'admin@t.test')) $$, 'PT409', null, 'one that is not failed cannot be sent again');
select throws_ok($$ select public.admin_resend_notification(-1) $$, 'PT404', null, 'an unknown one is refused');

select * from finish();
rollback;
