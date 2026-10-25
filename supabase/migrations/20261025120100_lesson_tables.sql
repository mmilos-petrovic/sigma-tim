-- Lessons and free slots (one table), participants, takeover requests, push subscriptions and the notification outbox.

-- A free slot is a lesson without participants:
--   open       free slot, nobody booked it
--   pending    booked less than 12 hours ahead, waits for the teacher
--   confirmed  scheduled by the teacher, or a booking that is settled
-- `origin = 'slot'` lessons fall back to `open` when the booking is cancelled or declined.
create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.teachers (profile_id) on delete restrict,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  location_id uuid not null references public.locations (id) on delete restrict,
  room_id uuid,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.lesson_status not null,
  origin public.lesson_origin not null,
  outcome public.lesson_outcome,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  -- MATCH SIMPLE: ignored while room_id is null
  constraint lessons_room_in_location foreign key (room_id, location_id) references public.rooms (id, location_id),
  constraint lessons_end_after_start check (end_at > start_at),
  constraint lessons_time_grid check (extract(epoch from start_at)::bigint % 900 = 0 and extract(epoch from end_at)::bigint % 900 = 0),
  constraint lessons_slot_length check (origin <> 'slot' or end_at - start_at in (interval '45 minutes', interval '60 minutes')),
  constraint lessons_open_is_slot check (status <> 'open' or origin = 'slot'),
  constraint lessons_pending_is_slot check (status <> 'pending' or origin = 'slot'),
  constraint lessons_outcome_needs_confirmed check (outcome is null or status = 'confirmed'),
  constraint lessons_confirmed_at_matches_status check ((status = 'confirmed') = (confirmed_at is not null))
);
create index lessons_teacher_start_idx on public.lessons (teacher_id, start_at);
create index lessons_room_start_idx on public.lessons (room_id, start_at) where room_id is not null;
create index lessons_start_idx on public.lessons (start_at);

create table public.lesson_students (
  lesson_id uuid not null references public.lessons (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  note text check (char_length(note) <= 2000),
  created_at timestamptz not null default now(),
  primary key (lesson_id, student_id)
);
create index lesson_students_student_id_idx on public.lesson_students (student_id);

create table public.takeover_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  teacher_id uuid not null references public.teachers (profile_id) on delete cascade,
  status public.takeover_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  constraint takeover_resolved_matches_status check ((status = 'pending') = (resolved_at is null))
);
create unique index takeover_one_pending_per_teacher on public.takeover_requests (student_id, teacher_id) where status = 'pending';
create index takeover_requests_teacher_id_idx on public.takeover_requests (teacher_id);

-- One row per device.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_id_idx on public.push_subscriptions (profile_id);

-- Outbox: triggers and scheduled jobs write here, the Edge Function sends. Only the service role touches it.
-- `payload` is a snapshot, so a notice about a deleted lesson stays readable.
create table public.notifications (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  attempts integer not null default 0,
  last_error text
);
create index notifications_unsent_idx on public.notifications (created_at) where sent_at is null;
