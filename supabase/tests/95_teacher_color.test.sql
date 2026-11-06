-- A teacher's colour: chosen by the teacher from a fixed palette of twelve, kept on the teacher (so every lesson of theirs,
-- past and future, has it) and visible to the people who see the teacher.
begin;
select plan(23);

select tests.seed_basic();

select has_column('public', 'teachers', 'color', 'teachers have a colour');
select is(
  (select count(*)::int from pg_constraint c, regexp_matches(pg_get_constraintdef(c.oid), '''([a-z]+)''', 'g')
    where c.conname = 'teachers_color_in_palette'),
  12, 'the palette has twelve colours'
);
select is((select count(*)::int from public.teachers where profile_id = any (tests.ids('p:')) and color is not null), 0,
  'nobody has a colour until they choose one');

-- choosing ---------------------------------------------------------------------------------------------------------------------

select tests.login_as('ta');
select is(tests.affected($$ update public.teachers set color = 'teal' where profile_id = tests.id('p:ta') $$), 1, 'a teacher picks a colour');
select is((select color from public.teachers where profile_id = tests.id('p:ta')), 'teal', 'and it is kept');
select is(
  (select count(*)::int
     from unnest(array['red', 'orange', 'brown', 'olive', 'green', 'teal', 'blue', 'indigo', 'purple', 'magenta', 'wine', 'slate']) as k
    where tests.affected(format($f$ update public.teachers set color = %L where profile_id = tests.id('p:ta') $f$, k)) = 1),
  12, 'every colour of the palette is accepted'
);
select throws_ok($$ update public.teachers set color = 'chartreuse' where profile_id = tests.id('p:ta') $$, '23514', null, 'a colour outside the palette is refused');
select throws_ok($$ update public.teachers set color = '#b3261e' where profile_id = tests.id('p:ta') $$, '23514', null, 'so is a free colour code');
select throws_ok($$ update public.teachers set color = 'RED' where profile_id = tests.id('p:ta') $$, '23514', null, 'and a name that differs in case');
select throws_ok($$ update public.teachers set color = '' where profile_id = tests.id('p:ta') $$, '23514', null, 'and an empty one');
select is(tests.affected($$ update public.teachers set color = null where profile_id = tests.id('p:ta') $$), 1, 'a teacher can go back to having no choice');
select is(tests.affected($$ update public.teachers set color = 'blue' $$), 1, 'an update without a condition reaches only the teacher''s own row');
select is(tests.affected($$ update public.teachers set color = 'red' where profile_id = tests.id('p:ta') $$), 1, 'ta ends with red');

-- nobody else chooses it ------------------------------------------------------------------------------------------------------------------

select tests.login_as('tb');
select is(tests.affected($$ update public.teachers set color = 'green' where profile_id = tests.id('p:ta') $$), 0, 'a colleague cannot change it');
select tests.login_as('admin');
select is(tests.affected($$ update public.teachers set color = 'green' where profile_id = tests.id('p:ta') $$), 0, 'nor can the administrator');
select tests.login_as('s1');
select is(tests.affected($$ update public.teachers set color = 'green' where profile_id = tests.id('p:ta') $$), 0, 'nor a student');
select tests.login_anon();
select throws_ok($$ update public.teachers set color = 'green' where profile_id = tests.id('p:ta') $$, '42501', null, 'nor a signed-out visitor');
select tests.logout();
update public.teachers set is_active = false where profile_id = tests.id('p:tc');
select tests.login_as('tc');
select is(tests.affected($$ update public.teachers set color = 'green' where profile_id = tests.id('p:tc') $$), 0, 'nor a teacher who was deactivated');
select tests.logout();
update public.teachers set is_active = true where profile_id = tests.id('p:tc');

-- who sees it ----------------------------------------------------------------------------------------------------------------------------------

update public.teachers set color = 'purple' where profile_id = tests.id('p:tb');

select tests.login_as('tb');
select is((select color from public.teachers where profile_id = tests.id('p:ta')), 'red', 'a colleague sees it, and each keeps their own colour');
select tests.login_as('s1');
select is((select color from public.teachers where profile_id = tests.id('p:ta')), 'red', 'a student sees the colour of their teacher');
select tests.login_as('s3');
select is((select count(*)::int from public.teachers where profile_id = tests.id('p:ta')), 0, 'but not of a teacher they do not study with');
select tests.login_as('p1');
select is((select array_agg(color order by color) from public.teachers where profile_id = any (tests.ids('p:'))), array['purple', 'red'],
  'a parent sees the colours of the teachers of all their children');
select tests.login_as('admin');
select is((select count(*)::int from public.teachers where profile_id = any (tests.ids('p:')) and color is not null), 2, 'the administrator sees them');

select * from finish();
rollback;
