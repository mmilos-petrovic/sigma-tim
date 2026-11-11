# Database

Postgres schema, access rules (RLS) and booking logic for the school. All authorization lives here; the client is not trusted.

## Running

```
npm run db:start              # local stack in Docker
npm run db:reset              # re-apply migrations and seed.sql
npm run db:test               # pgTAP suite
npm run db:test:concurrency   # real parallel sessions against claim_slot(), remove_parent_from_student(), erase_teacher() (also against setting a phone number) and taking a location away (needs bash and docker)
```

`seed.sql` is development data only (and the first admin, `petrovicmilos@gmail.com`, who is also a teacher). There is no Google account behind the seeded people, so `npm run dev:setup` (also run by `npm run dev` and `npm run db:reset`) creates local auth users for the test accounts listed in `web/src/dev/personas.ts` (admin, admin and teacher, teacher, student, parent, and a stranger without a profile). They get a random password that is written to `web/.env.local`; the app's development sign-in panel uses it. The users are made like a Google sign-in (provider `google`, confirmed email), so the real linking trigger attaches them to their profiles. This exists only locally: hosted projects have the email provider switched off and never run the script.

## First administrator on staging and production

`seed.sql` never reaches the hosted projects, so the first admin (`petrovicmilos@gmail.com`, also a teacher, with the four starting subjects) is created by `bootstrap/first-admin.sql`. Run it with the manual **Bootstrap admin** workflow (Actions tab; the workflow has to be on `main`):

1. Run with `dry_run` on. It prints `bootstrap/first-admin.check.sql`: which parts exist, whether a Google account with that email exists, whether the profile is linked.
2. Run with `dry_run` off. Production waits for the required reviewer, like the migrations. It prints the state again.
3. Sign in once with Google. `linked` becomes true. If the person signed in before the script ran, the profile is linked the moment the script creates it; a profile that already exists is linked by the sign-in itself.

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
| `create_teacher(email, first, last, subject_ids, location_ids, phone)` | admin | pre-approve a teacher with their subjects, the locations where they may teach (at least one of each) and a phone number (required) |
| `set_teacher_locations(teacher_id, location_ids)` | admin | replaces the locations where a teacher may hold lessons (at least one). Refused with `PT409` while the teacher has a lesson or free slot that has not ended yet at a location that would go; the error `detail` is JSON, `{"total": n, "lessons": [{id, location_id, start_at, end_at, status}]}` with the first twenty, never who attends. Nothing is changed then |
| `add_student(email, first, last, school, grade, section, teacher_id, phone)` | teacher, admin | pre-approve a student (admin may pick the teacher or leave them unassigned). The phone number is optional; an empty one counts as none, one that is not a number is refused |
| `add_parent_to_student(student_id, email, first, last, phone)` | the student's teacher, admin | link a parent by email (max 2 per student); an existing parent is reused. The phone number is required |
| `set_person_phone(profile_id, phone)` | admin, the person, the teacher of the student (or of the student of whom this is a parent) | sets a phone number (see Phone numbers); an empty one takes it away, which is refused for teachers and parents (`PT409`) |
| `schedule_lesson(subject, location, room, start, end, student_ids)` | teacher | confirmed lesson for their own students. It may start earlier today (to enter a lesson afterwards), not on a day that has passed (`PT400`) |
| `set_lesson_students(lesson_id, student_ids)` | the lesson's teacher | replaces the participants of a confirmed lesson: 1 to 4 of the teacher's own students; students who stay keep their notes. Not subject to the day lock. `PT409` for a free slot or a pending booking |
| `claim_slot(lesson_id, student_ids)` | student, parent | book a free slot; atomic, first one wins; returns `confirmed` or `pending` (less than 12 h ahead) |
| `confirm_booking(lesson_id)` / `decline_booking(lesson_id, note)` | the slot's teacher | answer a `pending` booking; declining frees the slot (the optional `note` is a reason, see Reasons for cancelling). Declining after the start is refused (`PT409`, it would leave a free slot in the past); confirming still works, which is how an outcome is recorded for a booking nobody answered |
| `cancel_lesson(lesson_id, note)` | teacher, participant, parent | before the start only; `note` is an optional reason (see Reasons for cancelling). The teacher cancels the whole lesson. A student or parent removes only their own student(s); the lesson goes on for the others. When the last participant leaves, the lesson is deleted, or a booked slot is freed |
| `find_conflicts(teacher, room, start, end, exclude_lesson)` | teacher, admin | overlaps, as a warning only; times and places, never students |
| `busy_times(from, to)` | teacher, admin | colleagues' busy times (no subject, no students) |
| `change_student_email(student_id, new_email)` | the student's teacher | corrects the email of their own student; the old Google account is cut off at once and the profile is linked to the new address's account if one exists (same rules as `change_profile_email`, which shares its code). Only for a person who is this teacher's and nobody else's: a student who also studies with another teacher, a colleague or admin who is also their student, or a parent of another teacher's child gets `PT409`/`PT403` and goes through the administrator |
| `rename_person(profile_id, first, last)` | teacher | corrects the name of one of their students or of a parent of one. Never an email. The name belongs to the person, so a parent shared with another teacher is renamed for both. Colleagues, admins and the teacher themselves are refused (`PT403`) |
| `remove_parent_from_student(student_id, parent_id)` | the student's teacher, admin | unlinks a parent (the way to fix a wrong parent email: remove, then `add_parent_to_student` with the right one). A parent with no children left loses the parent role; the profile stays |
| `set_lesson_paid(lesson_id, student_id, paid)` | the lesson's teacher | marks that one student has paid for the lesson (`lesson_students.paid_at`), or takes the mark back. Any lesson that has the student on it, past or still to come, a booking that waits included; marking twice keeps the first moment. `PT404` for a lesson or a student who is not on it, `PT400` for no answer |
| `delete_student(student_id)` | the student's teacher, admin (any student, also one nobody teaches) | deletes one student record, see Deleting a student |
| `student_lesson_counts()` | teacher, admin | per student the caller may delete (all for an admin, the teacher's own for a teacher): `held_lessons` (outcome held) and `upcoming_lessons` (starting later, booked or waiting) |
| `admin_list_students()` | admin | one row per student record, the one added last first: person, `created_at`, teacher, parent names, the locations of the record's lessons, and the two counts above |
| `get_notification_settings()` / `set_notification_settings(quiet_hours_enabled, quiet_start, quiet_end, reminder_enabled, reminder_minutes, welcome_text, school_contact)` | admin | the notification settings (see Notifications): quiet hours, reminder time (5 to 720 minutes), welcome text (1000 characters), school contact details (500), and the list of kinds |
| `set_email_fallback(kind, enabled)` | admin | whether a kind of notice falls back to email; `PT409` for the welcome and the test, which are always emailed |
| `admin_list_notifications(limit, before, state)` / `admin_resend_notification(id)` / `admin_send_test_notification()` | admin | the log of queued notices with a state (`sent`, `waiting`, `queued`, `retrying`, `failed`), sending a failed one again, and a test notice to oneself |
| `request_takeover(student_id)` | teacher | ask for an unassigned student |
| `approve_takeover(id)` / `reject_takeover(id)` | admin | approving closes competing requests |
| `deactivate_teacher(teacher_id)` | admin | deletes future lessons (participants are notified), unassigns students |
| `reactivate_teacher(teacher_id)` | admin | makes the teacher active again. Deleted lessons do not return and released students stay unassigned: the teacher asks for them with `request_takeover` and the admin approves |
| `erase_teacher(teacher_id)` | admin | erases a teacher's whole profile: the teacher role with CV and subjects, the same person's student and parent roles, devices and waiting notices. Lessons still to come are cancelled (participants notified) and students become unassigned, as in deactivation; a student role also leaves the future lessons it attended (a free slot they had booked becomes free again). Lessons that already started are never deleted: when the teacher has one, the profile stays as an inactive record (`erased_at` set, name kept, email replaced by a placeholder so the address is free) and the function returns `kept_history`; otherwise everything is deleted and it returns `deleted`. The Google account itself is left alone and becomes an unknown account. An erased person cannot be reactivated or get a new email (`PT409`), and an administrator cannot be erased (`PT409`) |
| `change_profile_email(profile_id, new_email)` | admin | corrects a person's email. Everything on the profile stays; the old Google account is cut off at once (it becomes an unknown account) and the profile is linked to the new address's Google account if one exists, otherwise at its first sign-in. Not for the admin's own profile; `PT409` if another profile has the address |
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

## Who reads a teacher's name

A student, and a parent through their children, reads the profile (the name) of the current teacher **and of every teacher the student has a lesson with**, past or still to come (`private.can_see_profile`). So after a takeover or a deactivation the lessons list can still say who taught an old lesson. Only a lesson the student takes part in counts: a free slot never does, and cancelling a lesson (or being the last to leave it) ends the link when no other lesson with that teacher remains. Only the profile opens up: the `teachers` row, the phone number (`person_phones`: current teacher only) and the classmates stay hidden.

## Teacher locations and colour

- **Locations are a hard rule.** `teacher_locations` says where each teacher may teach. A lesson or free slot can only be created at one of those locations, and its teacher or location can only change to one (`PT400`); any other edit of a lesson, such as its outcome, is not checked, so a lesson at a location that was taken away later (it was over by then) stays editable. The rows are written only by `create_teacher` and `set_teacher_locations`; a teacher reads their own rows, the administrator all.
- **Taking a location away** is refused while the teacher has a lesson, booking or free slot there that has not ended (one that is going on counts). Lessons that are over never block it. The rule is a trigger on the table, so it holds for every writer; `set_teacher_locations` checks first only to list the lessons of all the locations at once. Lessons being written and a location being removed at the same moment are serialised by a row lock (`location_removal_race.sh`).
- **At least one location** for every teacher, deactivated ones too, so reactivating is always safe; the record of an erased teacher is exempt. Deleting a location removes it from the teachers who may use it, unless that would leave a teacher without any (`PT409`); a location with lessons or rooms is refused by those foreign keys as before. A location created later is not given to existing teachers: the administrator chooses.
- **Colour.** `teachers.color` is one of twelve names (`red`, `orange`, `brown`, `olive`, `green`, `teal`, `blue`, `indigo`, `purple`, `magenta`, `wine`, `slate`) or null (no choice: the calendar keeps its default colours). The app decides the shades. A teacher updates only their own row; everybody who can read a teacher reads the colour. Because it belongs to the teacher, it applies to all their lessons, past and future.
- The first administrator's bootstrap script gives them every existing location, but only while they have none.

## Phone numbers

- **Required for teachers and parents, optional for students**, from any country. A number is kept in the international form: `+` and 7 to 15 digits, the first not 0. `private.normalize_phone` turns what a person types (`+381 64 123-4567`, `00381641234567`, `+1 (415) 555-2671`) into it and refuses the rest (`PT400`, `invalid phone number`); a number without `+` or `00` is refused, because the country cannot be guessed.
- **Where it lives.** `person_phones` (one row per profile), not a column of `profiles`, so that who reads a number is decided per number. Nobody writes it directly. The Edge Function that sends notifications reads it as the service role.
- **Who reads whose** (policy `person_phones_select`): the administrator every number; a person their own; a teacher the numbers of their own students and those students' parents (not colleagues', not those of students nobody teaches); a student and a parent the number of their teacher; a parent also their children's.
- **Who sets whose** (`set_person_phone`): the administrator anybody's; a person their own; a teacher the number of a student of theirs or of a parent of one (a parent shared by two teachers is changed by either: it is one number). Nothing is set for an erased person (`PT409`).
- **Taking a number away** (an empty number) is only for people who need none, i.e. a student: a teacher, also a deactivated one, and a parent keep theirs (`PT409`).
- **Adding a person again does not change their number**, like their name: `create_teacher`, `add_parent_to_student` and `add_student` store the number only when the person has none; `set_person_phone` is the way to change it.
- **Erasing** a person (`erased_at` set, by `erase_teacher` or any later flow) deletes the number through a trigger; deleting the profile deletes it by cascade.
- **Existing teachers and parents** (from before this was a rule) have no number. The database cannot require it of them; the app asks for it. The first administrator's bootstrap does not set one either (`first-admin.check.sql` shows `has_phone`).
- `create_teacher` and `add_parent_to_student` exist only with the number (the older versions were dropped); `add_student` takes it as a last, optional argument.

## Editing lessons

A teacher edits their own lessons directly (`update` on `lessons`: subject, location, room, time, outcome) and their notes (`update` on `lesson_students.note`). The rules that apply, all in the database:

- **The day lock.** Subject, location, room and time can be changed until 23:59 of the day the lesson was held, by the **Europe/Belgrade** calendar day of its start. After that, and as soon as an outcome is recorded, they are frozen (`PT409`). Participants, notes and the outcome stay editable. To correct a lesson that has an outcome, clear the outcome first.
- **Never into a passed day.** A lesson cannot be moved to a day before today (`PT400`).
- **Deleting is different.** A lesson that has started can no longer be deleted or cancelled, even within its day; it can only be moved.
- **Free slots** can only be published or moved into the future (a row-level-security check, `42501`). An expired slot is left alone.
- Changing who attends goes through `set_lesson_students`; there is no direct write on `lesson_students` other than the note.

## Storage

One private bucket, `location-photos` (JPEG or WebP, at most 2 MiB per file; the Storage API enforces both). Only approved members read it (through signed links), only the admin writes. Objects are named `<location id>/<file>` and `public.location_photos` keeps the order (1 to 3 per location). Storage refuses a direct `DELETE` from SQL, and deleting a location does not remove its files, so the app deletes the files through the Storage API right after it deletes the location row (in that order: if rooms or lessons still use the location, the delete is refused and nothing is lost; if removing the files fails afterwards, they are only orphans, which the app logs).

## Paid, reasons for cancelling, deleting a student

**Paid.** `lesson_students.paid_at` is set by `set_lesson_paid` only (the table grant still lets a teacher update `note` and nothing else). The student and a parent read it on their own row, like the note.

**Reasons for cancelling.** `cancel_lesson` (a teacher cancelling, a student or parent cancelling or leaving a group lesson) and `decline_booking` take an optional reason of up to 200 characters; blank means none, longer is refused with `PT400` before anything changes. It is kept nowhere but in the queued notice, as `payload.note` (`reason` already means `cancelled`, `declined` or `teacher_deactivated`). A deletion reaches the notice trigger through `app.cancel_note`, which `cancel_lesson` sets and clears like `app.cancel_reason`. Cancelling by deactivation or by a plain `delete` on the table carries no note.

**Deleting a student.** `delete_student` removes one student record (a person with one teacher), only while it has no lesson with outcome `held`; with one, nothing is deleted and the answer is `PT409`, also for the administrator. A student nobody teaches is the administrator's. In one transaction:
- lessons still to come leave the way a student does: a group lesson goes on for the others, a lesson of the teacher's own is cancelled, a booked free slot is free again (the others are told; the person who deletes is not);
- lessons that already started and have nobody else on them are deleted (not held, not recorded, or a booking nobody answered), so no empty block is left; with somebody else on them they stay without the student. This is the only way a lesson that started can go: it needs `app.deleting_student`, which only this function sets, and it never lets a held lesson go;
- the person's profile is deleted when no role is left (not a teacher, an administrator, another student record or a parent), so the email is free again; a parent loses the parent role when no child is left, and the profile too when nothing else is left. The Google account itself stays. Notices queued for deleted profiles go with them;
- a request by somebody who is not an administrator or an active teacher gets `PT403` before anything is looked up, so nobody learns which students exist.

A parent's request to erase their child's data (for the law on personal data) is not served by this: it is a manual administrator procedure, left to the legal review.

## Notifications

Triggers (and one scheduled job) write to `notifications`, the outbox; the Edge Function that sends it (Phase 6c) only reads it. Nobody but the service role can read or write the outbox, the settings or the kinds table.

| `kind` | When | Who is told (never the person acting) |
| --- | --- | --- |
| `lesson_scheduled` | participants are added to a confirmed lesson that has not started (the teacher schedules it, or adds somebody later; only the added students) | those students and their parents |
| `slot_claimed` | a free slot is booked; `payload.status` is `confirmed` or `pending` (booked less than 12 h ahead) | the teacher |
| `booking_confirmed` | a booking becomes confirmed, at once or when the teacher answers; not after the lesson started | the students and their parents |
| `lesson_moved` | the **start** or the **location** of a booked lesson that has not started changes (room, end, subject, note do not count); `payload.old_start_at`, `old_end_at`, `old_location` | participants, parents, teacher |
| `lesson_cancelled`, `participant_left` | see Reasons for cancelling; declining a late booking is `lesson_cancelled` with reason `declined` | as before |
| `lesson_reminder` | `enqueue_due_reminders()`, run every minute by pg_cron: a confirmed lesson with an unrecorded outcome that starts within `reminder_minutes` (60) and has been in place at least that long (`lessons.settled_at`: set when created, when its start changes and when it becomes confirmed, so a booking or move closer than that gets no reminder). One per person, lesson and start time | participants, parents, teacher |
| `welcome` | `upsert_profile` creates a profile, i.e. somebody new is added as a teacher, student or parent (a person who already exists is not welcomed again) | that person |
| `welcome_push` | the first push subscription of somebody who has a `welcome` | that person |
| `test` | the administrator's test button | the administrator |

Every notice except the welcome and the test names only what the recipient may know: a student or a parent reads `payload.students` with their own student(s), the teacher with all of them. `payload.actor` is who did it. `notifications.kind` must be a row of `notification_kinds`, which says whether the notice falls back to email when the person has no push subscription (`email_fallback`; the administrator can switch it per kind, except where `always_email`: welcome, test) and whether the quiet hours leave it alone (`ignores_quiet_hours`: reminder, welcome, welcome push, test).

**Quiet hours** are one window in `notification_settings`, in the school's time zone (it may cross midnight). A notice written inside the window gets `deliver_after` = the end of the window (`private.quiet_hours_end`); the sender takes only rows with `deliver_after <= now()`. **Failures:** the sender counts `attempts`, writes `last_error` and, when it succeeds, `sent_at` and `channel` (`push` or `email`). After `private.max_notification_attempts()` (5) attempts a notice shows as `failed` until the administrator sends it again.

pg_cron is switched on by the migration where the database has it (Supabase does); elsewhere the job is simply not scheduled and `select private.enqueue_due_reminders()` can be called by hand.

The administrator's settings page uses `get_notification_settings()`, `set_notification_settings(...)`, `set_email_fallback(kind, enabled)`, `admin_list_notifications(limit, before, state)` (newest first; the notice itself is not shown, only who and when and what went wrong), `admin_resend_notification(id)` (failed notices only) and `admin_send_test_notification()`. All are administrator-only (`PT403`).

### Sending (Phase 6c)

A pg_cron job `send-notifications` runs every minute and calls `private.invoke_send_notifications()`, which POSTs to the Edge Function `send-notifications` (`supabase/functions/send-notifications/`) through pg_net with the header `x-cron-secret`. The address and the secret are read from the Vault, two secrets set once per project by hand; until both exist the call does nothing, so CI and a fresh local database are fine:

```sql
select vault.create_secret('https://<project ref>.supabase.co/functions/v1/send-notifications', 'notifications_function_url');
select vault.create_secret('<the same value as the function secret CRON_SECRET>', 'notifications_cron_secret');
```

The function talks to the database only through these service-role functions (nobody else can execute them):

- `claim_notifications(limit)` returns, as one jsonb, the settings it needs (welcome text, school contact), how many emails went out today (school time), when a notice held back by the email limit may go again, and the due notices with their recipient (roles, `teaches_lesson`), the rules of their kind and the recipient's devices. A notice is due when `sent_at` is null, `attempts < 5` and `deliver_after <= now()`. **Claiming is the lease:** it counts an attempt and moves `deliver_after` forward by `private.notification_retry_delay(attempt)` (1, 5, 15 minutes, then an hour), and it uses `for update skip locked`. Two overlapping runs therefore never send the same notice, and a run that dies halfway only delays its notices (`supabase/tests/concurrency/claim_notifications_race.sh`).
- `complete_notification(id, channel)`, `fail_notification(id, error, give_up)` (`give_up` sets the attempts to the maximum, so the log shows `failed` at once), `defer_notification(id, until, reason)` (holds a notice back without counting the attempt) and `forget_push_subscriptions(ids)` (devices the push service reports as gone). All but the last leave a notice that is already sent alone.

The log's states: `sent`; `failed` (attempts used up); `retrying` (taken at least once and not sent: being tried, or waiting for its next try); `waiting` (held before any attempt: quiet hours, or the daily email limit); `queued`.

What the function does with a notice (`process.ts`; the words are in `messages.ts`):

1. Push to every device of the recipient. A device the push service answers 404 or 410 to, or whose keys cannot work, is forgotten; one it cannot reach is a failure to try again.
2. Done if one device took it (`channel` = `push`). A kind with `always_email` (welcome, test) is also an email, and is done when the email goes out (or the push did).
3. Otherwise, if the kind has `email_fallback`, the email goes out when there is no working device, or on the last attempt of a push that kept failing; before that a failed push is simply tried again. A kind without it (the reminder) is given up at once when there is no device, and shows as `failed` with the reason.
4. Non-urgent emails stop at 200 a day (`EMAIL_DAILY_LIMIT`, counted from `channel = 'email'` since midnight in school time) and wait for the next morning; welcome and test ignore that limit, and Brevo's own 402 or 429 holds everything until tomorrow too.
5. A reminder that gets its turn after the lesson began is dropped (`failed`, "Čas je već počeo").

Secrets of the function (set in Supabase, see `docs/deployment.md`): `CRON_SECRET`, `APP_URL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `BREVO_API_KEY`, optionally `VAPID_SUBJECT` (default `mailto:noreply@sigmatim.com`), `EMAIL_FROM`, `EMAIL_FROM_NAME`, `EMAIL_DAILY_LIMIT`. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase. Run it locally with `npx supabase functions serve --env-file <file>`; its unit tests are in `web/src/edge/` (the code under `supabase/functions` has no imports of its own except `index.ts`, so they run under Vitest).

## Tests

`tests/01_helpers.test.sql` creates a `tests` schema (the only file that commits). Each test file calls `tests.seed_basic()` inside its own transaction, which is rolled back:

- people: `admin`, `boss` (admin and teacher), teachers `ta` `tb` `tc`, students `s1` `s2` (of `ta`), `s3` (of `tb`), `sb` (of `boss`), `su` (unassigned), parents `p1` (of `s1` and `s3`) `p2` `pu`, and `outsider` (a Google account without a profile);
- `tests.login_as('ta')`, `tests.login_anon()` and `tests.logout()` switch the session role and JWT the way the Data API does;
- `tests.affected($$ update ... $$)` counts rows a statement touched under RLS (denied rows are silently skipped, not errors).

Fixture names and emails are prefixed `Test` / `@t.test`, and assertions filter on fixture ids, so the suite does not depend on `seed.sql`.
