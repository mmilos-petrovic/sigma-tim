/** What the sign-up screens need from the backend. The Supabase version is `supabaseEnrolmentApi.ts`; tests use a fake. */

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

export type RequestStatus = 'open' | 'chosen' | 'rejected'

/** One sign-up of the signed-in person, as the screen of the applicant shows it. */
export interface MyEnrolmentRequest {
  id: string
  role: ApplicantRole
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
  situation: string | null
}

/** The profile as the form sends it. The phone is in the international form (see `lib/phone.ts`). */
export interface EnrolmentProfileInput {
  firstName: string
  lastName: string
  phone: string
  school: string
  grade: string
  cityPart: string
  situation: string
  /** The privacy policy was accepted (a parent accepts it for the child). */
  consent: boolean
}

export const PROFILE_LIMITS = {
  name: 100,
  school: 200,
  grade: 50,
  cityPart: 100,
  situation: 1000,
} as const

export interface EnrolmentApi {
  /** Open to everybody, signed in or not. */
  getFormInfo(): Promise<EnrolmentFormInfo>
  /**
   * Called for a signed-in Google account right after the form's sign-in. Makes the profile of an account the school
   * does not know yet, and the request; asking again for the same thing returns the same request.
   */
  startEnrolment(subjectId: string, role: ApplicantRole): Promise<string>
  myRequests(): Promise<MyEnrolmentRequest[]>
  /** Fills in the profile, or changes it until a teacher is chosen. Once complete, the teachers of the subject see the request. */
  completeProfile(requestId: string, input: EnrolmentProfileInput): Promise<void>
}
