import { phoneProblem } from '../lib/phone'

/** What is wrong with what was typed, in the words of the person; null when it can be sent. */
export function profileProblem(values: {
  firstName: string
  lastName: string
  phone: string
  school: string
  grade: string
  consent: boolean
  needsConsent: boolean
}): string | null {
  if (values.firstName.trim() === '' || values.lastName.trim() === '') {
    return 'Upišite ime i prezime učenika.'
  }
  const phone = phoneProblem(values.phone, true)
  if (phone) return phone
  if (values.school.trim() === '') return 'Upišite školu.'
  if (values.grade.trim() === '') return 'Upišite razred.'
  if (values.needsConsent && !values.consent) {
    return 'Prihvatite politiku privatnosti da biste nastavili.'
  }
  return null
}
