-- Phase 7e: the site is built again by itself when what the public pages show has changed: the text that stands for the
-- public pages, and the job that asks Cloudflare for a rebuild (once in ten minutes, until Cloudflare accepts).
begin;
select plan(52);

select tests.seed_basic();

-- remembers what the public pages say now, under a label
create function tests.keep(p_label text) returns void language sql as $$
  select set_config('t.h_' || p_label, private.public_site_hash(), true)
$$;
create function tests.unchanged(p_label text) returns boolean language sql stable as $$
  select private.public_site_hash() = current_setting('t.h_' || p_label)
$$;
-- the row of the job
create function tests.row_of_job() returns private.site_rebuild language sql stable as $$
  select * from private.site_rebuild where singleton
$$;
create function tests.requests() returns integer language sql stable as $$
  select count(*)::int from net.http_request_queue
$$;
-- Cloudflare's answer to the last request of the job
create function tests.answer(p_status integer) returns void language sql as $$
  insert into net._http_response (id, status_code) values ((tests.row_of_job()).request_id, p_status)
$$;
create function tests.age(p_minutes integer) returns void language sql as $$
  update private.site_rebuild set requested_at = now() - make_interval(mins => p_minutes) where singleton
$$;

-- who may call it ----------------------------------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from unnest(array['private.public_site_hash()', 'private.rebuild_site_if_changed()']) f
    where has_function_privilege('authenticated', f, 'execute') or has_function_privilege('anon', f, 'execute')),
  0, 'neither a signed-in person nor a visitor can call them');
select is(
  (select count(*)::int from unnest(array['select', 'insert', 'update', 'delete']) p
    where has_table_privilege('authenticated', 'private.site_rebuild', p) or has_table_privilege('anon', 'private.site_rebuild', p)),
  0, 'or read or write the job''s row');
select is((select count(*)::int from private.site_rebuild), 1, 'the job has its one row');

-- what the public pages say ------------------------------------------------------------------------------------------------------------
-- seed: ta has a public CV, tb one for members only
select tests.keep('base');
select ok(tests.unchanged('base'), 'it does not change by itself');
select ok(private.public_site_hash() <> md5(''), 'and it is made of the public CV');

update public.teacher_cv set about = 'Other text about Beta' where id = tests.id('cv:tb');
update public.teacher_cv set photo_path = tests.id('p:tb') || '/11111111-1111-1111-1111-111111111111.jpg' where id = tests.id('cv:tb');
select ok(tests.unchanged('base'), 'a CV for members only may change without a rebuild');

update public.teacher_cv set about = 'Changed text' where id = tests.id('cv:ta');
select ok(not tests.unchanged('base'), 'a changed text is a change');
update public.teacher_cv set about = 'About Alfa' where id = tests.id('cv:ta');
select ok(tests.unchanged('base'), 'and putting it back is none');

update public.teacher_cv set photo_path = tests.id('p:ta') || '/22222222-2222-2222-2222-222222222222.webp' where id = tests.id('cv:ta');
select ok(not tests.unchanged('base'), 'a new photo is a change');
update public.teacher_cv set photo_path = null where id = tests.id('cv:ta');
select ok(tests.unchanged('base'), 'and none again is none');

update public.profiles set first_name = 'Renamed' where id = tests.id('p:ta');
select ok(not tests.unchanged('base'), 'the name of the teacher is a change');
update public.profiles set first_name = 'Test' where id = tests.id('p:ta');
select ok(tests.unchanged('base'), 'and so back');

insert into public.teacher_subjects (teacher_id, subject_id) values (tests.id('p:ta'), tests.id('subj:phys'));
select ok(not tests.unchanged('base'), 'a subject is a change');
delete from public.teacher_subjects where teacher_id = tests.id('p:ta') and subject_id = tests.id('subj:phys');
select ok(tests.unchanged('base'), 'and taking it away is none');

insert into public.cv_experience (cv_id, employer, position, sort_order) values (tests.id('cv:ta'), 'Other Employer', 'Tutor', 2);
select ok(not tests.unchanged('base'), 'a job is a change');
delete from public.cv_experience where cv_id = tests.id('cv:ta') and employer = 'Other Employer';
select ok(tests.unchanged('base'), 'and so is losing it');

update public.cv_education set degree = 'Physics' where cv_id = tests.id('cv:ta');
select ok(not tests.unchanged('base'), 'a changed degree is a change');
update public.cv_education set degree = 'Mathematics' where cv_id = tests.id('cv:ta');
select ok(tests.unchanged('base'), 'and so back');

insert into public.cv_skills (cv_id, skill, sort_order) values (tests.id('cv:ta'), 'Humour', 2);
select ok(not tests.unchanged('base'), 'a skill is a change');
delete from public.cv_skills where cv_id = tests.id('cv:ta') and skill = 'Humour';
select ok(tests.unchanged('base'), 'and so is losing it');

update public.teacher_cv set show_public = false where id = tests.id('cv:ta');
select ok(not tests.unchanged('base'), 'hiding the CV is a change');
update public.teacher_cv set show_public = true where id = tests.id('cv:ta');
select ok(tests.unchanged('base'), 'and showing it again is none');

update public.teacher_cv set show_public = true where id = tests.id('cv:tb');
select ok(not tests.unchanged('base'), 'another CV that becomes public is a change');
update public.teacher_cv set show_public = false where id = tests.id('cv:tb');
select ok(tests.unchanged('base'), 'and so back');

update public.teacher_cv set show_public = true, show_members = false where id = tests.id('cv:tb');
select ok(not tests.unchanged('base'), 'a CV that is for the public only is a change too');
update public.teacher_cv set show_public = false, show_members = true where id = tests.id('cv:tb');
select ok(tests.unchanged('base'), 'and so back');

update public.teachers set is_active = false where profile_id = tests.id('p:ta');
select ok(not tests.unchanged('base'), 'a teacher who is deactivated drops out of the pages');
update public.teachers set is_active = true where profile_id = tests.id('p:ta');
select ok(tests.unchanged('base'), 'and comes back');

-- the job ------------------------------------------------------------------------------------------------------------------------------
select ok(
  not exists (select 1 from pg_available_extensions where name = 'pg_cron')
  or exists (select 1 from cron.job where jobname = 'rebuild-site' and schedule = '*/5 * * * *'),
  'the job runs every five minutes (when pg_cron exists)');

select is(private.rebuild_site_if_changed(), false, 'without the address of the hook in the Vault nothing is called');
select is(tests.requests(), 0, 'no request was made');
select vault.create_secret('http://127.0.0.1:1/deploy-hook', 'site_deploy_hook_url');
select is(private.rebuild_site_if_changed(), true, 'with it, the hook is called');
select is((select count(*)::int from net.http_request_queue where url = 'http://127.0.0.1:1/deploy-hook' and method = 'POST'), 1, 'with one POST to the address');
select is((tests.row_of_job()).requested_hash, private.public_site_hash(), 'for what the pages say now');
select is((tests.row_of_job()).built_hash, null, 'which is not on the site until Cloudflare accepts');

select is(private.rebuild_site_if_changed(), false, 'while there is no answer it waits');
select is(tests.requests(), 1, 'and does not ask again');
select tests.age(12);
select is(private.rebuild_site_if_changed(), false, 'also after the ten minutes of the pace, as long as an answer may still come');
select is(tests.requests(), 1, 'still one request');

select tests.answer(200);
select is(private.rebuild_site_if_changed(), false, 'once Cloudflare accepted and nothing changed there is nothing to do');
select is((tests.row_of_job()).built_hash, private.public_site_hash(), 'the site has what the pages say');
select is((tests.row_of_job()).request_id, null, 'and no request is waiting');

select tests.age(2);
update public.teacher_cv set about = 'First change' where id = tests.id('cv:ta');
select is(private.rebuild_site_if_changed(), false, 'a change is not sent at once but after the ten minutes since the last request');
select tests.age(11);
select is(private.rebuild_site_if_changed(), true, 'then it is');
select is(tests.requests(), 2, 'with a second request');

select tests.answer(500);
select tests.age(11);
update public.teacher_cv set about = 'Second change' where id = tests.id('cv:ta');
select is(private.rebuild_site_if_changed(), true, 'a refused request is made again, for what the pages say by then');
select is((tests.row_of_job()).built_hash <> private.public_site_hash(), true, 'the refusal did not count as built');
select is(tests.requests(), 3, 'a third request');

-- no answer at all for a quarter of an hour: the request is given up and made again
select tests.age(16);
select is(private.rebuild_site_if_changed(), true, 'a request that stays without an answer is made again after a quarter of an hour');
select is(tests.requests(), 4, 'a fourth request');

-- a redirect is not an acceptance either
select tests.answer(301);
select tests.age(11);
select is(private.rebuild_site_if_changed(), true, 'an answer that is not a success is asked again');
select is((tests.row_of_job()).built_hash <> private.public_site_hash(), true, 'and still not built');

select * from finish();
rollback;
