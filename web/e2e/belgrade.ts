import { sql } from './api.ts'

/** The Belgrade calendar date `offset` days from today (`2026-11-10`). */
export const belgradeDate = (offset: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Belgrade' }).format(
    new Date(Date.now() + offset * 86_400_000),
  )

const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Belgrade',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/** The instant (ISO) at which the Belgrade clock shows `time` on `day`: Belgrade is one or two hours ahead of UTC. */
export function at(day: string, time: string): string {
  for (const offset of [1, 2]) {
    const candidate = new Date(`${day}T${time}:00.000Z`)
    candidate.setUTCHours(candidate.getUTCHours() - offset)
    if (clockFormat.format(candidate) === time) return candidate.toISOString()
  }
  throw new Error(`cannot place ${time} on ${day}`)
}

/**
 * A lesson of the teacher that has already taken place (the app cannot make one), with one student on it. Returns its id.
 * `held`: recorded as held; `paid`: marked as paid.
 */
export function pastLesson(options: {
  teacherEmail: string
  studentId: string
  start: string
  held: boolean
  paid: boolean
}): string {
  const end = new Date(new Date(options.start).getTime() + 3_600_000).toISOString()
  return sql(`
    with l as (
      insert into public.lessons (teacher_id, subject_id, location_id, start_at, end_at, status, origin, outcome, confirmed_at)
      select t.id, s.id, loc.id, '${options.start}'::timestamptz, '${end}'::timestamptz, 'confirmed', 'teacher',
             ${options.held ? "'held'" : 'null'}, now()
        from public.profiles t, public.subjects s, public.locations loc
       where t.email = '${options.teacherEmail}' and s.name = 'Matematika' and loc.name = 'Glavna lokacija'
      returning id
    ), p as (
      insert into public.lesson_students (lesson_id, student_id, paid_at)
      select l.id, '${options.studentId}', ${options.paid ? 'now()' : 'null'} from l returning lesson_id
    )
    select lesson_id from p;`)
}

/** Removes lessons that already started (the app cannot) together with whoever was on them. */
export function removeLessons(ids: string[]) {
  const list = ids.map((id) => `'${id}'`).join(',')
  if (!list) return
  sql(`
    set session_replication_role = replica;
    delete from public.lesson_students where lesson_id in (${list});
    delete from public.lessons where id in (${list});`)
}

/** The reasons carried by the notices queued for a lesson, sorted ('-' for a notice without one). */
export function notedReasons(lessonId: string): string[] {
  const text = sql(`
    select coalesce(payload->>'note', '-') from public.notifications
     where payload->>'lesson_id' = '${lessonId}' order by 1;`)
  return text === '' ? [] : text.split('\n')
}
