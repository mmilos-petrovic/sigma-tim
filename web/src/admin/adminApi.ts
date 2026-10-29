/** Everything the administration screens need from the backend. The Supabase version is `supabaseAdminApi.ts`; tests use a fake. */

export interface Subject {
  id: string
  name: string
  /** How many teachers teach it. */
  teacherCount: number
}

export interface TeacherRow {
  /** The teacher's profile id. */
  id: string
  email: string
  firstName: string
  lastName: string
  isActive: boolean
  /** False until the person has signed in with Google for the first time. */
  hasSignedIn: boolean
  subjectIds: string[]
}

export interface Room {
  id: string
  name: string
}

export interface Photo {
  id: string
  /** Object path in the `location-photos` bucket. */
  path: string
  position: number
}

export interface LocationRow {
  id: string
  name: string
  address: string
  rooms: Room[]
  photos: Photo[]
}

export interface TakeoverRow {
  id: string
  createdAt: string
  student: {
    id: string
    firstName: string
    lastName: string
    school: string | null
    grade: string | null
    section: string | null
  }
  teacher: { id: string; firstName: string; lastName: string }
}

/** What deactivating a teacher will do, shown before the admin confirms. */
export interface TeacherImpact {
  futureLessons: number
  students: number
  pendingRequests: number
}

export const MAX_LOCATION_PHOTOS = 3

export interface AdminApi {
  listSubjects(): Promise<Subject[]>
  addSubject(name: string): Promise<void>
  renameSubject(id: string, name: string): Promise<void>
  deleteSubject(id: string): Promise<void>

  listTeachers(): Promise<TeacherRow[]>
  createTeacher(input: {
    email: string
    firstName: string
    lastName: string
    subjectIds: string[]
  }): Promise<void>
  setTeacherSubjects(teacherId: string, subjectIds: string[]): Promise<void>
  changeEmail(profileId: string, email: string): Promise<void>
  teacherImpact(teacherId: string): Promise<TeacherImpact>
  deactivateTeacher(teacherId: string): Promise<void>
  reactivateTeacher(teacherId: string): Promise<void>

  listLocations(): Promise<LocationRow[]>
  addLocation(input: { name: string; address: string }): Promise<void>
  updateLocation(id: string, input: { name: string; address: string }): Promise<void>
  deleteLocation(id: string): Promise<void>
  addRoom(locationId: string, name: string): Promise<void>
  renameRoom(id: string, name: string): Promise<void>
  deleteRoom(id: string): Promise<void>
  addPhoto(locationId: string, image: Blob): Promise<void>
  removePhoto(photo: Photo): Promise<void>
  /** Short-lived links for the given object paths. */
  photoUrls(paths: string[]): Promise<Record<string, string>>

  listTakeovers(): Promise<TakeoverRow[]>
  approveTakeover(requestId: string): Promise<void>
  rejectTakeover(requestId: string): Promise<void>
}

/**
 * A failed request. `code` is the PostgREST code (`PT400`..`PT409`, or a Postgres code such as `23503`), or one of
 * `network`, `expired`, `unknown`, or a client-side `photo...` code. The message is for developers.
 */
export class AdminError extends Error {
  readonly code: string

  constructor(code: string, message = code) {
    super(message)
    this.name = 'AdminError'
    this.code = code
  }
}

export type ActionKey =
  | 'load'
  | 'createTeacher'
  | 'setSubjects'
  | 'changeEmail'
  | 'deactivateTeacher'
  | 'reactivateTeacher'
  | 'addSubject'
  | 'renameSubject'
  | 'deleteSubject'
  | 'addLocation'
  | 'updateLocation'
  | 'deleteLocation'
  | 'addRoom'
  | 'renameRoom'
  | 'deleteRoom'
  | 'addPhoto'
  | 'removePhoto'
  | 'approveTakeover'
  | 'rejectTakeover'
  // the teacher's screens share the error texts and the dialogs
  | 'addStudent'
  | 'updateStudent'
  | 'changeStudentEmail'
  | 'renamePerson'
  | 'addParent'
  | 'removeParent'
  | 'requestTakeover'
  | 'scheduleLesson'
  | 'updateLesson'
  | 'setLessonStudents'
  | 'cancelLesson'
  | 'publishSlot'
  | 'confirmBooking'
  | 'declineBooking'
  | 'setNote'
  | 'setOutcome'
