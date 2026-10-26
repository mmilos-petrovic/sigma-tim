-- Development data, loaded by `supabase db reset`. Never applied to staging or production.
-- The pgTAP suite does not depend on it: its fixtures are prefixed "Test" and use @t.test addresses.

insert into public.subjects (name) values ('Matematika'), ('Fizika'), ('Hemija'), ('Srpski jezik');

insert into public.locations (name, address) values ('Glavna lokacija', 'Ulica i broj, Grad');
insert into public.rooms (location_id, name)
select l.id, r.name from public.locations l cross join (values ('Učionica 1'), ('Učionica 2'), ('Učionica 3')) as r (name)
 where l.name = 'Glavna lokacija';

-- The first administrator is also a teacher, with every subject.
insert into public.profiles (email, first_name, last_name, is_admin)
values ('petrovicmilos@gmail.com', 'Miloš', 'Petrović', true);
insert into public.teachers (profile_id) select id from public.profiles where email = 'petrovicmilos@gmail.com';
insert into public.teacher_subjects (teacher_id, subject_id)
select p.id, s.id from public.profiles p cross join public.subjects s where p.email = 'petrovicmilos@gmail.com';

-- Two more accounts for the sign-in tests: an administrator who is not a teacher, and one who is both.
-- (petrovicmilos@gmail.com above stays unlinked locally, so a real Google account could still be tried with it.)
insert into public.profiles (email, first_name, last_name, is_admin) values
  ('admin@example.test', 'Dragana', 'Stojanović', true),
  ('admin.nastavnik@example.test', 'Nikola', 'Đorđević', true);
insert into public.teachers (profile_id) select id from public.profiles where email = 'admin.nastavnik@example.test';
insert into public.teacher_subjects (teacher_id, subject_id)
select p.id, s.id from public.profiles p cross join public.subjects s where p.email = 'admin.nastavnik@example.test';

-- A few people to look at in Studio and in the calendar. Nobody can sign in as them with Google locally (there is no
-- Google account behind them); `npm run dev:setup` gives the six test accounts of web/src/dev/personas.ts a password
-- instead, so the development sign-in panel can use them.
insert into public.profiles (email, first_name, last_name) values
  ('ana.nikolic@example.test', 'Ana', 'Nikolić'),
  ('marko.jovanovic@example.test', 'Marko', 'Jovanović'),
  ('ucenik1@example.test', 'Luka', 'Ilić'),
  ('ucenik2@example.test', 'Mina', 'Ilić'),
  ('ucenik3@example.test', 'Teodora', 'Savić'),
  ('roditelj1@example.test', 'Jelena', 'Ilić');

insert into public.teachers (profile_id) select id from public.profiles where email in ('ana.nikolic@example.test', 'marko.jovanovic@example.test');
insert into public.teacher_subjects (teacher_id, subject_id)
select p.id, s.id
  from public.profiles p join public.subjects s on s.name in ('Matematika', 'Fizika')
 where p.email = 'ana.nikolic@example.test'
union all
select p.id, s.id
  from public.profiles p join public.subjects s on s.name in ('Hemija', 'Srpski jezik')
 where p.email = 'marko.jovanovic@example.test';

insert into public.students (profile_id, school, grade, class_section, teacher_id)
select s.id, v.school, v.grade, v.section, t.id
  from (values
    ('ucenik1@example.test', 'OŠ Vuk Karadžić', '7', 'a', 'ana.nikolic@example.test'),
    ('ucenik2@example.test', 'OŠ Vuk Karadžić', '5', 'b', 'ana.nikolic@example.test'),
    ('ucenik3@example.test', 'Gimnazija', '2', 'c', null)
  ) as v (email, school, grade, section, teacher_email)
  join public.profiles s on s.email = v.email
  left join public.profiles t on t.email = v.teacher_email;

insert into public.parents (profile_id) select id from public.profiles where email = 'roditelj1@example.test';
insert into public.parent_students (parent_id, student_id)
select pa.id, st.id
  from public.profiles pa
  join public.profiles sp on sp.email in ('ucenik1@example.test', 'ucenik2@example.test')
  join public.students st on st.profile_id = sp.id
 where pa.email = 'roditelj1@example.test';
