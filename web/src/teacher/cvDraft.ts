import type { CvInput, EducationInput, ExperienceInput, MyCv } from './teacherApi'

export const NO_CV: CvInput = {
  about: '',
  showPublic: false,
  showMembers: false,
  experience: [],
  education: [],
  skills: [],
}

/** A row of a list with a key of its own, so that moving and removing rows keeps what was typed in the right row. */
export interface Keyed<T> {
  key: number
  value: T
}

export interface Draft {
  about: string
  showPublic: boolean
  showMembers: boolean
  experience: Keyed<ExperienceInput>[]
  education: Keyed<EducationInput>[]
  skills: Keyed<string>[]
}

export const BLANK_EXPERIENCE: ExperienceInput = {
  employer: '',
  position: '',
  period: '',
  description: '',
}
export const BLANK_EDUCATION: EducationInput = { institution: '', degree: '', period: '' }

export function toInput(draft: Draft): CvInput {
  return {
    about: draft.about.trim(),
    showPublic: draft.showPublic,
    showMembers: draft.showMembers,
    experience: draft.experience.map((row) => row.value),
    education: draft.education.map((row) => row.value),
    skills: draft.skills.map((row) => row.value.trim()).filter((skill) => skill !== ''),
  }
}

/** What is saved, without the parts the editor does not edit. */
export const asInput = (cv: MyCv | null): CvInput =>
  cv
    ? {
        about: cv.about,
        showPublic: cv.showPublic,
        showMembers: cv.showMembers,
        experience: cv.experience,
        education: cv.education,
        skills: cv.skills,
      }
    : NO_CV

/** The message for the first thing that is wrong, or null. The database refuses the same things. */
export function cvProblem(input: CvInput): string | null {
  if ((input.showPublic || input.showMembers) && input.about.trim() === '') {
    return 'Upišite tekst „O meni“ da bi CV mogao da bude vidljiv.'
  }
  const job = input.experience.findIndex((e) => !e.employer.trim() || !e.position.trim())
  if (job >= 0) return `Radno iskustvo ${job + 1}: upišite poslodavca i poziciju.`
  const school = input.education.findIndex((e) => !e.institution.trim())
  if (school >= 0) return `Obrazovanje ${school + 1}: upišite ustanovu.`
  return null
}

export function moved<T>(rows: T[], index: number, by: -1 | 1): T[] {
  const target = index + by
  if (target < 0 || target >= rows.length) return rows
  const copy = [...rows]
  ;[copy[index], copy[target]] = [copy[target]!, copy[index]!]
  return copy
}

let lastKey = 0

/** A key for a new row of a list. */
export const newKey = () => ++lastKey

export const keyed = <T>(value: T): Keyed<T> => ({ key: newKey(), value })
