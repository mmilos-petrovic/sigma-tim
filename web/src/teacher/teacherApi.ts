/** Everything the teacher's screens need from the backend. The Supabase version is `supabaseTeacherApi.ts`; tests use a fake. */

/** A student has at most two parents (a database rule, mirrored here to hide the button). */
export const MAX_PARENTS = 2

export interface ParentRow {
  /** The parent's profile id. */
  id: string
  email: string
  firstName: string
  lastName: string
  /** False until the person has signed in with Google for the first time. */
  hasSignedIn: boolean
}

export interface StudentRow {
  /** The student record (one per teacher). */
  id: string
  /** The person; names are changed on the profile. */
  profileId: string
  email: string
  firstName: string
  lastName: string
  hasSignedIn: boolean
  school: string | null
  grade: string | null
  section: string | null
  parents: ParentRow[]
}

/** A student without a teacher, visible to every teacher. */
export interface UnassignedStudent {
  id: string
  email: string
  firstName: string
  lastName: string
  school: string | null
  grade: string | null
  section: string | null
  /** The caller has already asked for this student. */
  requested: boolean
}

export interface PersonInput {
  email: string
  firstName: string
  lastName: string
}

export interface StudentDetails {
  school: string | null
  grade: string | null
  section: string | null
}

export interface StudentInput extends PersonInput, StudentDetails {}

// Lessons ---------------------------------------------------------------------------------------------------------

/** A free slot is 45 or 60 minutes (a database rule). */
export const SLOT_MINUTES = [45, 60] as const
export type SlotMinutes = (typeof SLOT_MINUTES)[number]

/** At most four students in one lesson (the database's `max_lesson_students()`). */
export const MAX_LESSON_STUDENTS = 4

export interface Option {
  id: string
  name: string
}

export interface LocationOption extends Option {
  rooms: Option[]
}

export interface Colleague {
  id: string
  firstName: string
  lastName: string
}

/** What the lesson forms choose from. */
export interface Reference {
  /** Only the subjects this teacher teaches. */
  subjects: Option[]
  locations: LocationOption[]
  /** The other teachers, to name the blocks of their calendars. */
  colleagues: Colleague[]
}

/**
 * `open` is a free slot, `pending` a booking made less than 12 hours ahead that waits for the teacher, `confirmed` a
 * lesson. A slot that was booked keeps `origin: 'slot'`: cancelling it frees the slot instead of deleting it.
 */
export type LessonStatus = 'open' | 'pending' | 'confirmed'
export type LessonOrigin = 'teacher' | 'slot'
export type Outcome = 'held' | 'not_held'

export interface Participant {
  studentId: string
  note: string | null
}

export interface LessonRow {
  id: string
  subjectId: string
  locationId: string
  roomId: string | null
  /** ISO instants. */
  start: string
  end: string
  status: LessonStatus
  origin: LessonOrigin
  outcome: Outcome | null
  participants: Participant[]
}

/** A colleague's lesson as the calendar may show it: when, where, whose. Never subject or students. */
export interface BusyRow {
  teacherId: string
  locationId: string
  roomId: string | null
  start: string
  end: string
}

/** An overlap with an existing lesson. A warning only: nothing is ever blocked because of it. */
export interface Conflict {
  teacherId: string
  roomId: string | null
  start: string
  end: string
  sameTeacher: boolean
  sameRoom: boolean
}

export interface TimeRange {
  start: string
  end: string
}

export interface LessonInput extends TimeRange {
  subjectId: string
  locationId: string
  roomId: string | null
}

export interface ScheduleInput extends LessonInput {
  studentIds: string[]
}

export interface SlotInput {
  /** The publishing teacher. */
  teacherId: string
  subjectId: string
  locationId: string
  roomId: string | null
  /** ISO instant. */
  start: string
  minutes: SlotMinutes
}

export interface ConflictQuery extends TimeRange {
  teacherId: string
  roomId: string | null
  /** The lesson being edited, which does not conflict with itself. */
  excludeLessonId?: string
}

export interface TeacherApi {
  /** The students of this teacher, with their parents. */
  listStudents(teacherId: string): Promise<StudentRow[]>
  /** Students nobody teaches. */
  listUnassigned(teacherId: string): Promise<UnassignedStudent[]>

  /** Adds a student to the calling teacher. Returns the new student's id. */
  addStudent(input: StudentInput): Promise<string>
  updateStudentDetails(studentId: string, details: StudentDetails): Promise<void>
  /** Corrects a name (never an email) of a student or of a student's parent. */
  renamePerson(profileId: string, firstName: string, lastName: string): Promise<void>
  /**
   * Corrects the email of one of the teacher's students. The old Google account loses access at once. Refused (`PT409`)
   * for a person who is also connected to another teacher: the administrator does that.
   */
  changeStudentEmail(studentId: string, email: string): Promise<void>
  /** Links a parent by email; an existing parent is reused. */
  addParent(studentId: string, input: PersonInput): Promise<void>
  removeParent(studentId: string, parentId: string): Promise<void>
  requestTakeover(studentId: string): Promise<void>

  reference(teacherId: string): Promise<Reference>
  /** The teacher's own lessons and free slots that overlap the range. */
  listLessons(range: TimeRange, teacherId: string): Promise<LessonRow[]>
  /** Late bookings that wait for an answer, whenever they are. */
  listPending(teacherId: string): Promise<LessonRow[]>
  /** Colleagues' lessons that overlap the range (the caller's own are left out). */
  listBusy(range: TimeRange, teacherId: string): Promise<BusyRow[]>
  findConflicts(query: ConflictQuery): Promise<Conflict[]>

  /** Schedules a confirmed lesson. Returns its id. */
  scheduleLesson(input: ScheduleInput): Promise<string>
  /** Changes subject, place or time. Refused once the day of the lesson is over or an outcome is recorded. */
  updateLesson(lessonId: string, patch: Partial<LessonInput>): Promise<void>
  /** Replaces who attends (1 to 4 of the teacher's students). Notes of students who stay are kept. */
  setLessonStudents(lessonId: string, studentIds: string[]): Promise<void>
  /** Deletes a lesson, removes a free slot, or frees a booked slot. Only before the start. */
  cancelLesson(lessonId: string): Promise<void>
  publishSlot(input: SlotInput): Promise<void>
  confirmBooking(lessonId: string): Promise<void>
  declineBooking(lessonId: string): Promise<void>
  setNote(lessonId: string, studentId: string, note: string | null): Promise<void>
  /** Records what happened; only after a confirmed lesson has ended. `null` clears it. */
  setOutcome(lessonId: string, outcome: Outcome | null): Promise<void>
}
