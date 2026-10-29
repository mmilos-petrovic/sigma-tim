import { vi } from 'vitest'
import { AdminError } from '../admin/adminApi'
import { isDayLocked, schoolDayStart } from '../teacher/schoolDay'
import {
  MAX_LESSON_STUDENTS,
  MAX_PARENTS,
  SLOT_MINUTES,
  type BusyRow,
  type Conflict,
  type LessonRow,
  type ParentRow,
  type Reference,
  type StudentRow,
  type TeacherApi,
  type UnassignedStudent,
} from '../teacher/teacherApi'

/** Wednesday 4 November 2026, 11:00 in Belgrade: the "now" of the lesson tests. */
export const TEST_NOW = new Date('2026-11-04T10:00:00Z')

export interface FakeTeacherState {
  students: StudentRow[]
  unassigned: UnassignedStudent[]
  reference: Reference
  lessons: LessonRow[]
  busy: BusyRow[]
  now: Date
}

type Methods = keyof TeacherApi

export interface FakeTeacherApi extends TeacherApi {
  state: FakeTeacherState
  /** Makes the next call of a method fail with this error. */
  failNext: (method: Methods, error: unknown) => void
  /** Makes every call of a method wait for the returned release function (to look at a loading state). */
  hold: (method: Methods) => () => void
  calls: Record<Methods, ReturnType<typeof vi.fn>>
}

/** "Petrović" -> "petrovic": the seed emails are plain ASCII, like the ones typed in the tests. */
const ascii = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const parent = (id: string, first: string, last: string, signedIn = false): ParentRow => ({
  id,
  email: `${ascii(first)}.${ascii(last)}@example.test`,
  firstName: first,
  lastName: last,
  hasSignedIn: signedIn,
})

export const seedTeacher = (): FakeTeacherState => ({
  students: [
    {
      id: 'st-ana',
      profileId: 'pr-ana',
      email: 'ana.petrovic@example.test',
      firstName: 'Ana',
      lastName: 'Petrović',
      hasSignedIn: true,
      school: 'OŠ Vuk Karadžić',
      grade: '7',
      section: 'a',
      parents: [
        parent('pr-mira', 'Mira', 'Petrović', true),
        parent('pr-zoran', 'Zoran', 'Petrović'),
      ],
    },
    {
      id: 'st-luka',
      profileId: 'pr-luka',
      email: 'luka.ilic@example.test',
      firstName: 'Luka',
      lastName: 'Ilić',
      hasSignedIn: false,
      school: null,
      grade: null,
      section: null,
      parents: [],
    },
  ],
  unassigned: [
    {
      id: 'st-neda',
      email: 'neda.markovic@example.test',
      firstName: 'Neda',
      lastName: 'Marković',
      school: 'Gimnazija',
      grade: '2',
      section: 'c',
      requested: false,
    },
    {
      id: 'st-vuk',
      email: 'vuk.vasic@example.test',
      firstName: 'Vuk',
      lastName: 'Vasić',
      school: null,
      grade: null,
      section: null,
      requested: true,
    },
  ],
  reference: {
    subjects: [
      { id: 's-mat', name: 'Matematika' },
      { id: 's-fiz', name: 'Fizika' },
    ],
    locations: [
      {
        id: 'l-main',
        name: 'Glavna lokacija',
        rooms: [
          { id: 'r-1', name: 'Učionica 1' },
          { id: 'r-2', name: 'Učionica 2' },
        ],
      },
      { id: 'l-zemun', name: 'Zemun', rooms: [] },
    ],
    colleagues: [{ id: 't-marko', firstName: 'Marko', lastName: 'Jovanović' }],
  },
  now: TEST_NOW,
  lessons: [
    {
      // earlier today: over, still open to changes, no outcome yet
      id: 'les-today',
      subjectId: 's-mat',
      locationId: 'l-main',
      roomId: 'r-2',
      start: '2026-11-04T07:00:00Z',
      end: '2026-11-04T08:00:00Z',
      status: 'confirmed',
      origin: 'teacher',
      outcome: null,
      participants: [{ studentId: 'st-ana', note: 'Radili razlomke' }],
    },
    {
      // tomorrow 16:00-17:00, two students, same room and time as the colleague below
      id: 'les-tomorrow',
      subjectId: 's-fiz',
      locationId: 'l-main',
      roomId: 'r-1',
      start: '2026-11-05T15:00:00Z',
      end: '2026-11-05T16:00:00Z',
      status: 'confirmed',
      origin: 'teacher',
      outcome: null,
      participants: [
        { studentId: 'st-ana', note: null },
        { studentId: 'st-luka', note: null },
      ],
    },
    {
      // Monday: the day is over and the outcome is recorded
      id: 'les-locked',
      subjectId: 's-mat',
      locationId: 'l-main',
      roomId: null,
      start: '2026-11-02T09:00:00Z',
      end: '2026-11-02T10:00:00Z',
      status: 'confirmed',
      origin: 'teacher',
      outcome: 'held',
      participants: [{ studentId: 'st-ana', note: null }],
    },
    {
      id: 'slot-open',
      subjectId: 's-mat',
      locationId: 'l-main',
      roomId: null,
      start: '2026-11-05T17:00:00Z',
      end: '2026-11-05T18:00:00Z',
      status: 'open',
      origin: 'slot',
      outcome: null,
      participants: [],
    },
    {
      // booked at the last minute, waits for the teacher
      id: 'booking-pending',
      subjectId: 's-mat',
      locationId: 'l-main',
      roomId: null,
      start: '2026-11-05T11:00:00Z',
      end: '2026-11-05T12:00:00Z',
      status: 'pending',
      origin: 'slot',
      outcome: null,
      participants: [{ studentId: 'st-luka', note: null }],
    },
    {
      // an expired free slot: never shown
      id: 'slot-expired',
      subjectId: 's-mat',
      locationId: 'l-main',
      roomId: null,
      start: '2026-11-04T05:00:00Z',
      end: '2026-11-04T06:00:00Z',
      status: 'open',
      origin: 'slot',
      outcome: null,
      participants: [],
    },
  ],
  busy: [
    {
      teacherId: 't-marko',
      locationId: 'l-main',
      roomId: 'r-1',
      start: '2026-11-05T15:30:00Z',
      end: '2026-11-05T16:30:00Z',
    },
  ],
})

const profileIdOf = (person: StudentRow | ParentRow) =>
  'profileId' in person ? person.profileId : person.id

const quarter = (iso: string) => new Date(iso).getTime() % (15 * 60_000) === 0
const overlaps = (a: { start: string; end: string }, b: { start: string; end: string }) =>
  new Date(a.start) < new Date(b.end) && new Date(a.end) > new Date(b.start)

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** An in-memory backend that follows the same rules as the database functions, for the screen tests. */
export function createFakeTeacherApi(initial: Partial<FakeTeacherState> = {}): FakeTeacherApi {
  const state: FakeTeacherState = { ...seedTeacher(), ...initial }
  const failures = new Map<Methods, unknown>()
  const holds = new Map<Methods, Promise<void>>()
  let counter = 0
  const nextId = (prefix: string) => `${prefix}-new-${++counter}`

  const gate = async (method: Methods) => {
    const hold = holds.get(method)
    if (hold) await hold
    if (failures.has(method)) {
      const error = failures.get(method)
      failures.delete(method)
      throw error
    }
  }

  const checkPerson = (input: { email?: string; firstName: string; lastName: string }) => {
    if (input.email !== undefined && !EMAIL.test(input.email.trim().toLowerCase()))
      throw new AdminError('PT400', 'invalid email')
    if (!input.firstName.trim() || !input.lastName.trim())
      throw new AdminError('PT400', 'first and last name are required')
  }

  const known = (email: string) => {
    const lower = email.trim().toLowerCase()
    for (const student of state.students) {
      if (student.email === lower) return student
      const found = student.parents.find((p) => p.email === lower)
      if (found) return found
    }
    return undefined
  }

  const findLesson = (id: string) => {
    const lesson = state.lessons.find((l) => l.id === id)
    if (!lesson) throw new AdminError('PT404', 'no matching row')
    return lesson
  }

  /** The students of a lesson as the database sees them: distinct, 1 to 4, and the teacher's own. */
  const checkStudents = (ids: string[]) => {
    const distinct = [...new Set(ids.filter(Boolean))]
    if (distinct.length === 0) throw new AdminError('PT400', 'a lesson needs at least one student')
    if (distinct.length > MAX_LESSON_STUDENTS)
      throw new AdminError('PT400', 'too many students in one lesson')
    if (distinct.some((id) => !state.students.some((s) => s.id === id)))
      throw new AdminError('PT403', 'not allowed')
    return distinct
  }

  const checkPlace = (place: { subjectId: string; locationId: string; roomId: string | null }) => {
    if (!state.reference.subjects.some((s) => s.id === place.subjectId))
      throw new AdminError('PT400', 'the teacher does not teach this subject')
    const location = state.reference.locations.find((l) => l.id === place.locationId)
    if (!location || (place.roomId && !location.rooms.some((r) => r.id === place.roomId)))
      throw new AdminError('23503', 'the room must belong to the location')
  }

  const checkTimes = (range: { start: string; end: string }) => {
    if (!quarter(range.start) || !quarter(range.end)) throw new AdminError('23514', 'time grid')
    if (new Date(range.end) <= new Date(range.start))
      throw new AdminError('23514', 'end after start')
  }

  const checkSlotLength = (range: { start: string; end: string }) => {
    const minutes = (new Date(range.end).getTime() - new Date(range.start).getTime()) / 60_000
    if (!(SLOT_MINUTES as readonly number[]).includes(minutes))
      throw new AdminError('23514', 'slot length')
  }

  const impl: TeacherApi = {
    async listStudents() {
      await gate('listStudents')
      return structuredClone(state.students)
    },
    async listUnassigned() {
      await gate('listUnassigned')
      return structuredClone(state.unassigned)
    },

    async addStudent(input) {
      await gate('addStudent')
      checkPerson(input)
      const email = input.email.trim().toLowerCase()
      if (state.students.some((s) => s.email === email))
        throw new AdminError('PT409', 'this person is already a student of this teacher')
      // an existing person keeps their name: whoever adds them the second time does not get to rename them
      const person = known(email)
      const id = nextId('st')
      state.students.push({
        id,
        profileId: person ? profileIdOf(person) : nextId('pr'),
        email,
        firstName: person ? person.firstName : input.firstName.trim(),
        lastName: person ? person.lastName : input.lastName.trim(),
        hasSignedIn: false,
        school: input.school?.trim() || null,
        grade: input.grade?.trim() || null,
        section: input.section?.trim() || null,
        parents: [],
      })
      return id
    },
    async updateStudentDetails(studentId, details) {
      await gate('updateStudentDetails')
      const student = state.students.find((s) => s.id === studentId)
      if (!student) throw new AdminError('PT404', 'no matching row')
      student.school = details.school?.trim() || null
      student.grade = details.grade?.trim() || null
      student.section = details.section?.trim() || null
    },
    async renamePerson(profileId, firstName, lastName) {
      await gate('renamePerson')
      const own =
        state.students.some((s) => s.profileId === profileId) ||
        state.students.some((s) => s.parents.some((p) => p.id === profileId))
      if (!own) throw new AdminError('PT403', 'not allowed')
      checkPerson({ firstName, lastName })
      // a name belongs to the person, wherever they appear
      for (const student of state.students) {
        if (student.profileId === profileId) {
          student.firstName = firstName.trim()
          student.lastName = lastName.trim()
        }
        for (const p of student.parents) {
          if (p.id === profileId) {
            p.firstName = firstName.trim()
            p.lastName = lastName.trim()
          }
        }
      }
    },
    async changeStudentEmail(studentId, email) {
      await gate('changeStudentEmail')
      const student = state.students.find((s) => s.id === studentId)
      if (!student) throw new AdminError('PT403', 'not allowed')
      const lower = email.trim().toLowerCase()
      if (!EMAIL.test(lower)) throw new AdminError('PT400', 'invalid email')
      if (lower === student.email) return
      if (known(lower) || state.unassigned.some((u) => u.email === lower))
        throw new AdminError('PT409', 'this email already belongs to another person')
      student.email = lower
      student.hasSignedIn = false
    },
    async addParent(studentId, input) {
      await gate('addParent')
      checkPerson(input)
      const student = state.students.find((s) => s.id === studentId)
      if (!student) throw new AdminError('PT403', 'not allowed')
      const email = input.email.trim().toLowerCase()
      const existing = known(email)
      const already = student.parents.some((p) => p.email === email)
      if (!already && student.parents.length >= MAX_PARENTS)
        throw new AdminError('PT409', 'a student has at most two parents')
      if (already) return
      student.parents.push({
        id: existing ? profileIdOf(existing) : nextId('pr'),
        email,
        firstName: existing ? existing.firstName : input.firstName.trim(),
        lastName: existing ? existing.lastName : input.lastName.trim(),
        hasSignedIn: false,
      })
    },
    async removeParent(studentId, parentId) {
      await gate('removeParent')
      const student = state.students.find((s) => s.id === studentId)
      if (!student) throw new AdminError('PT403', 'not allowed')
      if (!student.parents.some((p) => p.id === parentId))
        throw new AdminError('PT404', 'this parent is not linked to the student')
      student.parents = student.parents.filter((p) => p.id !== parentId)
    },
    async requestTakeover(studentId) {
      await gate('requestTakeover')
      const target = state.unassigned.find((s) => s.id === studentId)
      if (!target) throw new AdminError('PT409', 'the student already has a teacher')
      if (target.requested) throw new AdminError('PT409', 'there is already a pending request')
      target.requested = true
    },

    async reference() {
      await gate('reference')
      return structuredClone(state.reference)
    },
    async listLessons(range) {
      await gate('listLessons')
      return structuredClone(state.lessons.filter((l) => overlaps(l, range)))
    },
    async listPending() {
      await gate('listPending')
      return structuredClone(state.lessons.filter((l) => l.status === 'pending'))
    },
    async listBusy(range, teacherId) {
      await gate('listBusy')
      return structuredClone(
        state.busy.filter((b) => b.teacherId !== teacherId && overlaps(b, range)),
      )
    },
    async findConflicts(query) {
      await gate('findConflicts')
      const found: Conflict[] = []
      for (const lesson of state.lessons) {
        if (lesson.status === 'open' || lesson.id === query.excludeLessonId) continue
        if (!overlaps(lesson, query)) continue
        found.push({
          teacherId: query.teacherId,
          roomId: lesson.roomId,
          start: lesson.start,
          end: lesson.end,
          sameTeacher: true,
          sameRoom: query.roomId !== null && lesson.roomId === query.roomId,
        })
      }
      for (const busy of state.busy) {
        if (!overlaps(busy, query) || query.roomId === null || busy.roomId !== query.roomId)
          continue
        found.push({
          teacherId: busy.teacherId,
          roomId: busy.roomId,
          start: busy.start,
          end: busy.end,
          sameTeacher: false,
          sameRoom: true,
        })
      }
      return found
    },

    async scheduleLesson(input) {
      await gate('scheduleLesson')
      if (new Date(input.start) < schoolDayStart(state.now))
        throw new AdminError('PT400', 'a lesson cannot start on a day that has passed')
      const studentIds = checkStudents(input.studentIds)
      checkPlace(input)
      checkTimes(input)
      const id = nextId('les')
      state.lessons.push({
        id,
        subjectId: input.subjectId,
        locationId: input.locationId,
        roomId: input.roomId,
        start: input.start,
        end: input.end,
        status: 'confirmed',
        origin: 'teacher',
        outcome: null,
        participants: studentIds.map((studentId) => ({ studentId, note: null })),
      })
      return id
    },
    async updateLesson(lessonId, patch) {
      await gate('updateLesson')
      const lesson = findLesson(lessonId)
      const next = { ...lesson, ...patch }
      if (patch.roomId === undefined) next.roomId = lesson.roomId
      const changed =
        next.subjectId !== lesson.subjectId ||
        next.locationId !== lesson.locationId ||
        next.roomId !== lesson.roomId ||
        next.start !== lesson.start ||
        next.end !== lesson.end
      if (changed) {
        if (lesson.outcome)
          throw new AdminError('PT409', 'a lesson with a recorded outcome cannot be changed')
        if (isDayLocked(new Date(lesson.start), state.now))
          throw new AdminError('PT409', 'the day of this lesson is over')
        if (new Date(next.start) < schoolDayStart(state.now))
          throw new AdminError('PT400', 'a lesson cannot be moved to a day that has passed')
        checkPlace(next)
        checkTimes(next)
        if (lesson.origin === 'slot') checkSlotLength(next)
        if (lesson.status === 'open' && new Date(next.start) <= state.now)
          throw new AdminError('42501', 'a free slot can only be in the future')
      }
      Object.assign(lesson, { ...next, participants: lesson.participants })
    },
    async setLessonStudents(lessonId, studentIds) {
      await gate('setLessonStudents')
      const lesson = findLesson(lessonId)
      if (lesson.status !== 'confirmed')
        throw new AdminError('PT409', 'only a confirmed lesson has participants to change')
      const wanted = checkStudents(studentIds)
      lesson.participants = wanted.map(
        (studentId) =>
          lesson.participants.find((p) => p.studentId === studentId) ?? { studentId, note: null },
      )
    },
    async cancelLesson(lessonId) {
      await gate('cancelLesson')
      const lesson = findLesson(lessonId)
      if (new Date(lesson.start) <= state.now)
        throw new AdminError('PT409', 'lesson already started')
      if (lesson.status === 'open' || lesson.origin === 'teacher') {
        state.lessons = state.lessons.filter((l) => l.id !== lessonId)
      } else {
        lesson.status = 'open'
        lesson.participants = []
        lesson.outcome = null
      }
    },
    async publishSlot(input) {
      await gate('publishSlot')
      if (!SLOT_MINUTES.includes(input.minutes)) throw new AdminError('23514', 'slot length')
      if (new Date(input.start) <= state.now)
        throw new AdminError('42501', 'a free slot can only be in the future')
      checkPlace(input)
      const end = new Date(new Date(input.start).getTime() + input.minutes * 60_000).toISOString()
      checkTimes({ start: input.start, end })
      state.lessons.push({
        id: nextId('slot'),
        subjectId: input.subjectId,
        locationId: input.locationId,
        roomId: input.roomId,
        start: input.start,
        end,
        status: 'open',
        origin: 'slot',
        outcome: null,
        participants: [],
      })
    },
    async confirmBooking(lessonId) {
      await gate('confirmBooking')
      const lesson = findLesson(lessonId)
      if (lesson.status !== 'pending')
        throw new AdminError('PT409', 'only a pending booking can be confirmed')
      lesson.status = 'confirmed'
    },
    async declineBooking(lessonId) {
      await gate('declineBooking')
      const lesson = findLesson(lessonId)
      if (lesson.status !== 'pending')
        throw new AdminError('PT409', 'only a pending booking can be declined')
      if (new Date(lesson.start) <= state.now)
        throw new AdminError('PT409', 'lesson already started')
      lesson.status = 'open'
      lesson.participants = []
    },
    async setNote(lessonId, studentId, note) {
      await gate('setNote')
      const lesson = findLesson(lessonId)
      const participant = lesson.participants.find((p) => p.studentId === studentId)
      if (!participant) throw new AdminError('PT404', 'no matching row')
      if (note && note.length > 2000) throw new AdminError('23514', 'note too long')
      participant.note = note?.trim() || null
    },
    async setOutcome(lessonId, outcome) {
      await gate('setOutcome')
      const lesson = findLesson(lessonId)
      if (outcome !== null && (lesson.status !== 'confirmed' || new Date(lesson.end) > state.now))
        throw new AdminError(
          'PT400',
          'an outcome can only be recorded once a confirmed lesson has ended',
        )
      lesson.outcome = outcome
    },
  }

  const calls = {} as Record<Methods, ReturnType<typeof vi.fn>>
  const wrapped = {} as Record<string, unknown>
  for (const name of Object.keys(impl) as Methods[]) {
    const fn = vi.fn((...args: unknown[]) =>
      (impl[name] as (...a: unknown[]) => Promise<unknown>)(...args),
    )
    calls[name] = fn
    wrapped[name] = fn
  }

  return {
    ...(wrapped as unknown as TeacherApi),
    state,
    calls,
    failNext: (method, error) => {
      failures.set(method, error)
    },
    hold: (method) => {
      let release!: () => void
      holds.set(
        method,
        new Promise<void>((resolve) => {
          release = () => {
            holds.delete(method)
            resolve()
          }
        }),
      )
      return release
    },
  }
}
