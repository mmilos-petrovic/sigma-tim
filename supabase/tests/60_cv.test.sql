-- Teacher CVs: owner-only editing, two independent visibility switches (public / signed-in members), nothing else for anon.
begin;
select plan(62);

select tests.seed_basic();
-- ta: public + members, slug test-alfa;  tb: members only, slug test-beta;  tc and boss have no CV yet

-- who can read the CV tables -----------------------------------------------------------------------------
select tests.login_as('ta');
select is((select count(*)::int from public.teacher_cv where id = any(tests.ids('cv:'))), 1, 'a teacher reads their own CV');
select tests.login_as('tb');
select is((select count(*)::int from public.teacher_cv where id = any(tests.ids('cv:'))), 1, 'and only their own, even though both are shared with members');
select tests.login_as('tc');
select is((select count(*)::int from public.teacher_cv where id = any(tests.ids('cv:'))), 0, 'a teacher without a CV reads no CV table rows');
select tests.login_as('s1');
select is((select count(*)::int from public.teacher_cv where id = any(tests.ids('cv:'))), 0, 'students read CVs through the member functions, not the table');
select tests.login_as('admin');
select is((select count(*)::int from public.teacher_cv where id = any(tests.ids('cv:'))), 2, 'admin reads every CV');
select tests.login_anon();
select throws_ok($$ select count(*) from public.teacher_cv $$, '42501', null, 'anon cannot read the CV table');

-- editing --------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select is(tests.affected($$ update public.teacher_cv set about = 'New text', show_public = true where id = tests.id('cv:ta') $$), 1,
  'a teacher edits their CV and its switches');
select is(tests.affected($$ update public.teacher_cv set about = 'Hacked' where id = tests.id('cv:tb') $$), 0, 'but not a colleague''s');
select throws_ok($$ update public.teacher_cv set slug = 'something-else' where id = tests.id('cv:ta') $$, '42501', null,
  'the public link is stable: the slug cannot be changed');
select throws_ok($$ update public.teacher_cv set teacher_id = tests.id('p:tb') where id = tests.id('cv:ta') $$, '42501', null,
  'a CV cannot be handed to somebody else');

select lives_ok(
  $$ insert into public.cv_experience (cv_id, employer, position, period, description, sort_order)
     values (tests.id('cv:ta'), 'Second Employer', 'Tutor', '2024 -', 'More', 2) $$,
  'a teacher adds work experience'
);
select lives_ok(
  $$ insert into public.cv_skills (cv_id, skill, sort_order) values (tests.id('cv:ta'), 'Humor', 2) $$,
  'and a skill'
);
select throws_ok(
  $$ insert into public.cv_experience (cv_id, employer, position, period, sort_order)
     values (tests.id('cv:tb'), 'Fake Employer', 'Boss', '2020', 1) $$,
  '42501', null, 'but nothing on a colleague''s CV'
);
select is((select count(*)::int from public.cv_experience where cv_id = tests.id('cv:ta')), 2, 'the owner reads their experience');
select tests.login_as('tb');
select is((select count(*)::int from public.cv_experience where cv_id = tests.id('cv:ta')), 0, 'a colleague does not read it through the table');
select tests.login_as('s1');
select is((select count(*)::int from public.cv_skills where cv_id = tests.id('cv:ta')), 0, 'nor does a student');

-- creating -------------------------------------------------------------------------------------------------
select tests.login_as('tc');
select lives_ok($$ insert into public.teacher_cv (teacher_id, about) values (tests.id('p:tc'), 'About Gama') $$,
  'a teacher creates their CV');
select is(
  (select slug || '/' || show_public::text || '/' || show_members::text from public.teacher_cv where teacher_id = tests.id('p:tc')),
  'test-gama/false/false', 'its link comes from the name and it starts hidden from everybody'
);
select tests.login_as('ta');
select throws_ok($$ insert into public.teacher_cv (teacher_id) values (tests.id('p:tb')) $$, '42501', null,
  'a teacher cannot create a CV for a colleague');

select tests.logout();
select tests.mkteacher('dj1', 'Đorđe', 'Šćepanović', array['math']);
select tests.mkteacher('dj2', 'Đorđe', 'Šćepanović', array['math']);
insert into public.teacher_cv (teacher_id) values (tests.id('p:dj1'));
insert into public.teacher_cv (teacher_id) values (tests.id('p:dj2'));
select is((select slug from public.teacher_cv where teacher_id = tests.id('p:dj1')), 'djordje-scepanovic', 'Serbian letters are transliterated in the link');
select is((select slug from public.teacher_cv where teacher_id = tests.id('p:dj2')), 'djordje-scepanovic-2', 'a namesake gets a numbered link');
select throws_ok($$ update public.teacher_cv set about = repeat('x', 2001) where id = tests.id('cv:ta') $$, '23514', null,
  'the description has a length limit');

-- admin reads CVs but does not edit them; education and skills follow the same rules --------------------------
select tests.login_as('admin');
select is(tests.affected($$ update public.teacher_cv set about = 'Hacked' where id = tests.id('cv:ta') $$), 0, 'admin cannot edit a CV');
select is(tests.affected($$ delete from public.teacher_cv where id = tests.id('cv:ta') $$), 0, 'admin cannot delete a CV');
select is(tests.affected($$ update public.cv_experience set employer = 'Hacked' where cv_id = tests.id('cv:ta') $$), 0, 'admin cannot edit experience');
select is(tests.affected($$ delete from public.cv_experience where cv_id = tests.id('cv:ta') $$), 0, 'admin cannot delete experience');
select is(tests.affected($$ update public.cv_education set institution = 'Hacked' where cv_id = tests.id('cv:ta') $$), 0, 'admin cannot edit education');
select is(tests.affected($$ delete from public.cv_education where cv_id = tests.id('cv:ta') $$), 0, 'admin cannot delete education');
select throws_ok(
  $$ insert into public.cv_education (cv_id, institution, sort_order) values (tests.id('cv:ta'), 'Fake', 1) $$,
  '42501', null, 'admin cannot add education'
);
select is(tests.affected($$ update public.cv_skills set skill = 'Hacked' where cv_id = tests.id('cv:ta') $$), 0, 'admin cannot edit skills');
select is(tests.affected($$ delete from public.cv_skills where cv_id = tests.id('cv:ta') $$), 0, 'admin cannot delete skills');
select throws_ok(
  $$ insert into public.cv_skills (cv_id, skill, sort_order) values (tests.id('cv:ta'), 'Fake', 1) $$,
  '42501', null, 'admin cannot add skills'
);
select is((select count(*)::int from public.cv_education where cv_id = tests.id('cv:ta')), 1, 'admin reads education');

select tests.login_as('tb');
select is((select count(*)::int from public.cv_education where cv_id = tests.id('cv:ta')), 0, 'a colleague does not read education');
select throws_ok(
  $$ insert into public.cv_education (cv_id, institution, sort_order) values (tests.id('cv:ta'), 'Fake', 1) $$,
  '42501', null, 'a colleague cannot add education to it'
);
select throws_ok(
  $$ insert into public.cv_skills (cv_id, skill, sort_order) values (tests.id('cv:ta'), 'Fake', 1) $$,
  '42501', null, 'nor skills'
);

select tests.login_as('s1');
select is((select count(*)::int from public.cv_education where cv_id = tests.id('cv:ta')), 0, 'a student does not read education');

select tests.login_as('ta');
select is((select count(*)::int from public.cv_education where cv_id = tests.id('cv:ta')), 1, 'the owner reads education');
select is(tests.affected($$ update public.cv_education set institution = 'Renamed' where cv_id = tests.id('cv:ta') $$), 1, 'the owner edits it');
select is(tests.affected($$ delete from public.cv_education where cv_id = tests.id('cv:ta') $$), 1, 'and deletes it');

-- public functions -------------------------------------------------------------------------------------------
select tests.login_anon();
select is(
  (select array_agg(slug order by slug) from public.list_public_cvs() where slug in ('test-alfa', 'test-beta', 'test-gama')),
  array['test-alfa'], 'anon lists only CVs whose public switch is on'
);
select is(
  (select first_name || '/' || last_name || '/' || about || '/' || array_to_string(subjects, ',')
     from public.list_public_cvs() where slug = 'test-alfa'),
  'Test/Alfa/New text/Test Matematika', 'the list carries name, summary and subjects'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.get_public_cv('test-alfa')) k),
  array['about', 'education', 'experience', 'first_name', 'last_name', 'photo_path', 'skills', 'slug', 'subjects', 'updated_at'],
  'the public CV has exactly these fields: no email, no ids'
);
select is(public.get_public_cv('test-alfa') #>> '{experience,0,employer}', 'Test Employer', 'experience is included');
select is(public.get_public_cv('test-alfa') #>> '{skills,1}', 'Humor', 'skills are plain strings');
select is(public.get_public_cv('test-beta'), null, 'a CV shared with members only is not public');
select is(public.get_public_cv('no-such-teacher'), null, 'unknown links give nothing');
select throws_ok($$ select public.get_member_cv('test-alfa') $$, '42501', null, 'anon cannot call the member function');
select throws_ok($$ select * from public.list_member_cvs() $$, '42501', null, 'nor list member CVs');

-- ordering ------------------------------------------------------------------------------------------------------
select tests.logout();
insert into public.cv_experience (cv_id, employer, position, period, sort_order)
values (tests.id('cv:ta'), 'First Employer', 'Intern', '2018', 0);
select tests.login_anon();
select is(public.get_public_cv('test-alfa') #>> '{experience,0,employer}', 'First Employer', 'entries are ordered by their sort order');

-- member functions -----------------------------------------------------------------------------------------------
select tests.login_as('s1');
select is(
  (select array_agg(slug order by slug) from public.list_member_cvs() where slug in ('test-alfa', 'test-beta', 'test-gama')),
  array['test-alfa', 'test-beta'], 'a student sees the CVs shared with members'
);
select tests.login_as('p1');
select is(public.get_member_cv('test-beta') ->> 'about', 'About Beta', 'a parent can open one');
select tests.login_as('tc');
select is(public.get_member_cv('test-alfa') ->> 'about', 'New text', 'a colleague can open one');
select tests.login_as('admin');
select is(
  (select array_agg(slug order by slug) from public.list_member_cvs() where slug in ('test-alfa', 'test-beta', 'test-gama')),
  array['test-alfa', 'test-beta'], 'admin sees them as well');
select tests.login_as('outsider');
select throws_ok($$ select public.get_member_cv('test-alfa') $$, 'PT403', null, 'a Google account without a profile gets nothing');
select throws_ok($$ select * from public.list_member_cvs() $$, 'PT403', null, 'not even the list');

-- the switches take effect at once -------------------------------------------------------------------------------------
select tests.login_as('ta');
select is(tests.affected($$ update public.teacher_cv set show_members = false where id = tests.id('cv:ta') $$), 1, 'a teacher switches the member view off');
select tests.login_as('s1');
select is(
  (select array_agg(slug order by slug) from public.list_member_cvs() where slug in ('test-alfa', 'test-beta')),
  array['test-beta'], 'switching off the member view removes the CV from members at once');
select tests.login_anon();
select is(public.get_public_cv('test-alfa') ->> 'slug', 'test-alfa', '... while the public one stays');
select tests.login_as('ta');
select is(tests.affected($$ update public.teacher_cv set show_public = false where id = tests.id('cv:ta') $$), 1, 'and the public view');
select tests.login_anon();
select is(public.get_public_cv('test-alfa'), null, 'switching off the public view makes the link stop working at once');

select tests.logout();
update public.teachers set is_active = false where profile_id = tests.id('p:tb');
select tests.login_as('s1');
select is(public.get_member_cv('test-beta'), null, 'a deactivated teacher''s CV is hidden automatically');

select tests.logout();
select * from finish();
rollback;
