-- People, roles and the reference data of the school.
--
-- Access rules live in later migrations (access helpers, RLS); this one only defines the shape of the data.
-- Nothing in `public` is reachable through the Data API until a later migration grants it explicitly.

create schema if not exists private;
grant usage on schema private to authenticated;

-- New objects in public start with no privileges for the API roles; every table and function grants what it needs.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon;

create type public.lesson_status as enum ('open', 'pending', 'confirmed');
create type public.lesson_origin as enum ('teacher', 'slot');
create type public.lesson_outcome as enum ('held', 'not_held');
create type public.takeover_status as enum ('pending', 'approved', 'rejected');

-- A pre-approved email, created before the person ever signs in. `user_id` is filled in when they do.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text not null unique,
  first_name text not null,
  last_name text not null,
  avatar_url text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_email_format check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) <= 254),
  constraint profiles_names check (btrim(first_name) <> '' and btrim(last_name) <> '' and char_length(first_name) <= 100 and char_length(last_name) <= 100)
);

create table public.teachers (
  profile_id uuid primary key references public.profiles (id) on delete restrict,
  is_active boolean not null default true,
  bio text check (char_length(bio) <= 2000),
  photo_path text,
  created_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> '' and char_length(name) <= 100),
  created_at timestamptz not null default now()
);

create table public.teacher_subjects (
  teacher_id uuid not null references public.teachers (profile_id) on delete cascade,
  subject_id uuid not null references public.subjects (id) on delete restrict,
  primary key (teacher_id, subject_id)
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (btrim(name) <> '' and char_length(name) <= 100),
  address text not null check (btrim(address) <> '' and char_length(address) <= 300),
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete restrict,
  name text not null check (btrim(name) <> '' and char_length(name) <= 100),
  unique (location_id, name),
  -- lets lessons prove that their room belongs to their location
  unique (id, location_id)
);

create table public.location_photos (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations (id) on delete cascade,
  storage_path text not null,
  position smallint not null check (position between 1 and 3),
  unique (location_id, position)
);

-- One row per (person, teacher) relationship. A person who studies with two teachers has two rows behind one
-- Google account ("one teacher per student" makes that a duplicate record, as the spec accepts).
-- Deactivating a teacher can leave a person with more than one unassigned row; takeover requests sort that out.
create table public.students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete restrict,
  school text check (char_length(school) <= 200),
  grade text check (char_length(grade) <= 50),
  class_section text check (char_length(class_section) <= 50),
  teacher_id uuid references public.teachers (profile_id) on delete restrict,
  created_at timestamptz not null default now()
);
create unique index students_profile_teacher_key on public.students (profile_id, teacher_id) where teacher_id is not null;
create index students_teacher_id_idx on public.students (teacher_id);
create index students_profile_id_idx on public.students (profile_id);

create table public.parents (
  profile_id uuid primary key references public.profiles (id) on delete restrict
);

create table public.parent_students (
  parent_id uuid not null references public.parents (profile_id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  primary key (parent_id, student_id)
);
create index parent_students_student_id_idx on public.parent_students (student_id);
