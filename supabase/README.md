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
| `confirm_booking(lesson_id)` / `decline_booking(lesson_id)` | the slot's teacher | answer a `pending` booking; declining frees the slot. Declining after the start is refused (`PT409`, it would leave a free slot in the past); confirming still works, which is how an outcome is recorded for a booking nobody answered |
| `cancel_lesson(lesson_id)` | teacher, participant, parent | before the start only. The teacher cancels the whole lesson. A student or parent removes only their own student(s); the lesson goes on for the others. When the last participant leaves, the lesson is deleted, or a booked slot is freed |
| `find_conflicts(teacher, room, start, end, exclude_lesson)` | teacher, admin | overlaps, as a warning only; times and places, never students |
| `busy_times(from, to)` | teacher, admin | colleagues' busy times (no subject, no students) |
| `change_student_email(student_id, new_email)` | the student's teacher | corrects the email of their own student; the old Google account is cut off at once and the profile is linked to the new address's account if one exists (same rules as `change_profile_email`, which shares its code). Only for a person who is this teacher's and nobody else's: a student who also studies with another teacher, a colleague or admin who is also their student, or a parent of another teacher's child gets `PT409`/`PT403` and goes through the administrator |
| `rename_person(profile_id, first, last)` | teacher | corrects the name of one of their students or of a parent of one. Never an email. The name belongs to the person, so a parent shared with another teacher is renamed for both. Colleagues, admins and the teacher themselves are refused (`PT403`) |
| `remove_parent_from_student(student_id, parent_id)` | the student's teacher, admin | unlinks a parent (the way to fix a wrong parent email: remove, then `add_parent_to_student` with the right one). A parent with no children left loses the parent role; the profile stays |
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

## Notifications

Triggers write to `notifications`, the outbox. Only the service role (the Edge Function) can read it. Cancelled and declined lessons are queued with a snapshot of the lesson (`kind = 'lesson_cancelled'`, `payload.reason` is `cancelled`, `declined` or `teacher_deactivated`), so the notice survives the deletion. A student leaving a lesson that goes on is `kind = 'participant_left'`; its payload names only the student who left, and the remaining participants are not notified. The other events (new lesson, booking, reminders) are added with the Edge Function in the notifications phase.

## Tests

`tests/01_helpers.test.sql` creates a `tests` schema (the only file that commits). Each test file calls `tests.seed_basic()` inside its own transaction, which is rolled back:

- people: `admin`, `boss` (admin and teacher), teachers `ta` `tb` `tc`, students `s1` `s2` (of `ta`), `s3` (of `tb`), `sb` (of `boss`), `su` (unassigned), parents `p1` (of `s1` and `s3`) `p2` `pu`, and `outsider` (a Google account without a profile);
- `tests.login_as('ta')`, `tests.login_anon()` and `tests.logout()` switch the session role and JWT the way the Data API does;
- `tests.affected($$ update ... $$)` counts rows a statement touched under RLS (denied rows are silently skipped, not errors).

Fixture names and emails are prefixed `Test` / `@t.test`, and assertions filter on fixture ids, so the suite does not depend on `seed.sql`.
