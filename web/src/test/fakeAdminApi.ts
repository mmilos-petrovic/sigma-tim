import { vi } from 'vitest'
import { normalizePhone } from '../lib/phone'
import {
  AdminError,
  type AdminApi,
  type LocationRow,
  type Photo,
  type AdminStudentRow,
  type Subject,
  type TakeoverRow,
  type EraseResult,
  type TeacherImpact,
  type TeacherRow,
} from '../admin/adminApi'

export interface FakeState {
  subjects: { id: string; name: string }[]
  teachers: TeacherRow[]
  locations: LocationRow[]
  takeovers: TakeoverRow[]
  students: AdminStudentRow[]
  impact: Record<string, TeacherImpact>
  /** Teachers who have a lesson that already started: erasing them leaves a record. */
  history: Record<string, boolean>
  /** Lessons, bookings and free slots still to come, per teacher: they stop a location from being taken away. */
  blockers: Record<
    string,
    { id: string; locationId: string; start: string; end: string; status: string }[]
  >
}

type Methods = keyof AdminApi

export interface FakeAdminApi extends AdminApi {
  state: FakeState
  /** Makes the next call of a method fail with this error. */
  failNext: (method: Methods, error: unknown) => void
  /** Makes every call of a method wait for the returned release function (to look at a loading state). */
  hold: (method: Methods) => () => void
  calls: Record<Methods, ReturnType<typeof vi.fn>>
}

export const seed = (): FakeState => ({
  subjects: [
    { id: 's-mat', name: 'Matematika' },
    { id: 's-fiz', name: 'Fizika' },
    { id: 's-hem', name: 'Hemija' },
  ],
  teachers: [
    {
      id: 't-ana',
      email: 'ana.nikolic@example.test',
      firstName: 'Ana',
      lastName: 'Nikolić',
      isActive: true,
      hasSignedIn: true,
      isAdmin: false,
      erased: false,
      subjectIds: ['s-mat', 's-fiz'],
      locationIds: ['l-main', 'l-second'],
      phone: '+381641110003',
    },
    {
      id: 't-marko',
      email: 'marko.jovanovic@example.test',
      firstName: 'Marko',
      lastName: 'Jovanović',
      isActive: true,
      hasSignedIn: false,
      isAdmin: false,
      erased: false,
      subjectIds: ['s-hem'],
      locationIds: ['l-main'],
      phone: '+381641110004',
    },
    {
      id: 't-gone',
      email: 'goran@example.test',
      firstName: 'Goran',
      lastName: 'Savić',
      isActive: false,
      hasSignedIn: true,
      isAdmin: false,
      erased: false,
      subjectIds: ['s-mat'],
      locationIds: ['l-main'],
      phone: null,
    },
  ],
  locations: [
    {
      id: 'l-main',
      name: 'Glavna lokacija',
      address: 'Ulica 1, Beograd',
      rooms: [
        { id: 'r-1', name: 'Učionica 1' },
        { id: 'r-2', name: 'Učionica 2' },
      ],
      photos: [{ id: 'ph-1', path: 'l-main/a.jpg', position: 1 }],
    },
    { id: 'l-second', name: 'Zemun', address: 'Ulica 2, Zemun', rooms: [], photos: [] },
  ],
  takeovers: [
    {
      id: 'q-1',
      createdAt: '2026-10-26T10:00:00Z',
      student: {
        id: 'st-1',
        firstName: 'Luka',
        lastName: 'Ilić',
        school: 'OŠ Vuk Karadžić',
        grade: '7',
        section: 'a',
      },
      teacher: { id: 't-ana', firstName: 'Ana', lastName: 'Nikolić' },
    },
    {
      id: 'q-2',
      createdAt: '2026-10-26T11:00:00Z',
      student: {
        id: 'st-1',
        firstName: 'Luka',
        lastName: 'Ilić',
        school: 'OŠ Vuk Karadžić',
        grade: '7',
        section: 'a',
      },
      teacher: { id: 't-marko', firstName: 'Marko', lastName: 'Jovanović' },
    },
  ],
  students: [
    {
      // one person, two teachers: with Marko two lessons were held, with Ana Nikolić none
      studentId: 'st-ana1',
      profileId: 'pr-ana',
      firstName: 'Ana',
      lastName: 'Petrović',
      email: 'ana.petrovic@example.test',
      createdAt: '2026-02-10T10:00:00Z',
      teacherId: 't-marko',
      teacherName: 'Marko Jovanović',
      parentNames: ['Mira Petrović', 'Zoran Petrović'],
      locationNames: ['Glavna lokacija'],
      heldLessons: 2,
      upcomingLessons: 1,
    },
    {
      studentId: 'st-ana2',
      profileId: 'pr-ana',
      firstName: 'Ana',
      lastName: 'Petrović',
      email: 'ana.petrovic@example.test',
      createdAt: '2026-03-01T10:00:00Z',
      teacherId: 't-ana',
      teacherName: 'Ana Nikolić',
      parentNames: ['Mira Petrović'],
      locationNames: ['Zemun'],
      heldLessons: 0,
      upcomingLessons: 0,
    },
    {
      studentId: 'st-luka',
      profileId: 'pr-luka',
      firstName: 'Luka',
      lastName: 'Ilić',
      email: 'luka.ilic@example.test',
      createdAt: '2026-04-05T10:00:00Z',
      teacherId: 't-ana',
      teacherName: 'Ana Nikolić',
      parentNames: [],
      locationNames: ['Zemun'],
      heldLessons: 0,
      upcomingLessons: 2,
    },
    {
      studentId: 'st-neda',
      profileId: 'pr-neda',
      firstName: 'Neda',
      lastName: 'Marković',
      email: 'neda.markovic@example.test',
      createdAt: '2026-01-05T10:00:00Z',
      teacherId: null,
      teacherName: null,
      parentNames: [],
      locationNames: [],
      heldLessons: 0,
      upcomingLessons: 0,
    },
  ],
  impact: { 't-ana': { futureLessons: 3, students: 2, pendingRequests: 1 } },
  history: { 't-ana': true },
  blockers: {},
})

/** An in-memory backend that follows the same rules as the database, for the screen tests. */
export function createFakeAdminApi(initial: Partial<FakeState> = {}): FakeAdminApi {
  const state: FakeState = { ...seed(), ...initial }
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

  /** What create_teacher and set_teacher_locations check: at least one, and all of them exist. */
  const checkLocations = (ids: string[] | null) => {
    if (!ids || ids.length === 0)
      throw new AdminError('PT400', 'a teacher needs at least one location')
    if (ids.some((id) => !state.locations.some((l) => l.id === id)))
      throw new AdminError('PT400', 'unknown location')
  }

  const room = (id: string) => state.locations.flatMap((l) => l.rooms).find((r) => r.id === id)
  const duplicate = (message = 'duplicate') => new AdminError('23505', message)

  const impl: AdminApi = {
    async listSubjects(): Promise<Subject[]> {
      await gate('listSubjects')
      return state.subjects
        .map((s) => ({
          ...s,
          teacherCount: state.teachers.filter((t) => t.subjectIds.includes(s.id)).length,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'sr'))
    },
    async addSubject(name) {
      await gate('addSubject')
      if (state.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw duplicate()
      state.subjects.push({ id: nextId('s'), name })
    },
    async renameSubject(id, name) {
      await gate('renameSubject')
      if (state.subjects.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase()))
        throw duplicate()
      const subject = state.subjects.find((s) => s.id === id)
      if (!subject) throw new AdminError('PT404')
      subject.name = name
    },
    async deleteSubject(id) {
      await gate('deleteSubject')
      if (state.teachers.some((t) => t.subjectIds.includes(id))) throw new AdminError('23503')
      state.subjects = state.subjects.filter((s) => s.id !== id)
    },

    async listTeachers() {
      await gate('listTeachers')
      return state.teachers.map((t) => ({ ...t, subjectIds: [...t.subjectIds] }))
    },
    async createTeacher(input) {
      await gate('createTeacher')
      if (state.teachers.some((t) => t.email === input.email)) {
        throw new AdminError('PT409', 'this person is already a teacher')
      }
      checkLocations(input.locationIds)
      if (!input.phone || input.phone.trim() === '')
        throw new AdminError('PT400', 'a teacher needs a phone number')
      const phone = normalizePhone(input.phone)
      if (!phone) throw new AdminError('PT400', 'invalid phone number')
      state.teachers.push({
        id: nextId('t'),
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        isActive: true,
        hasSignedIn: false,
        isAdmin: false,
        erased: false,
        subjectIds: [...input.subjectIds],
        locationIds: [...new Set(input.locationIds)],
        phone,
      })
    },
    async setPersonPhone(profileId, phone) {
      await gate('setPersonPhone')
      const teacher = state.teachers.find((t) => t.id === profileId)
      if (!teacher) throw new AdminError('PT404', 'person not found')
      if (teacher.erased) throw new AdminError('PT409', 'this person was erased')
      if (!phone || phone.trim() === '')
        throw new AdminError('PT409', 'a teacher or parent needs a phone number')
      const normal = normalizePhone(phone)
      if (!normal) throw new AdminError('PT400', 'invalid phone number')
      teacher.phone = normal
    },
    async setTeacherLocations(teacherId, locationIds) {
      await gate('setTeacherLocations')
      const teacher = state.teachers.find((t) => t.id === teacherId)
      if (!teacher) throw new AdminError('PT404', 'teacher not found')
      if (teacher.erased) throw new AdminError('PT409', 'this teacher was erased')
      checkLocations(locationIds)
      const wanted = new Set(locationIds)
      const removed = teacher.locationIds.filter((id) => !wanted.has(id))
      const blocking = (state.blockers[teacherId] ?? []).filter((b) =>
        removed.includes(b.locationId),
      )
      if (blocking.length > 0) {
        throw new AdminError(
          'PT409',
          'this teacher still has lessons or free slots at this location',
          JSON.stringify({
            total: blocking.length,
            lessons: blocking.slice(0, 20).map((b) => ({
              id: b.id,
              location_id: b.locationId,
              start_at: b.start,
              end_at: b.end,
              status: b.status,
            })),
          }),
        )
      }
      teacher.locationIds = [...wanted]
    },
    async setTeacherSubjects(teacherId, subjectIds) {
      await gate('setTeacherSubjects')
      const teacher = state.teachers.find((t) => t.id === teacherId)
      if (!teacher) throw new AdminError('PT404')
      teacher.subjectIds = [...subjectIds]
    },
    async changeEmail(profileId, email) {
      await gate('changeEmail')
      const teacher = state.teachers.find((t) => t.id === profileId)
      if (!teacher) throw new AdminError('PT404')
      if (teacher.erased) throw new AdminError('PT409', 'this person was erased')
      if (state.teachers.some((t) => t.id !== profileId && t.email === email)) {
        throw new AdminError('PT409', 'this email already belongs to another person')
      }
      teacher.email = email
      teacher.hasSignedIn = false
    },
    async teacherImpact(teacherId) {
      await gate('teacherImpact')
      return state.impact[teacherId] ?? { futureLessons: 0, students: 0, pendingRequests: 0 }
    },
    async deactivateTeacher(teacherId) {
      await gate('deactivateTeacher')
      const teacher = state.teachers.find((t) => t.id === teacherId)
      if (!teacher) throw new AdminError('PT404')
      if (!teacher.isActive) throw new AdminError('PT409', 'the teacher is already deactivated')
      teacher.isActive = false
    },
    async reactivateTeacher(teacherId) {
      await gate('reactivateTeacher')
      const teacher = state.teachers.find((t) => t.id === teacherId)
      if (!teacher) throw new AdminError('PT404')
      if (teacher.erased) throw new AdminError('PT409', 'this person was erased')
      if (teacher.isActive) throw new AdminError('PT409', 'the teacher is already active')
      teacher.isActive = true
    },
    async eraseTeacher(teacherId): Promise<EraseResult> {
      await gate('eraseTeacher')
      const teacher = state.teachers.find((t) => t.id === teacherId)
      if (!teacher) throw new AdminError('PT404')
      if (teacher.isAdmin) throw new AdminError('PT409', 'an administrator cannot be erased')
      if (teacher.erased) throw new AdminError('PT409', 'this person was already erased')
      state.takeovers = state.takeovers.filter((q) => q.teacher.id !== teacherId)
      if (state.history[teacherId]) {
        Object.assign(teacher, {
          email: `erased-${teacherId}@erased.invalid`,
          isActive: false,
          hasSignedIn: false,
          erased: true,
          phone: null,
          subjectIds: [],
        })
        return 'kept_history'
      }
      state.teachers = state.teachers.filter((t) => t.id !== teacherId)
      return 'deleted'
    },

    async listLocations() {
      await gate('listLocations')
      return state.locations.map((l) => ({ ...l, rooms: [...l.rooms], photos: [...l.photos] }))
    },
    async addLocation(input) {
      await gate('addLocation')
      if (state.locations.some((l) => l.name.toLowerCase() === input.name.toLowerCase()))
        throw duplicate()
      state.locations.push({ id: nextId('l'), ...input, rooms: [], photos: [] })
    },
    async updateLocation(id, input) {
      await gate('updateLocation')
      if (
        state.locations.some(
          (l) => l.id !== id && l.name.toLowerCase() === input.name.toLowerCase(),
        )
      )
        throw duplicate()
      const location = state.locations.find((l) => l.id === id)
      if (!location) throw new AdminError('PT404')
      Object.assign(location, input)
    },
    async deleteLocation(id) {
      await gate('deleteLocation')
      const location = state.locations.find((l) => l.id === id)
      if (location && location.rooms.length > 0) throw new AdminError('23503')
      // a location is taken from the teachers who may use it, unless it is the only one of somebody
      const stranded = state.teachers.some(
        (t) => !t.erased && t.locationIds.length === 1 && t.locationIds[0] === id,
      )
      if (stranded) throw new AdminError('PT409', 'a teacher needs at least one location')
      for (const teacher of state.teachers)
        teacher.locationIds = teacher.locationIds.filter((l) => l !== id)
      state.locations = state.locations.filter((l) => l.id !== id)
    },
    async addRoom(locationId, name) {
      await gate('addRoom')
      const location = state.locations.find((l) => l.id === locationId)
      if (!location) throw new AdminError('PT404')
      if (location.rooms.some((r) => r.name.toLowerCase() === name.toLowerCase())) throw duplicate()
      location.rooms.push({ id: nextId('r'), name })
    },
    async renameRoom(id, name) {
      await gate('renameRoom')
      const target = room(id)
      if (!target) throw new AdminError('PT404')
      target.name = name
    },
    async deleteRoom(id) {
      await gate('deleteRoom')
      for (const location of state.locations)
        location.rooms = location.rooms.filter((r) => r.id !== id)
    },
    async addPhoto(locationId) {
      await gate('addPhoto')
      const location = state.locations.find((l) => l.id === locationId)
      if (!location) throw new AdminError('PT404')
      const taken = location.photos.map((p) => p.position)
      const position = [1, 2, 3].find((p) => !taken.includes(p))
      if (!position) throw new AdminError('photoLimit')
      location.photos.push({ id: nextId('ph'), path: `${locationId}/${nextId('f')}.jpg`, position })
    },
    async removePhoto(photo: Photo) {
      await gate('removePhoto')
      for (const location of state.locations)
        location.photos = location.photos.filter((p) => p.id !== photo.id)
    },
    async photoUrls(paths) {
      await gate('photoUrls')
      return Object.fromEntries(paths.map((path) => [path, `https://signed.example.test/${path}`]))
    },

    async listStudents() {
      await gate('listStudents')
      return structuredClone(state.students)
    },
    async deleteStudent(studentId) {
      await gate('deleteStudent')
      const student = state.students.find((s) => s.studentId === studentId)
      if (!student) throw new AdminError('PT404', 'student not found')
      if (student.heldLessons > 0)
        throw new AdminError('PT409', 'a student with a lesson that took place cannot be deleted')
      state.students = state.students.filter((s) => s.studentId !== studentId)
    },

    async listTakeovers() {
      await gate('listTakeovers')
      return [...state.takeovers]
    },
    async approveTakeover(requestId) {
      await gate('approveTakeover')
      const request = state.takeovers.find((q) => q.id === requestId)
      if (!request) throw new AdminError('PT404')
      // approving closes the competing requests for the same student
      state.takeovers = state.takeovers.filter((q) => q.student.id !== request.student.id)
    },
    async rejectTakeover(requestId) {
      await gate('rejectTakeover')
      state.takeovers = state.takeovers.filter((q) => q.id !== requestId)
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
    ...(wrapped as unknown as AdminApi),
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
