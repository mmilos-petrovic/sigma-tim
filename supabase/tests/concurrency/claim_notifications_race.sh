#!/usr/bin/env bash
# claim_notifications() under real concurrency.
#
# The Edge Function that sends notifications runs every minute, and a run can take longer than that, so two runs can
# overlap. pgTAP cannot show what happens then, because it runs in one session. This script opens separate sessions:
#
#   1. skip locked: session A takes 10 notices and keeps its transaction open; session B, started meanwhile, must not
#      wait for A and must get 10 other notices.
#   2. race: several sessions take notices at the same moment; no notice may be handed out twice, and every notice
#      must in the end have been taken exactly once (one attempt).
#   3. welcome budget: while session A holds the 20 welcome emails of the hour, session B must not be given 20 more.
#
# Needs the local stack (`npm run db:start`) and docker. It commits real rows and removes them again on exit. Notices that
# were already waiting in the local database are pushed far into the future while it runs, so they are left alone.
set -euo pipefail

DB_CONTAINER="${DB_CONTAINER:-supabase_db_sigma-tim}"
NOTICES=40
SESSIONS=6

psql_() { docker exec -i "$DB_CONTAINER" psql -U postgres -X -q -At -v ON_ERROR_STOP=1 "$@"; }

failures=0
check() { # description, expected, actual
  if [ "$2" = "$3" ]; then echo "ok - $1"; else echo "not ok - $1 (expected '$2', got '$3')"; failures=$((failures + 1)); fi
}

cleanup() {
  psql_ <<'SQL' >/dev/null
delete from public.notifications where recipient_id in (select id from public.profiles where email = 'n@race.test');
delete from public.profiles where email = 'n@race.test';
update public.notifications set deliver_after = deliver_after - interval '100 years' where deliver_after > now() + interval '50 years';
SQL
}
trap cleanup EXIT
cleanup

psql_ <<SQL
insert into public.profiles (email, first_name, last_name) values ('n@race.test', 'Race', 'Notice');
-- whatever is waiting already must not be taken by this test
update public.notifications set deliver_after = deliver_after + interval '100 years'
 where sent_at is null and attempts < private.max_notification_attempts();
insert into public.notifications (recipient_id, kind)
  select p.id, 'test' from public.profiles p, generate_series(1, $NOTICES) where p.email = 'n@race.test';
SQL

# Takes up to $1 notices as the service role, holds the transaction open for $2 seconds, prints the ids (comma separated).
claim() { # limit, hold seconds
  psql_ <<SQL | grep -E '^[0-9,]*$' | head -1
begin;
set local role service_role;
select coalesce(string_agg(n ->> 'id', ',' order by (n ->> 'id')::bigint), '')
  from jsonb_array_elements(public.claim_notifications($1) -> 'notices') n;
reset role;
select pg_sleep($2);
commit;
SQL
}

count_of() { echo "$1" | tr ',' '\n' | grep -c . || true; }

# 1. skip locked ----------------------------------------------------------------------------------------------------
result_a=$(mktemp)
claim 10 5 >"$result_a" &
pid_a=$!
sleep 1 # A has taken its notices and holds their locks

started=$(date +%s)
ids_b=$(claim 10 0)
waited=$(( $(date +%s) - started ))
wait "$pid_a"
ids_a=$(cat "$result_a")

check "session A took 10 notices" "10" "$(count_of "$ids_a")"
check "session B took 10 notices while A was still open" "10" "$(count_of "$ids_b")"
check "and none of them is one of A's" "20" "$(echo "$ids_a,$ids_b" | tr ',' '\n' | sort -u | grep -c .)"
[ "$waited" -le 2 ] && echo "ok - session B did not wait for A (${waited}s)" \
  || { echo "not ok - session B waited ${waited}s for A's locks"; failures=$((failures + 1)); }

# 2. race ---------------------------------------------------------------------------------------------------------
dir=$(mktemp -d)
for i in $(seq 1 $SESSIONS); do
  claim 10 0 >"$dir/s$i" &
done
wait

all=$(cat "$dir"/s* | tr ',' '\n' | grep . || true)
total=$(echo "$all" | grep -c . || true)
unique=$(echo "$all" | sort -u | grep -c . || true)
check "nothing was handed out twice in the race" "$total" "$unique"

# what the race left over is taken one run at a time
for _ in 1 2 3 4; do claim 10 0 >/dev/null; done
check "every notice was taken exactly once in the end" "$NOTICES" \
  "$(psql_ -c "select count(*) from public.notifications n join public.profiles p on p.id = n.recipient_id where p.email = 'n@race.test' and n.attempts = 1")"
check "and none of them more than once" "0" \
  "$(psql_ -c "select count(*) from public.notifications n join public.profiles p on p.id = n.recipient_id where p.email = 'n@race.test' and n.attempts <> 1")"

# 3. the welcome budget ---------------------------------------------------------------------------------------------
# Session A takes the 20 welcome emails of the hour and keeps its transaction open; session B asks meanwhile and must be
# given none. (B is held back by A's row locks as well as by the advisory lock the function takes while welcome emails are
# due. The lock is for the moment between B's count of the places and B's choice of rows, in which A could commit: a window
# of microseconds that cannot be provoked from outside. What this does check is that the budget holds when claims overlap.)
psql_ <<SQL
insert into public.notifications (recipient_id, kind)
  select p.id, 'welcome' from public.profiles p, generate_series(1, 60) where p.email = 'n@race.test';
SQL
result_a3=$(mktemp)
claim 100 3 >"$result_a3" &
pid_a3=$!
sleep 1
ids_b3=$(claim 100 0)
wait "$pid_a3"
ids_a3=$(cat "$result_a3")
check "session A took the 20 welcome emails of the hour" "20" "$(count_of "$ids_a3")"
check "and session B, which asked while A was still open, took none" "0" "$(count_of "$ids_b3")"
check "the other 40 are still waiting" "40"   "$(psql_ -c "select count(*) from public.notifications n join public.profiles p on p.id = n.recipient_id where p.email = 'n@race.test' and n.kind = 'welcome' and n.attempts = 0")"

rm -rf "$dir" "$result_a" "$result_a3"
if [ "$failures" -ne 0 ]; then echo "$failures check(s) failed"; exit 1; fi
echo "all concurrency checks passed"
