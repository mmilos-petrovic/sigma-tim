-- What the CV editor needs: the two rules on the table, and save_my_cv (all of the CV in one transaction).
begin;
select plan(45);

select tests.seed_basic();

create function tests.cv_summary(p_teacher_key text) returns text language sql as $$
  select (select row(c.about, c.show_public, c.show_members,
            (select string_agg(e.employer || '/' || e.position || '/' || coalesce(e.period, '-') || '/' || coalesce(e.description, '-'), ';' order by e.sort_order) from public.cv_experience e where e.cv_id = c.id),
            (select string_agg(e.institution || '/' || coalesce(e.degree, '-') || '/' || coalesce(e.period, '-'), ';' order by e.sort_order) from public.cv_education e where e.cv_id = c.id),
            (select string_agg(k.skill, ';' order by k.sort_order) from public.cv_skills k where k.cv_id = c.id))::text
          from public.teacher_cv c where c.teacher_id = tests.id('p:' || p_teacher_key))
$$;

-- the rules on the table ------------------------------------------------------------------------------------------------------------------
select tests.login_as('ta');
select throws_ok($$ update public.teacher_cv set about = '   ' where id = tests.id('cv:ta') $$, '23514', null, 'a CV that is shown cannot lose its text');
select throws_ok($$ update public.teacher_cv set about = null where id = tests.id('cv:ta') $$, '23514', null, 'nor have none');
select lives_ok($$ update public.teacher_cv set show_public = false, show_members = false, about = null where id = tests.id('cv:ta') $$, 'once it is hidden the text may go');
select throws_ok($$ update public.teacher_cv set show_members = true where id = tests.id('cv:ta') $$, '23514', null, 'and it cannot be shown without it');
select lives_ok($$ update public.teacher_cv set about = 'About Alfa', show_public = true, show_members = true where id = tests.id('cv:ta') $$, 'with the text it can');
select lives_ok(
  format($$ update public.teacher_cv set photo_path = '%s/11111111-1111-1111-1111-111111111111.jpg' where id = tests.id('cv:ta') $$, tests.id('p:ta')),
  'the photo is a file in the teacher''s own folder'
);
select lives_ok(
  format($$ update public.teacher_cv set photo_path = '%s/22222222-2222-2222-2222-222222222222.webp' where id = tests.id('cv:ta') $$, tests.id('p:ta')),
  'JPEG or WebP'
);
select throws_ok(
  format($$ update public.teacher_cv set photo_path = '%s/11111111-1111-1111-1111-111111111111.jpg' where id = tests.id('cv:ta') $$, tests.id('p:tb')),
  '23514', null, 'a colleague''s folder is refused'
);
select throws_ok(
  format($$ update public.teacher_cv set photo_path = '%s/../x.jpg' where id = tests.id('cv:ta') $$, tests.id('p:ta')),
  '23514', null, 'so is a path that is not one of ours'
);
select throws_ok(
  format($$ update public.teacher_cv set photo_path = '%s/11111111-1111-1111-1111-111111111111.png' where id = tests.id('cv:ta') $$, tests.id('p:ta')),
  '23514', null, 'and another kind of file'
);
select lives_ok($$ update public.teacher_cv set photo_path = null where id = tests.id('cv:ta') $$, 'the photo can be taken away');
select tests.logout();

-- saving a CV --------------------------------------------------------------------------------------------------------------------------------
-- tc has no CV yet
select tests.login_as('tc');
select lives_ok(
  $$ select public.save_my_cv(
       '  About Gama  ', true, false,
       '[{"employer":"Skola 1","position":"Nastavnik","period":"2019 - 2021","description":"Matematika"},{"employer":"Skola 2","position":"Profesor"}]',
       '[{"institution":"Matematicki fakultet","degree":"Master","period":"2012 - 2017"}]',
       '["Strpljenje", "Zadaci za prijemni"]') $$,
  'a teacher with no CV makes it in one call'
);
select tests.logout();
select is(
  tests.cv_summary('tc'),
  '(' || '"About Gama",t,f,"Skola 1/Nastavnik/2019 - 2021/Matematika;Skola 2/Profesor/-/-","Matematicki fakultet/Master/2012 - 2017","Strpljenje;Zadaci za prijemni")',
  'the text is trimmed, the entries keep their order and an empty period or description is none'
);
select is((select slug from public.teacher_cv where teacher_id = tests.id('p:tc')), 'test-gama', 'the public link is made from the name');
select is(
  (select string_agg(e.sort_order::text, ',' order by e.sort_order) from public.cv_experience e join public.teacher_cv c on c.id = e.cv_id where c.teacher_id = tests.id('p:tc')),
  '1,2', 'the position of every job is stored: 1, 2'
);
select is(
  (select string_agg(e.sort_order::text, ',' order by e.sort_order) from public.cv_education e join public.teacher_cv c on c.id = e.cv_id where c.teacher_id = tests.id('p:tc')),
  '1', 'and of every school'
);
select is(
  (select string_agg(k.sort_order::text, ',' order by k.sort_order) from public.cv_skills k join public.teacher_cv c on c.id = k.cv_id where c.teacher_id = tests.id('p:tc')),
  '1,2', 'and of every skill'
);

select tests.login_as('tc');
select lives_ok(
  $$ select public.save_my_cv(null, false, false, '[{"employer":"Skola 2","position":"Profesor"}]', '[]', '["Jedno"]') $$,
  'saving again replaces the lists and the text'
);
select tests.logout();
select is(tests.cv_summary('tc'), '(,f,f,"Skola 2/Profesor/-/-",,Jedno)', 'the old entries are gone, an emptied list is empty');
select is((select slug from public.teacher_cv where teacher_id = tests.id('p:tc')), 'test-gama', 'and the link did not change');
select is((select count(*)::int from public.teacher_cv where teacher_id = tests.id('p:tc')), 1, 'one CV per teacher');

-- a CV is shown only with its text
select tests.login_as('tc');
select throws_ok($$ select public.save_my_cv('  ', true, false, '[]', '[]', '[]') $$, 'PT409', null, 'switching it on without the text is refused');
select throws_ok($$ select public.save_my_cv(null, false, true, '[]', '[]', '[]') $$, 'PT409', null, 'for either switch');
select lives_ok($$ select public.save_my_cv('Tekst', false, true, '[]', '[]', '[]') $$, 'with the text it works');
select tests.login_as('s1');
select is((select count(*)::int from public.list_member_cvs() where slug = 'test-gama'), 1, 'and members then read it');
select tests.login_as('tc');

-- nothing is saved when anything is wrong
select throws_ok(
  $$ select public.save_my_cv('Drugi tekst', false, false, '[{"employer":"Nova","position":"Nastavnik"},{"employer":"","position":"Prazan"}]', '[{"institution":"Nova"}]', '["Nova"]') $$,
  '23514', null, 'an entry without an employer is refused'
);
select tests.logout();
select is(tests.cv_summary('tc'), '(Tekst,f,t,,,)', 'and the CV is as it was, whole (the lists were emptied by the earlier save)');
select tests.login_as('tc');
select throws_ok($$ select public.save_my_cv('x', false, false, '[]', '[{"institution":""}]', '[]') $$, '23514', null, 'an education without an institution is refused');
select throws_ok($$ select public.save_my_cv('x', false, false, '[]', '[]', '[""]') $$, '23514', null, 'and a blank skill');
select throws_ok($$ select public.save_my_cv('x', false, false, '{}', '[]', '[]') $$, 'PT400', null, 'a list has to be a list');
select throws_ok($$ select public.save_my_cv('x', null, false, '[]', '[]', '[]') $$, 'PT400', null, 'and the switches have to be given');
select throws_ok(
  format($$ select public.save_my_cv('x', false, false, %L::jsonb, '[]', '[]') $$, (select jsonb_agg(jsonb_build_object('employer', 'E' || i, 'position', 'P')) from generate_series(1, 21) i)),
  'PT400', null, 'twenty-one jobs are too many'
);
select throws_ok(
  format($$ select public.save_my_cv('x', false, false, '[]', '[]', %L::jsonb) $$, (select jsonb_agg('S' || i) from generate_series(1, 51) i)),
  'PT400', null, 'and fifty-one skills'
);
select throws_ok($$ select public.save_my_cv(repeat('x', 2001), false, false, '[]', '[]', '[]') $$, '23514', null, 'a text over 2000 characters');
select tests.logout();

-- only teachers save a CV, and only their own
select tests.login_as('ta');
select lives_ok($$ select public.save_my_cv('Alfa novo', true, true, '[]', '[]', '[]') $$, 'a colleague saves theirs');
select tests.logout();
select is(tests.cv_summary('tc'), '(Tekst,f,t,,,)', 'and the first teacher''s CV is untouched');
select is((select about from public.teacher_cv where id = tests.id('cv:tb')), 'About Beta', 'and a third one''s');
select tests.login_as('s1');
select throws_ok($$ select public.save_my_cv('x', false, false, '[]', '[]', '[]') $$, 'PT403', null, 'a student cannot save a CV');
select tests.login_as('p1');
select throws_ok($$ select public.save_my_cv('x', false, false, '[]', '[]', '[]') $$, 'PT403', null, 'nor a parent');
select tests.login_as('admin');
select throws_ok($$ select public.save_my_cv('x', false, false, '[]', '[]', '[]') $$, 'PT403', null, 'nor an administrator who does not teach');
select tests.login_as('outsider');
select throws_ok($$ select public.save_my_cv('x', false, false, '[]', '[]', '[]') $$, 'PT403', null, 'nor a stranger');
select tests.login_anon();
select throws_ok($$ select public.save_my_cv('x', false, false, '[]', '[]', '[]') $$, '42501', null, 'nor a visitor');
select tests.logout();
update public.teachers set is_active = false where profile_id = tests.id('p:tb');
select tests.login_as('tb');
select throws_ok($$ select public.save_my_cv('x', false, false, '[]', '[]', '[]') $$, 'PT403', null, 'a teacher who is deactivated cannot either');
select tests.logout();

-- the teacher who is also an administrator saves theirs, like any other
select tests.login_as('boss');
select lives_ok($$ select public.save_my_cv('Sef', false, false, '[]', '[]', '["Sve"]') $$, 'a teacher who is also an administrator saves their CV');
select tests.logout();
select is(tests.cv_summary('boss'), '(Sef,f,f,,,Sve)', 'as saved');

select * from finish();
rollback;
