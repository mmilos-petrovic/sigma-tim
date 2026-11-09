/** Everything the screens of a student and a parent need from the backend. The Supabase version is `supabaseStudentApi.ts`; tests use a fake. */

export type StudentContext = 'student' | 'parent'

/** `pending`: a late booking that waits for the teacher. Free slots are not lessons and have their own type. */
export type LessonStatus = 'pending' | 'confirmed'

/** What the teacher recorded after the lesson. Students never learn that the option exists: it only shapes the label. */
export type Outcome = 'held' | 'not_held'

/** Where a lesson came from: `slot` lessons go back to being free slots when the booking is cancelled. */
export type LessonOrigin = 'teacher' | 'slot'

/** One student record the signed-in person looks at: their own, or one of their children's. */
export interface StudentRecord {
  /** The student record (one per teacher). */
  id: string
  /** The student's name. */
  name: string
  /** The current teacher; null for a student nobody teaches (history only, no booking). */
  teacherId: string | null
  teacherName: string | null
}

export interface MyLesson {
  id: string
  start: string
  end: string
  status: LessonStatus
  outcome: Outcome | null
  origin: LessonOrigin
  subject: string
  location: string
  address: string
  room: string | null
  teacherId: string
  /** Null when the database does not show the teacher's name. */
  teacherName: string | null
  /** The teacher's note for this student; null when there is none. */
  note: string | null
  /** The teacher marked that this student has paid for the lesson. */
  paid: boolean
}

export interface LessonPage {
  lessons: MyLesson[]
  /** There are older lessons than the ones returned. */
  hasMore: boolean
}

export interface OpenSlot {
  id: string
  start: string
  end: string
  subject: string
  location: string
  address: string
  room: string | null
}

export interface StudentApi {
  /** The records the person looks at: their own (student) or their children's (parent), by name. */
  listRecords(context: StudentContext, profileId: string): Promise<StudentRecord[]>
  /** Lessons that have not ended yet (including one that is going on), soonest first. */
  listUpcoming(studentId: string, now: string): Promise<MyLesson[]>
  /** Lessons that have ended, newest first, at most `limit`. */
  listPast(studentId: string, now: string, limit: number): Promise<LessonPage>
  /** The teacher's free slots that have not started, soonest first. */
  listSlots(teacherId: string, now: string): Promise<OpenSlot[]>
  /** The current teacher's phone number; null when the teacher has not given one. */
  teacherPhone(teacherId: string): Promise<string | null>
  /** Books a free slot for one student; `pending` means the teacher still has to confirm it. */
  claimSlot(slotId: string, studentId: string): Promise<LessonStatus>
  /**
   * Cancels a booking or lesson of this person (or leaves it, when others attend). The optional reason is sent to the
   * teacher in the notification.
   */
  cancelLesson(lessonId: string, reason?: string | null): Promise<void>
}

/** Past lessons shown at first, and added by each "Prikaži starije". */
export const PAST_PAGE_SIZE = 20

/** A booking made less than this many hours ahead waits for the teacher (the database's rule). */
export const LATE_BOOKING_HOURS = 12
