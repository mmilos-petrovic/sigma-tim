-- Teacher CVs. Two independent switches decide who may see one; both start off (opt-in, it is personal data).

create table public.teacher_cv (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null unique references public.teachers (profile_id) on delete cascade,
  -- generated from the teacher's name on insert and never changed: it is the public link /nastavnici/<slug>
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 100),
  about text check (char_length(about) <= 2000),
  photo_path text,
  show_public boolean not null default false,
  show_members boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cv_experience (
  id uuid primary key default gen_random_uuid(),
  cv_id uuid not null references public.teacher_cv (id) on delete cascade,
  employer text not null check (btrim(employer) <> '' and char_length(employer) <= 200),
  position text not null check (btrim(position) <> '' and char_length(position) <= 200),
  period text check (char_length(period) <= 100),
  description text check (char_length(description) <= 1000),
  sort_order integer not null default 0
);
create index cv_experience_cv_id_idx on public.cv_experience (cv_id);

create table public.cv_education (
  id uuid primary key default gen_random_uuid(),
  cv_id uuid not null references public.teacher_cv (id) on delete cascade,
  institution text not null check (btrim(institution) <> '' and char_length(institution) <= 200),
  degree text check (char_length(degree) <= 200),
  period text check (char_length(period) <= 100),
  sort_order integer not null default 0
);
create index cv_education_cv_id_idx on public.cv_education (cv_id);

create table public.cv_skills (
  id uuid primary key default gen_random_uuid(),
  cv_id uuid not null references public.teacher_cv (id) on delete cascade,
  skill text not null check (btrim(skill) <> '' and char_length(skill) <= 100),
  sort_order integer not null default 0
);
create index cv_skills_cv_id_idx on public.cv_skills (cv_id);
