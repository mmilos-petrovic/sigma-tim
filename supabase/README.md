# Database

Postgres schema, access rules (RLS) and booking logic for the school. All authorization lives here; the client is not trusted.

## Running

```
npm run db:start              # local stack in Docker
npm run db:reset              # re-apply migrations and seed.sql
npm run db:test               # pgTAP suite
npm run db:test:concurrency   # real parallel sessions against claim_slot() (needs bash and docker)
```

`seed.sql` is development data only (and the first admin, `petrovicmilos@gmail.com`, who is also a teacher). Nobody can sign in locally with the seeded people: there is no Google account behind them.

## First administrator on staging and production

`seed.sql` never reaches the hosted projects, so the first admin (`petrovicmilos@gmail.com`, also a teacher, with the four starting subjects) is created by `bootstrap/first-admin.sql`. Run it with the manual **Bootstrap admin** workflow (Actions tab; the workflow has to be on `main`):

1. Run with `dry_run` on. It prints `bootstrap/first-admin.check.sql`: which parts exist, whether a Google account with that email exists, whether the profile is linked.
2. Run with `dry_run` off. Production waits for the required reviewer, like the migrations. It prints the state again.
3. Sign in once with Google. `linked` becomes true. If the person signed in before the script ran, the script links them itself.

The script is idempotent: it never deletes or renames anything, and it only creates the starting subjects while the school has none. It links the project and then runs `supabase db query --linked`, with the same secrets as the migrations (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`). The very first dry run on staging is also what proves that this works from a GitHub runner.

## How access works

- A person exists in the database **before** they sign in: `create_teacher`, `add_student` and `add_parent_to_student` create a `profiles` row for the email. When that email signs in with Google, the profile is linked to the account (`profiles.user_id`). Only a confirmed Google sign-in can claim a profile.
- Linking runs when an auth user is inserted **and** when it is updated (provider or email confirmation set afterwards, as GoTrue's admin API does). Only a confirmed Google account is linked.
- A Google account without a profile sees nothing at all (the client shows "you are not a member yet").
- Roles are rows, not flags: `teachers`, `students`, `parents` (and `profiles.is_admin`). One account can hold several. A person who studies with two teachers has two `students` rows.
- The Data API roles get **no** privileges by default. Each table grants only the operations and columns it needs (`migrations/*_rls_and_grants.sql`), and policies filter rows. `anon` has no table access; it can only call `list_public_cvs()` and `get_public_cv()`.
- Identity, status and booking changes only happen through the functions below. Plain inserts and updates are limited to what a user may edit directly (own name, a teacher's lessons and bio, notes, CV, push subscriptions).
- Helper functions used by policies live in schema `private`, which the Data API does not expose.

## Functions the client calls

| Function | Who | What |
| --- | --- | --- |
| `create_teacher(email, first, last, subject_ids)` | admin | pre-approve a teacher |
| `add_student(email, first, last, school, grade, section, teacher_id)` | teacher, admin | pre-approve a student (admin may pick the teacher or leave them unassigned) |
| `add_parent_to_student(student_id, email, first, last)` | the student's teacher, admin | link a parent by email (max 2 per student); an existing parent is reused |
| `schedule_lesson(subject, location, room, start, end, student_ids)` | teacher | confirmed lesson for their own students |
| `claim_slot(lesson_id, student_ids)` | student, parent | book a free slot; atomic, first one wins; returns `confirmed` or `pending` (less than 12 h ahead) |
| `confirm_booking(lesson_id)` / `decline_booking(lesson_id)` | the slot's teacher | answer a `pending` booking; declining frees the slot |
| `cancel_lesson(lesson_id)` | teacher, participant, parent | before the start only. The teacher cancels the whole lesson. A student or parent removes only their own student(s); the lesson goes on for the others. When the last participant leaves, the lesson is deleted, or a booked slot is freed |
| `find_conflicts(teacher, room, start, end, exclude_lesson)` | teacher, admin | overlaps, as a warning only; times and places, never students |
| `busy_times(from, to)` | teacher, admin | colleagues' busy times (no subject, no students) |
| `request_takeover(student_id)` | teacher | ask for an unassigned student |
| `approve_takeover(id)` / `reject_takeover(id)` | admin | approving closes competing requests |
| `deactivate_teacher(teacher_id)` | admin | deletes future lessons (participants are notified), unassigns students |
| `list_public_cvs()` / `get_public_cv(slug)` | anyone | CVs with the public switch on |
| `list_member_cvs()` / `get_member_cv(slug)` | signed-in members | CVs with the members switch on |
| `max_lesson_students()` | signed in | the participant limit (4) |
| `my_roles()` | signed in | the caller's profile and role flags (`is_admin`, `is_teacher`, `is_student`, `is_parent`). No row: a Google account without a profile. All flags false: an approved profile with no role in force (a deactivated teacher). Decides the screen after sign-in only; RLS still filters every query |

### Errors

Errors use PostgREST's custom codes, so they arrive as HTTP statuses. The message is for developers; the client shows its own Serbian text per code and function.

| Code | HTTP | Meaning |
| --- | --- | --- |
| `PT400` | 400 | invalid request |
| `PT403` | 403 | not allowed |
| `PT404` | 404 | not found |
| `PT409` | 409 | conflict, for example `slot is already taken`, `lesson already started` |

Table constraint violations keep their Postgres codes (`23514` check, `23503` foreign key, `23505` unique).

## Notifications

Triggers write to `notifications`, the outbox. Only the service role (the Edge Function) can read it. Cancelled and declined lessons are queued with a snapshot of the lesson (`kind = 'lesson_cancelled'`, `payload.reason` is `cancelled`, `declined` or `teacher_deactivated`), so the notice survives the deletion. A student leaving a lesson that goes on is `kind = 'participant_left'`; its payload names only the student who left, and the remaining participants are not notified. The other events (new lesson, booking, reminders) are added with the Edge Function in the notifications phase.

## Tests

`tests/01_helpers.test.sql` creates a `tests` schema (the only file that commits). Each test file calls `tests.seed_basic()` inside its own transaction, which is rolled back:

- people: `admin`, `boss` (admin and teacher), teachers `ta` `tb` `tc`, students `s1` `s2` (of `ta`), `s3` (of `tb`), `sb` (of `boss`), `su` (unassigned), parents `p1` (of `s1` and `s3`) `p2` `pu`, and `outsider` (a Google account without a profile);
- `tests.login_as('ta')`, `tests.login_anon()` and `tests.logout()` switch the session role and JWT the way the Data API does;
- `tests.affected($$ update ... $$)` counts rows a statement touched under RLS (denied rows are silently skipped, not errors).

Fixture names and emails are prefixed `Test` / `@t.test`, and assertions filter on fixture ids, so the suite does not depend on `seed.sql`.
