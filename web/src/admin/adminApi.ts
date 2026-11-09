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
  /** An administrator who also teaches: never erased from here. */
  isAdmin: boolean
  /**
   * An erased account that stays only as the record behind lessons that took place: the name is kept, the email is a
   * placeholder and nothing else is left. It cannot be reactivated or edited.
   */
  erased: boolean
  subjectIds: string[]
  /** The locations where the teacher may hold lessons (a database rule). */
  locationIds: string[]
  /** In the international form; null for a teacher who has not given one yet. */
  phone: string | null
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

/** `deleted`: nothing is left. `kept_history`: the name stays as a record behind lessons that already started. */
export type EraseResult = 'deleted' | 'kept_history'

/** One student record (a person with one teacher) as the administrator's list shows it. */
export interface AdminStudentRow {
  studentId: string
  /** The person; a person who studies with two teachers has two records. */
  profileId: string
  firstName: string
  lastName: string
  email: string
  /** When the record was added (an ISO instant). */
  createdAt: string
  teacherId: string | null
  /** Null for a student nobody teaches. */
  teacherName: string | null
  parentNames: string[]
  /** The locations of this record's lessons, past or still to come, each once. */
  locationNames: string[]
  /** Lessons recorded as held. With one, the record can never be deleted. */
  heldLessons: number
  /** Lessons that have not started yet. */
  upcomingLessons: number
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
    locationIds: string[]
    phone: string
  }): Promise<void>
  /** Sets anybody's number. `null` takes it away, which the database refuses for a teacher. */
  setPersonPhone(profileId: string, phone: string | null): Promise<void>
  setTeacherSubjects(teacherId: string, subjectIds: string[]): Promise<void>
  /**
   * Replaces the locations where the teacher may hold lessons. Refused with `PT409` (and the lessons in the error's
   * `details`, see `locationBlockers.ts`) while they have a lesson or free slot to come at a location that would go.
   */
  setTeacherLocations(teacherId: string, locationIds: string[]): Promise<void>
  changeEmail(profileId: string, email: string): Promise<void>
  teacherImpact(teacherId: string): Promise<TeacherImpact>
  deactivateTeacher(teacherId: string): Promise<void>
  reactivateTeacher(teacherId: string): Promise<void>
  /** Erases the whole profile (also the person's student and parent roles); lessons that started are kept. */
  eraseTeacher(teacherId: string): Promise<EraseResult>

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

  /** Every student record, the one added last first. */
  listStudents(): Promise<AdminStudentRow[]>
  /**
   * Deletes one student record. Refused (`PT409`) when the student has a lesson recorded as held; lessons still to
   * come are cancelled and the others on them are told.
   */
  deleteStudent(studentId: string): Promise<void>

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
  /** The database's extra detail of the error, when it sent one (see `locationBlockers.ts`). */
  readonly details?: string

  constructor(code: string, message = code, details?: string) {
    super(message)
    this.name = 'AdminError'
    this.code = code
    this.details = details
  }
}

export type ActionKey =
  | 'load'
  | 'createTeacher'
  | 'setSubjects'
  | 'setLocations'
  | 'setPhone'
  | 'changeEmail'
  | 'deactivateTeacher'
  | 'reactivateTeacher'
  | 'eraseTeacher'
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
  | 'claimSlot'
  | 'publishSlot'
  | 'confirmBooking'
  | 'declineBooking'
  | 'setNote'
  | 'setOutcome'
  | 'setPaid'
  | 'deleteStudent'
  | 'setColor'
