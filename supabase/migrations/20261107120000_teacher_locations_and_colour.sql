-- Where a teacher may teach, and the colour a teacher is drawn with.
--
-- Locations: the administrator chooses, per teacher, the locations where they may hold lessons. A lesson or a free slot can
-- only be at one of them. A location cannot be taken away from a teacher who still has a lesson or free slot there that has
-- not ended (lessons that are over never block it), and every teacher keeps at least one location.
-- Colour: the teacher picks it from a fixed palette; it belongs to the teacher, so it applies to all their lessons.

-- Teacher locations -----------------------------------------------------------------------------------------------------------------
-- Rows are only written by set_teacher_locations() and create_teacher(). Deleting a teacher or a location takes the rows
-- with it; a location that is used by lessons or rooms is still refused by those tables' own foreign keys.

create table public.teacher_locations (
  teacher_id uuid not null references public.teachers (profile_id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  primary key (teacher_id, location_id)
);
create index teacher_locations_location_id_idx on public.teacher_locations (location_id);

alter table public.teacher_locations enable row level security;
grant select on public.teacher_locations to authenticated;
create policy teacher_locations_select on public.teacher_locations for select to authenticated
  using ((select private.is_admin()) or teacher_id = (select private.current_teacher_id()));

-- Existing teachers may use every location (an erased record is only kept as history and gets none).
insert into public.teacher_locations (teacher_id, location_id)
select t.profile_id, l.id
  from public.teachers t
  join public.profiles p on p.id = t.profile_id and p.erased_at is null
 cross join public.locations l;

-- The lessons and free slots that have not ended yet at the given locations of a teacher, as the detail of an error: the
-- total, and the first twenty with their place and time (never who attends). Null when there are none.
create function private.location_blockers(p_teacher_id uuid, p_location_ids uuid[]) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_total integer;
  v_lessons jsonb;
begin
  select count(*) into v_total
    from public.lessons l
   where l.teacher_id = p_teacher_id and l.location_id = any (p_location_ids) and l.end_at > now();
  if v_total = 0 then
    return null;
  end if;

  select jsonb_agg(
           jsonb_build_object('id', x.id, 'location_id', x.location_id, 'start_at', x.start_at, 'end_at', x.end_at, 'status', x.status)
           order by x.start_at, x.id)
    into v_lessons
    from (
      select l.id, l.location_id, l.start_at, l.end_at, l.status
        from public.lessons l
       where l.teacher_id = p_teacher_id and l.location_id = any (p_location_ids) and l.end_at > now()
       order by l.start_at, l.id
       limit 20
    ) x;

  return jsonb_build_object('total', v_total, 'lessons', v_lessons);
end $$;

-- A location is not taken away while the teacher has something still to come there. This is the rule itself;
-- set_teacher_locations() checks first only to name the lessons of all the locations at once.
-- Postgres locks the row before a before-delete trigger runs, and lessons_validate() takes a share lock on the same row,
-- so a lesson that is being written at this very moment makes the delete wait; the query below then sees it (it runs after
-- the wait, with a fresh snapshot) and refuses. Without that lock, or the other way round, the lesson is refused there.
-- (location_removal_race.sh checks both orders with real parallel sessions.)
create function private.teacher_locations_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_blockers jsonb;
begin
  v_blockers := private.location_blockers(old.teacher_id, array[old.location_id]);
  if v_blockers is not null then
    raise exception 'this teacher still has lessons or free slots at this location'
      using errcode = 'PT409', detail = v_blockers::text;
  end if;
  return old;
end $$;

create trigger teacher_locations_guard
  before delete on public.teacher_locations
  for each row execute function private.teacher_locations_guard();

-- Every teacher keeps at least one location, also a deactivated one (so that reactivating is always safe). A teacher who is
-- being deleted, and the record of an erased one, are not teachers any more.
create function private.keep_teacher_location() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1
      from removed r
      join public.teachers t on t.profile_id = r.teacher_id
      join public.profiles p on p.id = t.profile_id
     where p.erased_at is null
       and not exists (select 1 from public.teacher_locations tl where tl.teacher_id = r.teacher_id)
  ) then
    raise exception 'a teacher needs at least one location' using errcode = 'PT409';
  end if;
  return null;
end $$;

create trigger teacher_locations_keep_one
  after delete on public.teacher_locations
  referencing old table as removed
  for each statement execute function private.keep_teacher_location();

-- Lessons: only at a location the teacher may use ------------------------------------------------------------------------------------
-- Checked when a lesson or slot is created and when its teacher or location changes, not on other edits: a lesson at a
-- location that was taken away later (it was over by then) can still get its outcome and notes.
-- (This is lessons_validate() from 20261029120000_teacher_editing.sql plus the location check.)

create or replace function private.lessons_validate() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (
    new.subject_id is distinct from old.subject_id
    or new.location_id is distinct from old.location_id
    or new.room_id is distinct from old.room_id
    or new.start_at is distinct from old.start_at
    or new.end_at is distinct from old.end_at
  ) then
    if old.outcome is not null then
      raise exception 'a lesson with a recorded outcome cannot be changed' using errcode = 'PT409';
    end if;
    if now() >= private.school_day_end(old.start_at) then
      raise exception 'the day of this lesson is over, it can no longer be changed' using errcode = 'PT409';
    end if;
    if new.start_at < private.school_day_start(now()) then
      raise exception 'a lesson cannot be moved to a day that has passed' using errcode = 'PT400';
    end if;
  end if;

  if tg_op = 'INSERT' or new.teacher_id is distinct from old.teacher_id or new.subject_id is distinct from old.subject_id then
    if not exists (
      select 1 from public.teacher_subjects ts
       where ts.teacher_id = new.teacher_id and ts.subject_id = new.subject_id
    ) then
      raise exception 'the teacher does not teach this subject' using errcode = 'PT400';
    end if;
  end if;

  if tg_op = 'INSERT' or new.teacher_id is distinct from old.teacher_id or new.location_id is distinct from old.location_id then
    -- the share lock makes taking this location away wait for this lesson, and then see it
    perform 1 from public.teacher_locations tl
     where tl.teacher_id = new.teacher_id and tl.location_id = new.location_id for share;
    if not found then
      raise exception 'the teacher may not hold lessons at this location' using errcode = 'PT400';
    end if;
  end if;

  if new.status = 'confirmed' then
    if tg_op = 'INSERT' or old.status <> 'confirmed' then
      new.confirmed_at := now();
    end if;
  else
    new.confirmed_at := null;
  end if;

  if tg_op = 'UPDATE' and new.outcome is not null and new.outcome is distinct from old.outcome then
    if new.status <> 'confirmed' or new.end_at > now() then
      raise exception 'an outcome can only be recorded once a confirmed lesson has ended' using errcode = 'PT400';
    end if;
  end if;

  return new;
end $$;

-- The administrator sets a teacher's locations ---------------------------------------------------------------------------------------
-- Replaces the whole set in one step. Refused (PT409, the lessons in the error detail) while the teacher has a lesson or free
-- slot still to come at a location that would go; nothing is changed then, not even what could have been added.

create function public.set_teacher_locations(p_teacher_id uuid, p_location_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_erased timestamptz;
  v_locations uuid[];
  v_removed uuid[];
  v_blockers jsonb;
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;

  select p.erased_at into v_erased
    from public.teachers t join public.profiles p on p.id = t.profile_id
   where t.profile_id = p_teacher_id;
  if not found then
    raise exception 'teacher not found' using errcode = 'PT404';
  end if;
  if v_erased is not null then
    raise exception 'this teacher was erased' using errcode = 'PT409';
  end if;

  select coalesce(array_agg(l), '{}') into v_locations from unnest(p_location_ids) as l where l is not null;
  if cardinality(v_locations) = 0 then
    raise exception 'a teacher needs at least one location' using errcode = 'PT400';
  end if;
  if exists (select 1 from unnest(v_locations) as l where not exists (select 1 from public.locations x where x.id = l)) then
    raise exception 'unknown location' using errcode = 'PT400';
  end if;

  select coalesce(array_agg(tl.location_id), '{}') into v_removed
    from public.teacher_locations tl
   where tl.teacher_id = p_teacher_id and not (tl.location_id = any (v_locations));
  v_blockers := private.location_blockers(p_teacher_id, v_removed);
  if v_blockers is not null then
    raise exception 'this teacher still has lessons or free slots at this location'
      using errcode = 'PT409', detail = v_blockers::text;
  end if;

  insert into public.teacher_locations (teacher_id, location_id)
  select p_teacher_id, l from unnest(v_locations) as l
  on conflict do nothing;
  delete from public.teacher_locations where teacher_id = p_teacher_id and not (location_id = any (v_locations));
end $$;

-- A new teacher gets the locations the administrator chose ------------------------------------------------------------------------------
-- The old four-argument version is gone: there is no way to add a teacher without saying where they teach.

drop function public.create_teacher(text, text, text, uuid[]);

create function public.create_teacher(
  p_email text, p_first_name text, p_last_name text, p_subject_ids uuid[], p_location_ids uuid[]
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_profile uuid;
  v_locations uuid[];
begin
  if not private.is_admin() then
    raise exception 'not allowed' using errcode = 'PT403';
  end if;
  if p_subject_ids is null or cardinality(p_subject_ids) = 0 then
    raise exception 'a teacher needs at least one subject' using errcode = 'PT400';
  end if;

  select coalesce(array_agg(distinct l), '{}') into v_locations from unnest(p_location_ids) as l where l is not null;
  if cardinality(v_locations) = 0 then
    raise exception 'a teacher needs at least one location' using errcode = 'PT400';
  end if;
  if exists (select 1 from unnest(v_locations) as l where not exists (select 1 from public.locations x where x.id = l)) then
    raise exception 'unknown location' using errcode = 'PT400';
  end if;

  v_profile := private.upsert_profile(p_email, p_first_name, p_last_name);
  if exists (select 1 from public.teachers where profile_id = v_profile) then
    raise exception 'this person is already a teacher' using errcode = 'PT409';
  end if;

  insert into public.teachers (profile_id) values (v_profile);
  insert into public.teacher_subjects (teacher_id, subject_id)
  select v_profile, s from unnest(p_subject_ids) as s group by s;
  insert into public.teacher_locations (teacher_id, location_id)
  select v_profile, l from unnest(v_locations) as l;

  return v_profile;
end $$;

revoke all on function public.set_teacher_locations(uuid, uuid[]) from public, anon;
revoke all on function public.create_teacher(text, text, text, uuid[], uuid[]) from public, anon;
grant execute on function public.set_teacher_locations(uuid, uuid[]) to authenticated;
grant execute on function public.create_teacher(text, text, text, uuid[], uuid[]) to authenticated;

-- A teacher's colour ----------------------------------------------------------------------------------------------------------------------
-- The palette is a list of names; the app decides the shades (dark enough for white text). No choice (null) keeps the
-- colours the calendar has always used. Teachers choose their own colour (the existing policy limits an update to the
-- teacher's own row), and everybody who can see a teacher sees it.

alter table public.teachers add column color text;
alter table public.teachers add constraint teachers_color_in_palette check (
  color in ('red', 'orange', 'brown', 'olive', 'green', 'teal', 'blue', 'indigo', 'purple', 'magenta', 'wine', 'slate')
);
grant update (color) on public.teachers to authenticated;
