import { APPLICANT_ROLES, type ApplicantRole } from './enrolmentApi'

// The form is filled in before signing in, and Google sends the person back to the sign-in page, so what they chose waits
// in sessionStorage (the same way as the page they wanted to open, see `auth/returnTo.ts`).
const KEY = 'sigma.enrolment'

export interface PendingEnrolment {
  subjectId: string
  role: ApplicantRole
}

export function savePendingEnrolment(pending: PendingEnrolment): void {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(pending))
  } catch {
    // Without storage the person finds the choice gone after Google and fills in the form again.
  }
}

/** Reads without removing, so it is safe to call while rendering. Anything that is not a valid choice is null. */
export function peekPendingEnrolment(): PendingEnrolment | null {
  try {
    const raw = window.sessionStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Record<string, unknown>
    const { subjectId, role } = value
    if (typeof subjectId !== 'string' || subjectId === '') return null
    if (!APPLICANT_ROLES.includes(role as ApplicantRole)) return null
    return { subjectId, role: role as ApplicantRole }
  } catch {
    return null
  }
}

export function clearPendingEnrolment(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clean up
  }
}
