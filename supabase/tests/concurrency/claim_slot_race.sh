#!/usr/bin/env bash
# claim_slot() under real concurrency.
#
# pgTAP runs inside one session, so it can only check that a second booking is refused after the first. This script
# opens separate database sessions to check the actual guarantee: the slot row is locked, so simultaneous bookings
# are serialised and exactly one wins.
#
#   1. lock wait: session A books a slot and holds its transaction open; session B must block until A commits and
#      then lose with "slot is already taken".
#   2. race: for several slots, two students book at the same moment; every slot must end up with exactly one winner.
#
# Needs the local stack (`npm run db:start`) and docker. It commits real rows and removes them again on exit.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_sigma-tim}"
SLOTS=12

psql_() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -At -v ON_ERROR_STOP=1 "$@"; }

failures=0
check() { # description, expected, actual
  if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (expected '$2', got '$3')"; failures=$((failures + 1)); fi
}

cleanup() {
  psql_ <<'SQL' >/dev/null
delete from public.lessons where teacher_id in (select id from public.profiles where email like '%@race.test');
delete from public.students where profile_id in (select id from public.profiles where email like '%@race.test');
delete from public.teachers where profile_id in (select id from public.profiles where email like '%@race.test');
delete from public.profiles where email like '%@race.test';
delete from auth.users where email like '%@race.test';
delete from public.subjects where name = 'Race Subject';
delete from public.locations where name = 'Race Location';
SQL
}
trap cleanup EXIT
cleanup

psql_ <<'SQL'
insert into public.subjects (name) values ('Race Subject');
insert into public.locations (name, address) values ('Race Location', 'x');
insert into public.profiles (email, first_name, last_name) values
  ('teacher@race.test', 'Race', 'Teacher'), ('a@race.test', 'Race', 'A'), ('b@race.test', 'Race', 'B');
insert into public.teachers (profile_id) select id from public.profiles where email = 'teacher@race.test';
insert into public.teacher_subjects (teacher_id, subject_id)
  select p.id, s.id from public.profiles p, public.subjects s where p.email = 'teacher@race.test' and s.name = 'Race Subject';
insert into public.students (profile_id, teacher_id)
  select s.id, t.id from public.profiles s, public.profiles t
   where s.email in ('a@race.test', 'b@race.test') and t.email = 'teacher@race.test';
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  select gen_random_uuid(), 'authenticated', 'authenticated', e, now(), '{"provider":"google","providers":["google"]}', '{}', now(), now()
    from unnest(array['a@race.test', 'b@race.test']) as e;
insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin)
  select t.id, s.id, l.id,
         date_trunc('hour', now()) + interval '40 hours' + g * interval '2 hours',
         date_trunc('hour', now()) + interval '41 hours' + g * interval '2 hours', 'open', 'slot'
    from public.profiles t, public.subjects s, public.locations l, generate_series(1, 12) as g
   where t.email = 'teacher@race.test' and s.name = 'Race Subject' and l.name = 'Race Location';
SQL

user_a=$(psql_ -c "select id from auth.users where email = 'a@race.test'")
user_b=$(psql_ -c "select id from auth.users where email = 'b@race.test'")
student_a=$(psql_ -c "select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'a@race.test'")
student_b=$(psql_ -c "select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 'b@race.test'")
slots=($(psql_ -c "select id from public.lessons where status = 'open' and teacher_id = (select id from public.profiles where email = 'teacher@race.test') order by start_at"))

# Books a slot as one student in a transaction that stays open for $4 seconds after the booking.
# Prints "won:<status>" or "lost:<error message>".
claim_as() { # auth user id, student id, lesson id, hold seconds
  local out
  if out=$(psql_ 2>&1 <<SQL
begin;
set local request.jwt.claims = '{"sub":"$1","role":"authenticated"}';
set local role authenticated;
select public.claim_slot('$3', array['$2']::uuid[]);
select pg_sleep($4);
commit;
SQL
  ); then
    echo "won:$(echo "$out" | grep -E '^(confirmed|pending)$' | head -1)"
  else
    echo "lost:$(echo "$out" | grep -o 'slot is already taken' | head -1)"
  fi
}

participants() { psql_ -c "select count(*) from public.lesson_students where lesson_id = '$1'"; }

# 1. lock wait --------------------------------------------------------------------------------------------------
slot=${slots[0]}
result_a=$(mktemp)
claim_as "$user_a" "$student_a" "$slot" 3 >"$result_a" &
pid_a=$!
sleep 1 # A has booked and now holds the row lock

started=$(date +%s)
result_b=$(claim_as "$user_b" "$student_b" "$slot" 0)
waited=$(( $(date +%s) - started ))
wait "$pid_a"

check "first booking wins" "won:confirmed" "$(cat "$result_a")"
check "the second booking loses with 'slot is already taken'" "lost:slot is already taken" "$result_b"
[ "$waited" -ge 1 ] && echo "ok - the second booking waited for the first (${waited}s)" \
  || { echo "not ok - the second booking did not wait for the first lock"; failures=$((failures + 1)); }
check "exactly one participant" "1" "$(participants "$slot")"

# 2. race ---------------------------------------------------------------------------------------------------------
dir=$(mktemp -d)
for i in $(seq 1 $((SLOTS - 1))); do
  claim_as "$user_a" "$student_a" "${slots[$i]}" 0 >"$dir/a$i" &
  claim_as "$user_b" "$student_b" "${slots[$i]}" 0 >"$dir/b$i" &
done
wait

bad=0
for i in $(seq 1 $((SLOTS - 1))); do
  a=$(cat "$dir/a$i"); b=$(cat "$dir/b$i")
  wins=0
  case "$a" in won:*) wins=$((wins + 1)) ;; esac
  case "$b" in won:*) wins=$((wins + 1)) ;; esac
  if [ "$wins" -ne 1 ] || [ "$(participants "${slots[$i]}")" != "1" ]; then
    echo "  slot $i: a=$a b=$b participants=$(participants "${slots[$i]}")"
    bad=$((bad + 1))
  fi
done
check "every one of $((SLOTS - 1)) simultaneous races has exactly one winner" "0" "$bad"

rm -rf "$dir" "$result_a"
if [ "$failures" -ne 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all concurrency checks passed"
