import { vi } from 'vitest'
import { AdminError } from '../admin/adminApi'
import {
  type LessonPage,
  type LessonStatus,
  type MyLesson,
  type OpenSlot,
  type StudentApi,
  type StudentRecord,
} from '../student/studentApi'
import { isLateBooking, sortPast, sortUpcoming } from '../student/lessonList'
import { TEST_NOW } from './fakeTeacherApi'

export { TEST_NOW }

/** The fake keeps who a lesson belongs to and whose slot it is, which the screens never see. */
export type FakeLesson = MyLesson & { studentId: string }
export type FakeSlot = OpenSlot & { teacherId: string }

export interface FakeStudentState {
  records: StudentRecord[]
  lessons: FakeLesson[]
  slots: FakeSlot[]
  /** Teacher id to number; a teacher without an entry (or with null) has none. */
  phones: Record<string, string | null>
  /** Slots that somebody else books while the person is still looking at them. */
  takenElsewhere: Set<string>
  now: Date
}

type Methods = keyof StudentApi

export interface FakeStudentApi extends StudentApi {
  state: FakeStudentState
  /** Makes the next call of a method fail with this error. */
  failNext: (method: Methods, error: unknown) => void
  /** Makes every call of a method wait for the returned release function (to look at a loading state). */
  hold: (method: Methods) => () => void
  calls: Record<Methods, ReturnType<typeof vi.fn>>
}

/** Hours from the test clock, as an ISO time. */
export const at = (hours: number) => new Date(TEST_NOW.getTime() + hours * 3_600_000).toISOString()

export const MARKO: StudentRecord = {
  id: 'st-marko',
  name: 'Marko Marković',
  teacherId: 't-ana',
  teacherName: 'Ana Nikolić',
}
export const JANA: StudentRecord = {
  id: 'st-jana',
  name: 'Jana Marković',
  teacherId: 't-petar',
  teacherName: 'Petar Jović',
}

export function lessonOf(overrides: Partial<FakeLesson> & { id: string }): FakeLesson {
  return {
    studentId: MARKO.id,
    start: at(30),
    end: at(31),
    status: 'confirmed',
    outcome: null,
    origin: 'teacher',
    subject: 'Matematika',
    location: 'Centar',
    address: 'Knez Mihailova 1, Beograd',
    room: 'Učionica 1',
    teacherId: 't-ana',
    teacherName: 'Ana Nikolić',
    note: null,
    ...overrides,
  }
}

export function slotOf(overrides: Partial<FakeSlot> & { id: string }): FakeSlot {
  return {
    teacherId: 't-ana',
    start: at(48),
    end: at(49),
    subject: 'Matematika',
    location: 'Centar',
    address: 'Knez Mihailova 1, Beograd',
    room: null,
    ...overrides,
  }
}

/** One child of one teacher with a typical history: lessons ahead, one waiting, some behind, two free slots. */
export const seedStudent = (): FakeStudentState => ({
  records: [MARKO],
  lessons: [
    lessonOf({ id: 'l-next', start: at(30), end: at(31), note: 'Ponesite zbirku zadataka.' }),
    lessonOf({
      id: 'l-waiting',
      start: at(6),
      end: at(7),
      status: 'pending',
      origin: 'slot',
      subject: 'Fizika',
      room: null,
    }),
    lessonOf({
      id: 'l-held',
      start: at(-30),
      end: at(-29),
      outcome: 'held',
      note: 'Radili smo jednačine. Domaći je urađen. Sledeći put: sistemi.',
    }),
    lessonOf({
      id: 'l-notheld',
      start: at(-80),
      end: at(-79),
      outcome: 'not_held',
      note: 'Čas je otkazan zbog bolesti nastavnika.',
    }),
    lessonOf({ id: 'l-open', start: at(-120), end: at(-119) }),
    lessonOf({
      id: 'l-unanswered',
      start: at(-200),
      end: at(-199),
      status: 'pending',
      origin: 'slot',
    }),
  ],
  slots: [
    slotOf({ id: 'sl-1', start: at(48), end: at(49) }),
    slotOf({ id: 'sl-2', start: at(72), end: at(73), subject: 'Fizika', room: 'Učionica 2' }),
    slotOf({ id: 'sl-other', teacherId: 't-petar', start: at(50), end: at(51) }),
  ],
  phones: { 't-ana': '+381641110000' },
  takenElsewhere: new Set(),
  now: TEST_NOW,
})

/** An in-memory backend that follows the same rules as the database functions, for the screen tests. */
export function createFakeStudentApi(initial: Partial<FakeStudentState> = {}): FakeStudentApi {
  const state: FakeStudentState = { ...seedStudent(), ...initial }
  const failures = new Map<Methods, unknown>()
  const holds = new Map<Methods, Promise<void>>()

  const gate = async (method: Methods) => {
    const hold = holds.get(method)
    if (hold) await hold
    if (failures.has(method)) {
      const error = failures.get(method)
      failures.delete(method)
      throw error
    }
  }

  const withoutStudent = (lesson: FakeLesson): MyLesson => {
    const shown: Partial<FakeLesson> = { ...lesson }
    delete shown.studentId
    return shown as MyLesson
  }

  const methods: StudentApi = {
    async listRecords() {
      await gate('listRecords')
      return [...state.records].sort((a, b) => a.name.localeCompare(b.name, 'sr'))
    },
    async listUpcoming(studentId, now) {
      await gate('listUpcoming')
      const rows = state.lessons.filter(
        (l) => l.studentId === studentId && new Date(l.end) > new Date(now),
      )
      return sortUpcoming(rows).map(withoutStudent)
    },
    async listPast(studentId, now, limit): Promise<LessonPage> {
      await gate('listPast')
      const rows = sortPast(
        state.lessons.filter((l) => l.studentId === studentId && new Date(l.end) <= new Date(now)),
      )
      return { lessons: rows.slice(0, limit).map(withoutStudent), hasMore: rows.length > limit }
    },
    async listSlots(teacherId, now) {
      await gate('listSlots')
      return state.slots
        .filter((s) => s.teacherId === teacherId && new Date(s.start) > new Date(now))
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((slot) => {
          const shown: Partial<FakeSlot> = { ...slot }
          delete shown.teacherId
          return shown as OpenSlot
        })
    },
    async teacherPhone(teacherId) {
      await gate('teacherPhone')
      return state.phones[teacherId] ?? null
    },
    async claimSlot(slotId, studentId): Promise<LessonStatus> {
      await gate('claimSlot')
      const slot = state.slots.find((s) => s.id === slotId)
      if (!slot) throw new AdminError('PT404', 'lesson not found')
      const record = state.records.find((r) => r.id === studentId)
      if (!record || record.teacherId !== slot.teacherId)
        throw new AdminError('PT403', 'not allowed')
      if (state.takenElsewhere.has(slotId)) {
        state.slots = state.slots.filter((s) => s.id !== slotId)
        throw new AdminError('PT409', 'slot is already taken')
      }
      if (new Date(slot.start) <= state.now) throw new AdminError('PT409', 'lesson already started')

      const status: LessonStatus = isLateBooking(slot.start, state.now) ? 'pending' : 'confirmed'
      const { teacherId, ...shown } = slot
      state.slots = state.slots.filter((s) => s.id !== slotId)
      state.lessons.push({
        ...shown,
        studentId,
        teacherId,
        teacherName: record.teacherName,
        status,
        outcome: null,
        origin: 'slot',
        note: null,
      })
      return status
    },
    async cancelLesson(lessonId) {
      await gate('cancelLesson')
      const lesson = state.lessons.find((l) => l.id === lessonId)
      if (!lesson) throw new AdminError('PT404', 'lesson not found')
      if (new Date(lesson.start) <= state.now)
        throw new AdminError('PT409', 'lesson already started')
      state.lessons = state.lessons.filter((l) => l.id !== lessonId)
      if (lesson.origin === 'slot') {
        state.slots.push({
          id: lesson.id,
          teacherId: lesson.teacherId,
          start: lesson.start,
          end: lesson.end,
          subject: lesson.subject,
          location: lesson.location,
          address: lesson.address,
          room: lesson.room,
        })
      }
    },
  }

  const calls = {} as Record<Methods, ReturnType<typeof vi.fn>>
  const api = { state } as FakeStudentApi
  for (const name of Object.keys(methods) as Methods[]) {
    const spy = vi.fn((...args: unknown[]) =>
      (methods[name] as (...a: unknown[]) => Promise<unknown>)(...args),
    )
    calls[name] = spy
    ;(api as unknown as Record<string, unknown>)[name] = spy
  }
  api.calls = calls
  api.failNext = (method, error) => {
    failures.set(method, error)
  }
  api.hold = (method) => {
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
  }
  return api
}
