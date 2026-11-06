#!/usr/bin/env bash
# Taking a location away from a teacher against a lesson being written at that location at the same moment.
#
# pgTAP runs in one session and cannot see these, so this script uses two. In both orders the lesson and the removal must
# not both succeed (that would leave a lesson at a location the teacher may not use):
#
#   1. A takes the location away (transaction kept open for a few seconds), B writes a free slot there. B must wait for A
#      and then be refused, because the location is gone.
#   2. A writes a free slot there (transaction kept open), B takes the location away, once through the administrator's
#      function and once with a plain delete. B must wait for A and then be refused, because there is a slot now.
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
  psql_ <<'SQL' >/dev/null
delete from public.lessons where teacher_id in (select id from public.profiles where email like '%@locrace.test');
delete from public.teachers where profile_id in (select id from public.profiles where email like '%@locrace.test');
delete from public.profiles where email like '%@locrace.test';
delete from auth.users where email like '%@locrace.test';
delete from public.subjects where name = 'Loc Race Subject';
delete from public.locations where name in ('Loc Race X', 'Loc Race Y');
SQL
}
trap cleanup EXIT
cleanup

psql_ <<'SQL'
insert into public.subjects (name) values ('Loc Race Subject');
insert into public.locations (name, address) values ('Loc Race X', 'x'), ('Loc Race Y', 'y');
insert into public.profiles (email, first_name, last_name, is_admin) values
  ('admin@locrace.test', 'LocRace', 'Admin', true),
  ('teacher@locrace.test', 'LocRace', 'Teacher', false);
insert into public.teachers (profile_id) select id from public.profiles where email = 'teacher@locrace.test';
insert into public.teacher_subjects (teacher_id, subject_id)
  select p.id, s.id from public.profiles p, public.subjects s where p.email = 'teacher@locrace.test' and s.name = 'Loc Race Subject';
insert into public.teacher_locations (teacher_id, location_id)
  select p.id, l.id from public.profiles p, public.locations l where p.email = 'teacher@locrace.test' and l.name in ('Loc Race X', 'Loc Race Y');
-- signing in links the account to the profile of the same email
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), 'authenticated', 'authenticated', 'admin@locrace.test', now(), '{"provider":"google","providers":["google"]}', '{}', now(), now());
SQL

admin_user=$(psql_ -c "select id from auth.users where email = 'admin@locrace.test'")
teacher=$(psql_ -c "select id from public.profiles where email = 'teacher@locrace.test'")
loc_x=$(psql_ -c "select id from public.locations where name = 'Loc Race X'")
loc_y=$(psql_ -c "select id from public.locations where name = 'Loc Race Y'")
subject=$(psql_ -c "select id from public.subjects where name = 'Loc Race Subject'")

slot="insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
  values ('$teacher', '$subject', '$loc_x', date_trunc('hour', now()) + interval '40 hours', date_trunc('hour', now()) + interval '41 hours', 'open', 'slot');"

session() { # who (admin or db), a statement, then $3 seconds with the transaction still open
  local who_sql=""
  if [ "$1" = "admin" ]; then
    who_sql="set local request.jwt.claims = '{\"sub\":\"$admin_user\",\"role\":\"authenticated\"}'; set local role authenticated;"
  fi
  psql_ 2>&1 <<SQL || true
begin;
$who_sql
$2
select pg_sleep($3);
commit;
SQL
}

race() { # description, who and statement for A, who and statement for B, expected text in B's answer
  local out_a out_b started waited
  out_a=$(mktemp)
  session "$2" "$3" 3 >"$out_a" &
  local pid_a=$!
  sleep 1 # A has done its work and holds the transaction open

  started=$(date +%s)
  out_b=$(session "$4" "$5" 0)
  waited=$(( $(date +%s) - started ))
  wait "$pid_a"

  [ "$waited" -ge 1 ] && echo "ok - $1: B waited for A (${waited}s)" \
    || { echo "not ok - $1: B did not wait"; failures=$((failures + 1)); }
  case "$out_b" in
    *"$6"*) echo "ok - $1: B was refused ($6)" ;;
    *) echo "not ok - $1: B was not refused, it said: $out_b"; failures=$((failures + 1)) ;;
  esac
  rm -f "$out_a"
}

lessons_at_x() { psql_ -c "select count(*) from public.lessons where teacher_id = '$teacher' and location_id = '$loc_x'"; }
locations_of_teacher() { psql_ -c "select count(*) from public.teacher_locations where teacher_id = '$teacher' and location_id = '$loc_x'"; }
give_x_back() { psql_ -c "insert into public.teacher_locations (teacher_id, location_id) values ('$teacher', '$loc_x') on conflict do nothing"; }
clear_lessons() { psql_ -c "delete from public.lessons where teacher_id = '$teacher'"; }

remove_x="delete from public.teacher_locations where teacher_id = '$teacher' and location_id = '$loc_x';"
remove_x_as_admin="select public.set_teacher_locations('$teacher', array['$loc_y'::uuid]);"

race "taking away against a new slot" admin "$remove_x_as_admin" db "$slot" "the teacher may not hold lessons at this location"
check "no slot was written at the location that was taken away" "0" "$(lessons_at_x)"
check "and the location is gone" "0" "$(locations_of_teacher)"
give_x_back

race "a new slot against taking away (function)" db "$slot" admin "$remove_x_as_admin" "still has lessons or free slots"
check "the slot is there" "1" "$(lessons_at_x)"
check "and so is the location" "1" "$(locations_of_teacher)"
clear_lessons

race "a new slot against taking away (plain delete)" db "$slot" db "$remove_x" "still has lessons or free slots"
check "the slot is there, again" "1" "$(lessons_at_x)"
check "and so is the location, again" "1" "$(locations_of_teacher)"

if [ "$failures" -ne 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all concurrency checks passed"
