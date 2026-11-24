import { phoneProblem } from '../lib/phone'

export interface PersonDraft {
  profileId: string
  self: boolean
  firstName: string
  lastName: string
  phone: string
  school: string
  grade: string
  cityPart: string
  schoolTeacher: string
  situation: string
}

/** The first thing wrong with the form, in words, or null. */
export function profileProblem(
  ownPhone: string,
  isParent: boolean,
  people: readonly PersonDraft[],
  needsConsent: boolean,
  consent: boolean,
): string | null {
  const own = phoneProblem(ownPhone, isParent)
  if (own) return own
  for (const person of people) {
    const who = person.self ? '' : ` (${person.firstName.trim() || 'dete'})`
    if (!person.firstName.trim() || !person.lastName.trim()) return `Upišite ime i prezime${who}.`
    if (!person.school.trim()) return `Upišite školu${who}.`
    if (!person.grade.trim()) return `Upišite razred${who}.`
    if (!person.self) {
      const phone = phoneProblem(person.phone, false)
      if (phone) return phone
    }
  }
  if (needsConsent && !consent) return 'Prihvatite politiku privatnosti da biste nastavili.'
  return null
}
