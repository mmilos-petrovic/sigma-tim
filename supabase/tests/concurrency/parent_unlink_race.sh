#!/usr/bin/env bash
# remove_parent_from_student() against a parent who is being linked to another child at the same moment.
#
# Removing a parent's last link also removes their `parents` row, and that row cascades to every link. Without a lock,
# a link added by somebody else in the meantime would be deleted together with it. pgTAP runs in one session and cannot
# see this, so this script uses two:
#
#   A: the teacher adds the parent to student 2 and keeps the transaction open for a few seconds.
#   B: the teacher unlinks the parent from student 1 (the parent's only committed link). B must wait for A, then see the
#      new link and leave the parent role alone.
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
delete from public.students where profile_id in (select id from public.profiles where email like '%@unlink.test');
delete from public.parents where profile_id in (select id from public.profiles where email like '%@unlink.test');
delete from public.teachers where profile_id in (select id from public.profiles where email like '%@unlink.test');
delete from public.profiles where email like '%@unlink.test';
delete from auth.users where email like '%@unlink.test';
SQL
}
trap cleanup EXIT
cleanup

psql_ <<'SQL'
insert into public.profiles (email, first_name, last_name) values
  ('teacher@unlink.test', 'Unlink', 'Teacher'), ('s1@unlink.test', 'Unlink', 'S1'),
  ('s2@unlink.test', 'Unlink', 'S2'), ('parent@unlink.test', 'Unlink', 'Parent');
insert into public.teachers (profile_id) select id from public.profiles where email = 'teacher@unlink.test';
insert into public.students (profile_id, teacher_id)
  select s.id, t.id from public.profiles s, public.profiles t
   where s.email in ('s1@unlink.test', 's2@unlink.test') and t.email = 'teacher@unlink.test';
insert into public.parents (profile_id) select id from public.profiles where email = 'parent@unlink.test';
insert into public.parent_students (parent_id, student_id)
  select p.id, s.id from public.profiles p, public.students s join public.profiles sp on sp.id = s.profile_id
   where p.email = 'parent@unlink.test' and sp.email = 's1@unlink.test';
-- signing in links the account to the profile of the same email
insert into auth.users (id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (gen_random_uuid(), 'authenticated', 'authenticated', 'teacher@unlink.test', now(), '{"provider":"google","providers":["google"]}', '{}', now(), now());
SQL

teacher_user=$(psql_ -c "select id from auth.users where email = 'teacher@unlink.test'")
student_1=$(psql_ -c "select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 's1@unlink.test'")
student_2=$(psql_ -c "select s.id from public.students s join public.profiles p on p.id = s.profile_id where p.email = 's2@unlink.test'")
parent=$(psql_ -c "select id from public.profiles where email = 'parent@unlink.test'")

as_teacher() { # a statement, run in the teacher's session, followed by $2 seconds with the transaction still open
  psql_ 2>&1 <<SQL
begin;
set local request.jwt.claims = '{"sub":"$teacher_user","role":"authenticated"}';
set local role authenticated;
$1
select pg_sleep($2);
commit;
SQL
}

link_out=$(mktemp)
as_teacher "select public.add_parent_to_student('$student_2', 'parent@unlink.test', 'Unlink', 'Parent');" 3 >"$link_out" &
pid_a=$!
sleep 1 # A has added the link and holds its transaction open

started=$(date +%s)
as_teacher "select public.remove_parent_from_student('$student_1', '$parent');" 0 >/dev/null
waited=$(( $(date +%s) - started ))
wait "$pid_a"

[ "$waited" -ge 1 ] && echo "ok - the unlink waited for the link being added (${waited}s)" \
  || { echo "not ok - the unlink did not wait"; failures=$((failures + 1)); }
check "the parent is linked to the second student only" "$student_2" \
  "$(psql_ -c "select string_agg(student_id::text, ',') from public.parent_students where parent_id = '$parent'")"
check "and keeps the parent role" "1" "$(psql_ -c "select count(*) from public.parents where profile_id = '$parent'")"

rm -f "$link_out"
if [ "$failures" -ne 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all concurrency checks passed"
