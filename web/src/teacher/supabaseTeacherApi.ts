import type { SupabaseClient } from '@supabase/supabase-js'
import { AdminError } from '../admin/adminApi'
import { run, runOne } from '../admin/supabaseAdminApi'
import type { Database } from '../lib/database.types'
import type {
  BusyRow,
  Conflict,
  LessonOrigin,
  LessonRow,
  LessonStatus,
  LocationOption,
  Option,
  Outcome,
  ParentRow,
  StudentRow,
  TeacherApi,
  UnassignedStudent,
} from './teacherApi'

const byName = (a: string, b: string) => a.localeCompare(b, 'sr')
const sortByName = <T extends { firstName: string; lastName: string }>(rows: T[]) =>
  rows.sort((a, b) => byName(`${a.lastName} ${a.firstName}`, `${b.lastName} ${b.firstName}`))

// Row mappers ----------------------------------------------------------------------------------------------------

interface ProfileRow {
  id: string
  email: string
  first_name: string
  last_name: string
  user_id: string | null
}

function mapParent(profile: ProfileRow): ParentRow {
  return {
    id: profile.id,
    email: profile.email,
    firstName: profile.first_name,
    lastName: profile.last_name,
    hasSignedIn: profile.user_id !== null,
  }
}

export function mapStudent(row: {
  id: string
  school: string | null
  grade: string | null
  class_section: string | null
  profile: ProfileRow
  parent_links: { parent: { profile: ProfileRow } | null }[]
}): StudentRow {
  return {
    id: row.id,
    profileId: row.profile.id,
    email: row.profile.email,
    firstName: row.profile.first_name,
    lastName: row.profile.last_name,
    hasSignedIn: row.profile.user_id !== null,
    school: row.school,
    grade: row.grade,
    section: row.class_section,
    // a link the database did not show us (no access to that parent) simply is not listed
    parents: sortByName(
      row.parent_links.flatMap((link) => (link.parent ? [mapParent(link.parent.profile)] : [])),
    ),
  }
}

export function mapUnassigned(
  row: {
    id: string
    school: string | null
    grade: string | null
    class_section: string | null
    profile: { email: string; first_name: string; last_name: string }
  },
  requestedIds: ReadonlySet<string>,
): UnassignedStudent {
  return {
    id: row.id,
    email: row.profile.email,
    firstName: row.profile.first_name,
    lastName: row.profile.last_name,
    school: row.school,
    grade: row.grade,
    section: row.class_section,
    requested: requestedIds.has(row.id),
  }
}

const iso = (timestamp: string) => new Date(timestamp).toISOString()

export function mapLocation(row: {
  id: string
  name: string
  rooms: { id: string; name: string }[]
}): LocationOption {
  return {
    id: row.id,
    name: row.name,
    // "Učionica 2" before "Učionica 10"
    rooms: [...row.rooms].sort((a, b) => a.name.localeCompare(b.name, 'sr', { numeric: true })),
  }
}

export function mapLesson(row: {
  id: string
  subject_id: string
  location_id: string
  room_id: string | null
  start_at: string
  end_at: string
  status: LessonStatus
  origin: LessonOrigin
  outcome: Outcome | null
  participants: { student_id: string; note: string | null }[]
}): LessonRow {
  return {
    id: row.id,
    subjectId: row.subject_id,
    locationId: row.location_id,
    roomId: row.room_id,
    start: iso(row.start_at),
    end: iso(row.end_at),
    status: row.status,
    origin: row.origin,
    outcome: row.outcome,
    participants: row.participants.map((p) => ({ studentId: p.student_id, note: p.note })),
  }
}

interface PlaceRow {
  teacher_id: string
  location_id: string
  room_id: string | null
  start_at: string
  end_at: string
}

export function mapBusy(row: PlaceRow): BusyRow {
  return {
    teacherId: row.teacher_id,
    locationId: row.location_id,
    roomId: row.room_id,
    start: iso(row.start_at),
    end: iso(row.end_at),
  }
}

export function mapConflict(
  row: PlaceRow & { same_teacher: boolean; same_room: boolean },
): Conflict {
  return {
    teacherId: row.teacher_id,
    roomId: row.room_id,
    start: iso(row.start_at),
    end: iso(row.end_at),
    sameTeacher: row.same_teacher,
    sameRoom: row.same_room,
  }
}

// The API --------------------------------------------------------------------------------------------------------

const PROFILE = 'id, email, first_name, last_name, user_id'
const LESSON =
  'id, subject_id, location_id, room_id, start_at, end_at, status, origin, outcome, participants:lesson_students(student_id, note)'

export function createSupabaseTeacherApi(client: SupabaseClient<Database>): TeacherApi {
  return {
    async listStudents(teacherId) {
      const { data } = await run(
        client
          .from('students')
          .select(
            `id, school, grade, class_section, profile:profiles(${PROFILE}), parent_links:parent_students(parent:parents(profile:profiles(${PROFILE})))`,
          )
          .eq('teacher_id', teacherId),
      )
      return sortByName(
        (data ?? []).map((row) => mapStudent(row as unknown as Parameters<typeof mapStudent>[0])),
      )
    },
    async listUnassigned(teacherId) {
      const [students, requests] = await Promise.all([
        run(
          client
            .from('students')
            .select(
              'id, school, grade, class_section, profile:profiles(email, first_name, last_name)',
            )
            .is('teacher_id', null),
        ),
        run(
          client
            .from('takeover_requests')
            .select('student_id')
            .eq('teacher_id', teacherId)
            .eq('status', 'pending'),
        ),
      ])
      const requested = new Set((requests.data ?? []).map((request) => request.student_id))
      return sortByName(
        (students.data ?? []).map((row) =>
          mapUnassigned(row as unknown as Parameters<typeof mapUnassigned>[0], requested),
        ),
      )
    },

    async addStudent({ email, firstName, lastName, school, grade, section }) {
      const { data } = await run(
        client.rpc('add_student', {
          p_email: email,
          p_first_name: firstName,
          p_last_name: lastName,
          // the function treats a missing value as "not given"
          p_school: school ?? undefined,
          p_grade: grade ?? undefined,
          p_class_section: section ?? undefined,
        }),
      )
      if (!data) throw new AdminError('unknown', 'add_student returned no id')
      return data
    },
    async updateStudentDetails(studentId, { school, grade, section }) {
      await runOne(
        client
          .from('students')
          .update({ school, grade, class_section: section })
          .eq('id', studentId)
          .select('id'),
      )
    },
    async renamePerson(profileId, firstName, lastName) {
      await run(
        client.rpc('rename_person', {
          p_profile_id: profileId,
          p_first_name: firstName,
          p_last_name: lastName,
        }),
      )
    },
    async changeStudentEmail(studentId, email) {
      await run(client.rpc('change_student_email', { p_student_id: studentId, p_new_email: email }))
    },
    async addParent(studentId, { email, firstName, lastName }) {
      await run(
        client.rpc('add_parent_to_student', {
          p_student_id: studentId,
          p_email: email,
          p_first_name: firstName,
          p_last_name: lastName,
        }),
      )
    },
    async removeParent(studentId, parentId) {
      await run(
        client.rpc('remove_parent_from_student', {
          p_student_id: studentId,
          p_parent_id: parentId,
        }),
      )
    },
    async requestTakeover(studentId) {
      await run(client.rpc('request_takeover', { p_student_id: studentId }))
    },

    async reference(teacherId) {
      const [subjects, locations, colleagues] = await Promise.all([
        run(
          client
            .from('teacher_subjects')
            .select('subject:subjects(id, name)')
            .eq('teacher_id', teacherId),
        ),
        run(client.from('locations').select('id, name, rooms(id, name)')),
        run(client.from('teachers').select('profile_id, profile:profiles(first_name, last_name)')),
      ])
      return {
        subjects: (subjects.data ?? [])
          .flatMap((row) => {
            const subject = (row as unknown as { subject: Option | null }).subject
            return subject ? [subject] : []
          })
          .sort((a, b) => byName(a.name, b.name)),
        locations: (locations.data ?? [])
          .map((row) => mapLocation(row as unknown as Parameters<typeof mapLocation>[0]))
          .sort((a, b) => byName(a.name, b.name)),
        colleagues: sortByName(
          (colleagues.data ?? [])
            .map((row) => {
              const { profile_id, profile } = row as unknown as {
                profile_id: string
                profile: { first_name: string; last_name: string }
              }
              return { id: profile_id, firstName: profile.first_name, lastName: profile.last_name }
            })
            .filter((colleague) => colleague.id !== teacherId),
        ),
      }
    },
    async listLessons(range, teacherId) {
      const { data } = await run(
        client
          .from('lessons')
          .select(LESSON)
          // an administrator who teaches would otherwise see every teacher's lessons
          .eq('teacher_id', teacherId)
          .lt('start_at', range.end)
          .gt('end_at', range.start)
          .order('start_at'),
      )
      return (data ?? []).map((row) => mapLesson(row as unknown as Parameters<typeof mapLesson>[0]))
    },
    async listPending(teacherId) {
      const { data } = await run(
        client
          .from('lessons')
          .select(LESSON)
          .eq('teacher_id', teacherId)
          .eq('status', 'pending')
          .order('start_at'),
      )
      return (data ?? []).map((row) => mapLesson(row as unknown as Parameters<typeof mapLesson>[0]))
    },
    async listBusy(range, teacherId) {
      const { data } = await run(client.rpc('busy_times', { p_from: range.start, p_to: range.end }))
      return (data ?? [])
        .filter((row) => row.teacher_id !== teacherId)
        .map((row) => mapBusy(row as PlaceRow))
    },
    async findConflicts({ teacherId, roomId, start, end, excludeLessonId }) {
      const { data } = await run(
        client.rpc('find_conflicts', {
          p_teacher_id: teacherId,
          // the generated type asks for a string, the function takes "no room" as null
          p_room_id: roomId as string,
          p_start_at: start,
          p_end_at: end,
          p_exclude_lesson_id: excludeLessonId,
        }),
      )
      return (data ?? []).map((row) => mapConflict(row as Parameters<typeof mapConflict>[0]))
    },

    async scheduleLesson({ subjectId, locationId, roomId, start, end, studentIds }) {
      const { data } = await run(
        client.rpc('schedule_lesson', {
          p_subject_id: subjectId,
          p_location_id: locationId,
          p_room_id: roomId as string,
          p_start_at: start,
          p_end_at: end,
          p_student_ids: studentIds,
        }),
      )
      if (!data) throw new AdminError('unknown', 'schedule_lesson returned no id')
      return data
    },
    async updateLesson(lessonId, patch) {
      const changes: Database['public']['Tables']['lessons']['Update'] = {}
      if (patch.subjectId !== undefined) changes.subject_id = patch.subjectId
      if (patch.locationId !== undefined) changes.location_id = patch.locationId
      if (patch.roomId !== undefined) changes.room_id = patch.roomId
      if (patch.start !== undefined) changes.start_at = patch.start
      if (patch.end !== undefined) changes.end_at = patch.end
      await runOne(client.from('lessons').update(changes).eq('id', lessonId).select('id'))
    },
    async setLessonStudents(lessonId, studentIds) {
      await run(
        client.rpc('set_lesson_students', { p_lesson_id: lessonId, p_student_ids: studentIds }),
      )
    },
    async cancelLesson(lessonId) {
      await run(client.rpc('cancel_lesson', { p_lesson_id: lessonId }))
    },
    async publishSlot({ teacherId, subjectId, locationId, roomId, start, minutes }) {
      const end = new Date(new Date(start).getTime() + minutes * 60_000).toISOString()
      await run(
        client.from('lessons').insert({
          teacher_id: teacherId,
          subject_id: subjectId,
          location_id: locationId,
          room_id: roomId,
          start_at: start,
          end_at: end,
          status: 'open',
          origin: 'slot',
        }),
      )
    },
    async confirmBooking(lessonId) {
      await run(client.rpc('confirm_booking', { p_lesson_id: lessonId }))
    },
    async declineBooking(lessonId) {
      await run(client.rpc('decline_booking', { p_lesson_id: lessonId }))
    },
    async setNote(lessonId, studentId, note) {
      await runOne(
        client
          .from('lesson_students')
          .update({ note })
          .eq('lesson_id', lessonId)
          .eq('student_id', studentId)
          .select('lesson_id'),
      )
    },
    async setOutcome(lessonId, outcome) {
      await runOne(client.from('lessons').update({ outcome }).eq('id', lessonId).select('id'))
    },
  }
}
