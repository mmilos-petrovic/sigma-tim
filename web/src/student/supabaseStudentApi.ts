import type { SupabaseClient } from '@supabase/supabase-js'
import { run } from '../admin/supabaseAdminApi'
import type { Database } from '../lib/database.types'
import type {
  LessonOrigin,
  LessonPage,
  LessonStatus,
  MyLesson,
  OpenSlot,
  Outcome,
  StudentApi,
  StudentRecord,
} from './studentApi'

const byName = (a: string, b: string) => a.localeCompare(b, 'sr')

interface Named {
  first_name: string
  last_name: string
}
const fullName = (profile: Named) => `${profile.first_name} ${profile.last_name}`

// Row mappers ----------------------------------------------------------------------------------------------------

export function mapRecord(
  row: { id: string; teacher_id: string | null; profile: Named },
  teacherNames: ReadonlyMap<string, string>,
): StudentRecord {
  return {
    id: row.id,
    name: fullName(row.profile),
    teacherId: row.teacher_id,
    teacherName: row.teacher_id ? (teacherNames.get(row.teacher_id) ?? null) : null,
  }
}

interface PlaceRow {
  subject: { name: string } | null
  location: { name: string; address: string } | null
  room: { name: string } | null
}

/** The lesson row as read with its place and the student's own participation. */
export interface LessonRowFromDb extends PlaceRow {
  id: string
  teacher_id: string
  start_at: string
  end_at: string
  status: string
  outcome: string | null
  origin: string
  mine: { note: string | null }[]
}

const iso = (timestamp: string) => new Date(timestamp).toISOString()

export function mapLesson(
  row: LessonRowFromDb,
  teacherNames: ReadonlyMap<string, string>,
): MyLesson {
  return {
    id: row.id,
    start: iso(row.start_at),
    end: iso(row.end_at),
    // only these two exist for a lesson with participants; an open slot has none
    status: row.status as LessonStatus,
    outcome: (row.outcome as Outcome | null) ?? null,
    origin: row.origin as LessonOrigin,
    subject: row.subject?.name ?? '',
    location: row.location?.name ?? '',
    address: row.location?.address ?? '',
    room: row.room?.name ?? null,
    teacherId: row.teacher_id,
    teacherName: teacherNames.get(row.teacher_id) ?? null,
    note: row.mine[0]?.note?.trim() ? row.mine[0].note : null,
  }
}

export function mapSlot(
  row: PlaceRow & { id: string; start_at: string; end_at: string },
): OpenSlot {
  return {
    id: row.id,
    start: iso(row.start_at),
    end: iso(row.end_at),
    subject: row.subject?.name ?? '',
    location: row.location?.name ?? '',
    address: row.location?.address ?? '',
    room: row.room?.name ?? null,
  }
}

// The API ----------------------------------------------------------------------------------------------------------

const PLACE = 'subject:subjects(name), location:locations(name, address), room:rooms(name)'
// Only through the student's own participation: an account that also teaches can read more lessons than these.
const LESSON = `id, teacher_id, start_at, end_at, status, outcome, origin, ${PLACE}, mine:lesson_students!inner(note)`

export function createSupabaseStudentApi(client: SupabaseClient<Database>): StudentApi {
  /** First and last names of the given profiles. Teachers of old lessons are readable too (see the database README). */
  async function namesOf(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)]
    if (unique.length === 0) return new Map()
    const { data } = await run(
      client.from('profiles').select('id, first_name, last_name').in('id', unique),
    )
    return new Map((data ?? []).map((profile) => [profile.id, fullName(profile)]))
  }

  async function lessons(studentId: string, apply: (query: LessonQuery) => LessonQuery) {
    const { data } = await run(
      apply(
        client
          .from('lessons')
          .select(LESSON)
          .eq('mine.student_id', studentId) as unknown as LessonQuery,
      ) as unknown as PromiseLike<{
        data: LessonRowFromDb[] | null
        error: { message: string } | null
        status: number
      }>,
    )
    const rows = data ?? []
    const names = await namesOf(rows.map((row) => row.teacher_id))
    return { rows, names }
  }

  return {
    async listRecords(context, profileId) {
      if (context === 'student') {
        const { data } = await run(
          client
            .from('students')
            .select('id, teacher_id, profile:profiles(first_name, last_name)')
            .eq('profile_id', profileId),
        )
        const rows = (data ?? []).filter(
          (row): row is typeof row & { profile: Named } => row.profile !== null,
        )
        const names = await namesOf(rows.flatMap((row) => (row.teacher_id ? [row.teacher_id] : [])))
        return rows
          .map((row) => mapRecord(row, names))
          .sort((a, b) => byName(a.teacherName ?? '', b.teacherName ?? ''))
      }

      const { data } = await run(
        client
          .from('parent_students')
          .select('student:students(id, teacher_id, profile:profiles(first_name, last_name))')
          .eq('parent_id', profileId),
      )
      const rows = (data ?? []).flatMap((link) =>
        link.student && link.student.profile
          ? [{ ...link.student, profile: link.student.profile }]
          : [],
      )
      const names = await namesOf(rows.flatMap((row) => (row.teacher_id ? [row.teacher_id] : [])))
      return rows.map((row) => mapRecord(row, names)).sort((a, b) => byName(a.name, b.name))
    },

    async listUpcoming(studentId, now) {
      const { rows, names } = await lessons(studentId, (query) =>
        query.gt('end_at', now).order('start_at', { ascending: true }),
      )
      return rows.map((row) => mapLesson(row, names))
    },

    async listPast(studentId, now, limit): Promise<LessonPage> {
      // one more than asked for tells whether there are older lessons
      const { rows, names } = await lessons(studentId, (query) =>
        query
          .lte('end_at', now)
          .order('start_at', { ascending: false })
          .limit(limit + 1),
      )
      return {
        lessons: rows.slice(0, limit).map((row) => mapLesson(row, names)),
        hasMore: rows.length > limit,
      }
    },

    async listSlots(teacherId, now) {
      const { data } = await run(
        client
          .from('lessons')
          .select(`id, start_at, end_at, ${PLACE}`)
          .eq('teacher_id', teacherId)
          .eq('status', 'open')
          .gt('start_at', now)
          .order('start_at', { ascending: true }),
      )
      return (data ?? []).map((row) => mapSlot(row as unknown as Parameters<typeof mapSlot>[0]))
    },

    async teacherPhone(teacherId) {
      const { data } = await run(
        client.from('person_phones').select('phone').eq('profile_id', teacherId).maybeSingle(),
      )
      return data?.phone ?? null
    },

    async claimSlot(slotId, studentId) {
      const { data } = await run(
        client.rpc('claim_slot', { p_lesson_id: slotId, p_student_ids: [studentId] }),
      )
      return data as LessonStatus
    },

    async cancelLesson(lessonId) {
      await run(client.rpc('cancel_lesson', { p_lesson_id: lessonId }))
    },
  }
}

/** The few filters this file adds to a lessons query, typed loosely: the embedded columns are not in the generated types. */
interface LessonQuery {
  gt(column: string, value: string): LessonQuery
  lte(column: string, value: string): LessonQuery
  order(column: string, options: { ascending: boolean }): LessonQuery
  limit(count: number): LessonQuery
}
