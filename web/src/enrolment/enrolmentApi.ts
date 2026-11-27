/**
 * What the sign-up screens need from the backend: the form of the front page, the person who signs up, the teachers who
 * offer and the administrator. The Supabase version is `supabaseEnrolmentApi.ts`; tests use a fake.
 */
import type { CvData } from '../cv/cvApi'

export type ApplicantRole = 'student' | 'parent'

export const APPLICANT_ROLES: readonly ApplicantRole[] = ['student', 'parent']

export interface FormSubject {
  id: string
  name: string
}

/** What the form on the front page needs: whether the school takes sign-ups, and the subjects somebody teaches (most teachers first). */
export interface EnrolmentFormInfo {
  enabled: boolean
  subjects: FormSubject[]
}

/** open: waiting for offers or a choice. chosen: a parent chose and the teacher has to give the child's email. assigned: done. */
export type RequestStatus = 'open' | 'chosen' | 'assigned' | 'rejected'

/** signup: the person signed up. teacher: a teacher added a student nobody teaches. legacy: a student a teacher left behind. */
export type RequestSource = 'signup' | 'teacher' | 'legacy'

/** One sign-up of the signed-in person, as the screen of the applicant shows it. */
export interface MyEnrolmentRequest {
  id: string
  role: ApplicantRole
  source: RequestSource
  status: RequestStatus
  subjectId: string | null
  subjectName: string | null
  /** False until the profile (name, phone, school, grade, consent) is filled in. */
  profileCompleted: boolean
  /** Complete, but past the daily cap: teachers see it only after the administrator approves. */
  waitingForApproval: boolean
  /** What was typed in the profile, null until then. The first and last name are the student's. */
  studentFirstName: string | null
  studentLastName: string | null
  contactPhone: string | null
  school: string | null
  grade: string | null
  cityPart: string | null
  /** Who teaches the student at school, when they said. */
  schoolTeacher: string | null
  situation: string | null
  /** How many active teachers offered. */
  offersCount: number
  chosenTeacherId: string | null
}

/** A teacher who offered, with what the person needs to decide: the phone and, when there is one, the CV. */
export interface OfferRow {
  teacherId: string
  firstName: string
  lastName: string
  phone: string | null
  subjects: string[]
  cvSlug: string | null
  photoPath: string | null
  offeredAt: string
  isChosen: boolean
}

/** `assigned`: the person is a student of the teacher now. `chosen`: a parent chose; the teacher has to give the child's email. */
export type ChooseResult = 'assigned' | 'chosen'

/** What a teacher sees of a request for a subject they teach. */
export interface PoolRow {
  requestId: string
  role: ApplicantRole
  source: RequestSource
  subjectId: string | null
  subjectName: string | null
  firstName: string
  lastName: string
  /** The email of the person who signed up (a parent's, when a parent did). */
  email: string
  phone: string
  school: string
  grade: string
  cityPart: string | null
  /** Who teaches the student at school, when they said. */
  schoolTeacher: string | null
  situation: string | null
  listedAt: string
  daysWaiting: number
  /** The calling teacher has offered. */
  offered: boolean
}

/** A request a parent made, in which this teacher was chosen and still has to say the email of the child. */
export interface ChosenRow {
  requestId: string
  subjectName: string | null
  firstName: string
  lastName: string
  email: string
  phone: string
  school: string
  grade: string
  chosenAt: string
}

/** A student nobody teaches yet, as a teacher adds one. The phone is in the international form. */
export interface UnassignedStudentInput {
  email: string
  firstName: string
  lastName: string
  phone: string
  subjectId: string
  school: string
  grade: string
  cityPart: string
  situation: string
}

export interface EnrolmentSettings {
  /** The form of the front page is shown and takes sign-ups. */
  formEnabled: boolean
  /** Sign-ups a day (school time) that go straight to the teachers; later ones wait for the administrator. */
  dailyCap: number
}

export const SETTINGS_LIMITS = {
  dailyCap: { min: 1, max: 1000 },
} as const

/** Where a request is, for the administrator's list. */
export type AdminState =
  'needs_approval' | 'incomplete' | 'open' | 'chosen' | 'assigned' | 'rejected'

export interface AdminEnrolmentRow {
  requestId: string
  role: ApplicantRole
  source: RequestSource
  state: AdminState
  subjectName: string | null
  firstName: string | null
  lastName: string | null
  email: string
  phone: string | null
  school: string | null
  grade: string | null
  cityPart: string | null
  /** Who teaches the student at school, when they said. */
  schoolTeacher: string | null
  situation: string | null
  createdAt: string
  listedAt: string | null
  daysWaiting: number
  chosenTeacherId: string | null
  offers: { teacherId: string; name: string; offeredAt: string }[]
}

/** The profile as the form sends it. The phone is in the international form (see `lib/phone.ts`). */
export interface EnrolmentProfileInput {
  firstName: string
  lastName: string
  phone: string
  school: string
  grade: string
  cityPart: string
  schoolTeacher: string
  situation: string
  /** The privacy policy was accepted (a parent accepts it for the child). */
  consent: boolean
}

export const PROFILE_LIMITS = {
  name: 100,
  school: 200,
  grade: 50,
  cityPart: 100,
  schoolTeacher: 100,
  situation: 1000,
} as const

export interface EnrolmentApi {
  /** Open to everybody, signed in or not. */
  getFormInfo(): Promise<EnrolmentFormInfo>
  /**
   * Called for a signed-in Google account right after the form's sign-in. Makes the profile of an account the school
   * does not know yet, and the request; asking again for the same thing returns the same request.
   */
  startEnrolment(subjectId: string, role: ApplicantRole, childId?: string): Promise<string>
  myRequests(): Promise<MyEnrolmentRequest[]>
  /** Fills in the profile, or changes it until a teacher is chosen. Once complete, the teachers of the subject see the request. */
  completeProfile(requestId: string, input: EnrolmentProfileInput): Promise<void>

  // the person who signed up, or a parent
  /** The teachers who offered, the first one first. */
  myOffers(requestId: string): Promise<OfferRow[]>
  /** The CV of a teacher who offered: it cannot be hidden from the person who has to choose. Null when there is none. */
  getOfferedCv(requestId: string, teacherId: string): Promise<CvData | null>
  /** Chooses one of the teachers who offered; refused (`PT409`) until the choice is open. */
  chooseTeacher(requestId: string, teacherId: string): Promise<ChooseResult>
  /** For a student a teacher left behind without a subject: says which one they want. */
  setSubject(requestId: string, subjectId: string): Promise<void>
  /** Deletes a request that still waits (a teacher not placed yet), with its offers; a new one can be made then. */
  cancelRequest(requestId: string): Promise<void>

  // a teacher
  /** The requests for the teachers' subjects, the newest first. */
  listPool(): Promise<PoolRow[]>
  /** Offers to teach; refused (`PT409`) until the teacher's CV has its "about" text. */
  offer(requestId: string): Promise<void>
  withdrawOffer(requestId: string): Promise<void>
  listChosen(): Promise<ChosenRow[]>
  /** The teacher a parent chose gives the child's email, which makes the child a student. */
  completeChosen(requestId: string, childEmail: string): Promise<void>
  /** Adds a student nobody teaches yet; the student goes to the pool. Returns the request's id. */
  addUnassignedStudent(input: UnassignedStudentInput): Promise<string>

  // the administrator
  getSettings(): Promise<EnrolmentSettings>
  saveSettings(settings: EnrolmentSettings): Promise<void>
  /** Every request, the newest first (at most 500). */
  listAll(): Promise<AdminEnrolmentRow[]>
  approve(requestId: string): Promise<void>
  /** Turns a sign-up down. Refused (`PT404`) for a request that has a student record already. */
  reject(requestId: string): Promise<void>
  /** Places any active teacher at any moment; a parent's request needs the child's email. Returns `assigned` or `chosen`. */
  assign(requestId: string, teacherId: string, childEmail: string | null): Promise<ChooseResult>
}
