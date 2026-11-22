#!/usr/bin/env bash
# erase_person() against another session that changes the same person at the same moment.
#
# pgTAP runs in one session and cannot see these, so this script uses two. In both, A is the other session: it takes its
# locks first and keeps its transaction open for a few seconds, and B is the administrator erasing the person. B must wait
# for A and then act on what A did:
#
#   1. A links a child to a parent, B erases that parent. Without the lock on the parent role, B would have read "no
#      children", deleted the role and silently taken A's new link with it. B must be refused instead.
#   2. A books a free slot for a student, B erases that student. Without the lock on the student, B would have deleted the
#      student under the booking and left a booked lesson with nobody on it (the commit would fail). B must instead free
#      the slot again.
#
# Needs the local stack (`npm run db:start`) and docker. It commits real rows and removes them again on exit.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_sigma-tim}"

psql_() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -At -v ON_ERROR_STOP=1 "$@"; }

failures=0
check() { # description, expected, actual
  if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (expected '$2', got '$3')"; failures=$((failures + 1)); fi
}

cleanup() {
  docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
set session_replication_role = replica;
delete from public.lesson_students where lesson_id in
  (select id from public.lessons where teacher_id in (select id from public.profiles where first_name = 'ErasePersonRace'));
delete from public.lessons where teacher_id in (select id from public.profiles where first_name = 'ErasePersonRace');
delete from public.parent_students where parent_id in (select id from public.profiles where first_name = 'ErasePersonRace');
delete from public.parents where profile_id in (select id from public.profiles where first_name = 'ErasePersonRace');
delete from public.students where profile_id in (select id from public.profiles where first_name = 'ErasePersonRace');
delete from public.teacher_subjects where teacher_id in (select id from public.profiles where first_name = 'ErasePersonRace');
delete from public.teacher_locations where teacher_id in (select id from public.profiles where first_name = 'ErasePersonRace');
delete from public.teachers where profile_id in (select id from public.profiles where first_name = 'ErasePersonRace');
delete from public.notifications where recipient_id in (select id from public.profiles where first_name = 'ErasePersonRace');
delete from public.profiles where first_name = 'ErasePersonRace';
delete from auth.users where email like '%@eraseperson.test';
delete from public.subjects where name = 'Erase Person Race Subject';
delete from public.locations where name = 'Erase Person Race Location';
SQL
}
trap cleanup EXIT
cleanup

psql_ <<'SQL'
insert into public.subjects (name) values ('Erase Person Race Subject');
insert into public.locations (name, address) values ('Erase Person Race Location', 'Street 1');
insert into public.profiles (email, first_name, last_name, is_admin) values
  ('admin@eraseperson.test', 'ErasePersonRace', 'Admin', true),
  ('teacher@eraseperson.test', 'ErasePersonRace', 'Teacher', false),
  ('parent@eraseperson.test', 'ErasePersonRace', 'Parent', false),
  ('child@eraseperson.test', 'ErasePersonRace', 'Child', false),
  ('student@eraseperson.test', 'ErasePersonRace', 'Student', false);
insert into public.teachers (profile_id)
  select id from public.profiles where email = 'teacher@eraseperson.test';
insert into public.teacher_subjects (teacher_id, subject_id)
  select p.id, s.id from public.profiles p, public.subjects s
   where p.email = 'teacher@eraseperson.test' and s.name = 'Erase Person Race Subject';
insert into public.teacher_locations (teacher_id, location_id)
  select p.id, l.id from public.profiles p, public.locations l
   where p.email = 'teacher@eraseperson.test' and l.name = 'Erase Person Race Location';
insert into public.students (profile_id, teacher_id)
  select p.id, t.id from public.profiles p, public.profiles t
   where p.email in ('child@eraseperson.test', 'student@eraseperson.test') and t.email = 'teacher@eraseperson.test';
insert into public.parents (profile_id) select id from public.profiles where email = 'parent@eraseperson.test';
-- a free slot a week ahead, on the 15-minute grid
insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
  select p.id, s.id, l.id,
         to_timestamp(floor(extract(epoch from now()) / 900) * 900) + interval '7 days',
         to_timestamp(floor(extract(epoch from now()) / 900) * 900) + interval '7 days 1 hour',
         'open', 'slot'
    from public.profiles p, public.subjects s, public.locations l
   where p.email = 'teacher@eraseperson.test' and s.name = 'Erase Person Race Subject' and l.name = 'Erase Person Race Location';
-- signing in links the account to the profile of the same email
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select gen_random_uuid(), 'authenticated', 'authenticated', e, now(), '{"provider":"google","providers":["google"]}', '{}', now(), now()
    from unnest(array['admin@eraseperson.test', 'parent@eraseperson.test', 'student@eraseperson.test']) as e;
SQL

admin_user=$(psql_ -c "select id from auth.users where email = 'admin@eraseperson.test'")
parent=$(psql_ -c "select id from public.profiles where email = 'parent@eraseperson.test'")
student=$(psql_ -c "select id from public.profiles where email = 'student@eraseperson.test'")
student_record=$(psql_ -c "select id from public.students where profile_id = '$student'")
child_record=$(psql_ -c "select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'child@eraseperson.test'")
slot=$(psql_ -c "select l.id from public.lessons l join public.profiles p on p.id = l.teacher_id where p.email = 'teacher@eraseperson.test'")

as_other() { # statements run in a transaction that stays open for $2 seconds after them; $3 = quiet: without any trigger
  # (the triggers of a booking write notices, which lock the profile of the student, and B would wait for that and not for
  # the student record, which is the lock under test)
  local user=postgres quiet=""
  if [ "${3:-}" = "quiet" ]; then user=supabase_admin; quiet="set local session_replication_role = replica;"; fi
  docker exec -i "$DB_CONTAINER" psql -U "$user" -d postgres -X -q -At -v ON_ERROR_STOP=1 2>&1 <<SQL || true
begin;
$quiet
$1
select 'locked';
select pg_sleep($2);
commit;
SQL
}

as_admin() { # a statement run in the administrator's session
  psql_ 2>&1 <<SQL || true
begin;
set local request.jwt.claims = '{"sub":"$admin_user","role":"authenticated"}';
set local role authenticated;
$1
commit;
SQL
}

race() { # description, statements for A, statement for B, expected text in B's answer ('' for none), 'quiet' for A without triggers
  local out_a out_b started waited
  out_a=$(mktemp)
  as_other "$2" 3 "${5:-}" >"$out_a" &
  local pid_a=$!
  for _ in $(seq 1 100); do grep -q locked "$out_a" && break; sleep 0.1; done # A has done its work and holds the transaction open
  grep -q locked "$out_a" || { echo "not ok - $1: A never got its locks: $(cat "$out_a")"; failures=$((failures + 1)); }

  started=$(date +%s)
  out_b=$(as_admin "$3")
  waited=$(( $(date +%s) - started ))
  wait "$pid_a"

  [ "$waited" -ge 2 ] && echo "ok - $1: B waited for A (${waited}s)" \
    || { echo "not ok - $1: B did not wait"; failures=$((failures + 1)); }
  if [ -n "$4" ]; then
    case "$out_b" in
      *"$4"*) echo "ok - $1: B was refused ($4)" ;;
      *) echo "not ok - $1: B was not refused, it said: $out_b"; failures=$((failures + 1)) ;;
    esac
  else
    case "$out_b" in
      *ERROR*) echo "not ok - $1: B failed: $out_b"; failures=$((failures + 1)) ;;
      *) echo "ok - $1: B went through" ;;
    esac
  fi
  rm -f "$out_a"
}

race "link a child against erasing the parent" \
  "select 1 from public.parents where profile_id = '$parent' for update;
   insert into public.parent_students (parent_id, student_id) values ('$parent', '$child_record');" \
  "select public.erase_person('$parent');" \
  "a parent with children cannot be erased"
check "the parent and the new link are both still there" "1/1" \
  "$(psql_ -c "select (select count(*) from public.profiles where id = '$parent') || '/' || (select count(*) from public.parent_students where parent_id = '$parent')")"

race "booking a slot against erasing the student" \
  "select 1 from public.students where id = '$student_record' for update;
   update public.lessons set status = 'confirmed', confirmed_at = now() where id = '$slot';
   insert into public.lesson_students (lesson_id, student_id) values ('$slot', '$student_record');" \
  "select public.erase_person('$student');" \
  "" quiet
check "the student is gone and the slot is free again" "0/open/0" \
  "$(psql_ -c "select (select count(*) from public.profiles where id = '$student') || '/' || (select status from public.lessons where id = '$slot') || '/' || (select count(*) from public.lesson_students where lesson_id = '$slot')")"
check "the student's Google account is gone" "0" "$(psql_ -c "select count(*) from auth.users where email = 'student@eraseperson.test'")"

if [ "$failures" -ne 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all concurrency checks passed"
