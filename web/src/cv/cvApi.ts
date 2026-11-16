/** What the screens that show teachers' CVs need from the backend. The Supabase version is `supabaseCvApi.ts`; tests use a fake. */

export interface CvExperience {
  employer: string
  position: string
  period: string | null
  description: string | null
}

export interface CvEducation {
  institution: string
  degree: string | null
  period: string | null
}

/** One line of the list of CVs. */
export interface CvSummary {
  /** The stable public link: `/nastavnici/<slug>`. */
  slug: string
  firstName: string
  lastName: string
  about: string | null
  /** A file name inside the public `cv-photos` bucket. */
  photoPath: string | null
  subjects: string[]
}

/** A whole CV, as everybody who may read it sees it. */
export interface CvData extends CvSummary {
  experience: CvExperience[]
  education: CvEducation[]
  skills: string[]
}

export interface CvApi {
  /** The CVs a signed-in person may read: those shared with signed-in users, and the own teacher's CV for a student or a parent. */
  listMemberCvs(): Promise<CvSummary[]>
  /** One CV by its link, or null when there is none for this person (not shared, switched off, a deactivated teacher). */
  getMemberCv(slug: string): Promise<CvData | null>
  /** The CVs with the switch "javno" on: what a visitor who has not signed in may read. */
  listPublicCvs(): Promise<CvSummary[]>
  /** One public CV by its link, or null when there is none (hidden, unknown, a deactivated teacher). */
  getPublicCv(slug: string): Promise<CvData | null>
  /** The address of a photo; the bucket is public, so no sign-in is needed to load it. */
  photoUrl(path: string): string
}

/** The limits the database enforces; the editor mirrors them to say so before saving. */
export const CV_LIMITS = {
  about: 2000,
  entries: 20,
  skills: 50,
  employer: 200,
  position: 200,
  period: 100,
  description: 1000,
  institution: 200,
  degree: 200,
  skill: 100,
} as const
