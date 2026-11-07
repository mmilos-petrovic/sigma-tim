#!/usr/bin/env bash
# erase_teacher() against another administrator acting on the same teacher at the same moment.
#
# pgTAP runs in one session and cannot see these, so this script uses two:
#
#   1. A erases a teacher (transaction kept open for a few seconds), B reactivates that deactivated teacher. B must wait
#      for A and then be refused, because the teacher is erased: an erased record must never become active again.
#   2. A erases a teacher, B erases the same teacher. B must wait for A and then be refused ("already erased"), not run
#      the whole erase a second time.
#   3. A erases a teacher, B sets that teacher's phone number. B must wait for A and then be refused, and no number may
#      be left on the erased record.
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
  # started lessons cannot be deleted through the normal path, and the cascades are switched off with the triggers
  docker exec -i "$DB_CONTAINER" psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 <<'SQL' >/dev/null
set session_replication_role = replica;
delete from public.lesson_students where lesson_id in
  (select id from public.lessons where teacher_id in (select id from public.profiles where first_name = 'EraseRace'));
delete from public.lessons where teacher_id in (select id from public.profiles where first_name = 'EraseRace');
delete from public.teacher_subjects where teacher_id in (select id from public.profiles where first_name = 'EraseRace');
delete from public.teacher_locations where teacher_id in (select id from public.profiles where first_name = 'EraseRace');
delete from public.person_phones where profile_id in (select id from public.profiles where first_name = 'EraseRace');
delete from public.teachers where profile_id in (select id from public.profiles where first_name = 'EraseRace');
delete from public.profiles where first_name = 'EraseRace';
delete from auth.users where email like '%@erase.test';
delete from public.subjects where name = 'Erase Race Subject';
delete from public.locations where name = 'Erase Race Location';
SQL
}
trap cleanup EXIT
cleanup

psql_ <<'SQL'
insert into public.subjects (name) values ('Erase Race Subject');
insert into public.locations (name, address) values ('Erase Race Location', 'Street 1');
insert into public.profiles (email, first_name, last_name, is_admin) values
  ('admin@erase.test', 'EraseRace', 'Admin', true),
  ('t1@erase.test', 'EraseRace', 'One', false),
  ('t2@erase.test', 'EraseRace', 'Two', false),
  ('t3@erase.test', 'EraseRace', 'Three', false);
insert into public.teachers (profile_id, is_active)
  select id, email <> 't1@erase.test' from public.profiles where first_name = 'EraseRace' and email like 't_@erase.test';
insert into public.teacher_subjects (teacher_id, subject_id)
  select p.id, s.id from public.profiles p, public.subjects s
   where p.email like 't_@erase.test' and s.name = 'Erase Race Subject';
insert into public.teacher_locations (teacher_id, location_id)
  select p.id, l.id from public.profiles p, public.locations l
   where p.email like 't_@erase.test' and l.name = 'Erase Race Location';
-- a lesson that already started keeps each teacher's profile as a record, which is the case with something to race over
insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin, confirmed_at)
  select p.id, s.id, l.id,
         to_timestamp(floor(extract(epoch from now()) / 900) * 900) - interval '3 hours',
         to_timestamp(floor(extract(epoch from now()) / 900) * 900) - interval '2 hours',
         'confirmed', 'teacher', now()
    from public.profiles p, public.subjects s, public.locations l
   where p.email like 't_@erase.test' and s.name = 'Erase Race Subject' and l.name = 'Erase Race Location';
-- signing in links the account to the profile of the same email
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), 'authenticated', 'authenticated', 'admin@erase.test', now(), '{"provider":"google","providers":["google"]}', '{}', now(), now());
SQL

admin_user=$(psql_ -c "select id from auth.users where email = 'admin@erase.test'")
t1=$(psql_ -c "select id from public.profiles where email = 't1@erase.test'")
t2=$(psql_ -c "select id from public.profiles where email = 't2@erase.test'")
t3=$(psql_ -c "select id from public.profiles where email = 't3@erase.test'")
psql_ -c "insert into public.person_phones (profile_id, phone) values ('$t3', '+381641234567')"


as_admin() { # a statement, run in the administrator's session, followed by $2 seconds with the transaction still open
  psql_ 2>&1 <<SQL || true
begin;
set local request.jwt.claims = '{"sub":"$admin_user","role":"authenticated"}';
set local role authenticated;
$1
select pg_sleep($2);
commit;
SQL
}

race() { # description, statement for A, statement for B, expected text in B's answer, expected waiting seconds
  local out_a out_b started waited
  out_a=$(mktemp)
  as_admin "$2" 3 >"$out_a" &
  local pid_a=$!
  sleep 1 # A has done its work and holds the transaction open

  started=$(date +%s)
  out_b=$(as_admin "$3" 0)
  waited=$(( $(date +%s) - started ))
  wait "$pid_a"

  [ "$waited" -ge 1 ] && echo "ok - $1: B waited for A (${waited}s)" \
    || { echo "not ok - $1: B did not wait"; failures=$((failures + 1)); }
  case "$out_b" in
    *"$4"*) echo "ok - $1: B was refused ($4)" ;;
    *) echo "not ok - $1: B was not refused, it said: $out_b"; failures=$((failures + 1)) ;;
  esac
  rm -f "$out_a"
}

race "erase against reactivate" "select public.erase_teacher('$t1');" "select public.reactivate_teacher('$t1');" "this person was erased"
check "the erased teacher stays inactive" "f" "$(psql_ -c "select is_active from public.teachers where profile_id = '$t1'")"

race "erase against erase" "select public.erase_teacher('$t2');" "select public.erase_teacher('$t2');" "this person was already erased"
check "the profile was erased once" "1" "$(psql_ -c "select count(*) from public.profiles where id = '$t2' and erased_at is not null")"

# a number must not be written for somebody who is being erased: the erase clears it, and a late write is refused
race "erase against setting a number" "select public.erase_teacher('$t3');" "select public.set_person_phone('$t3', '+381641111111');" "this person was erased"
check "the erased teacher has no number" "0" "$(psql_ -c "select count(*) from public.person_phones where profile_id = '$t3'")"

if [ "$failures" -ne 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all concurrency checks passed"
