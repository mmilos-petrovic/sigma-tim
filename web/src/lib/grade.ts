/** The class of a student is shown as the number of the grade: "7 razred". */

/** "7 razred" for `7`; anything that is not a plain number (an old entry such as "7a") is shown as it is. */
export function formatGrade(grade: string | null): string | null {
  const text = grade?.trim()
  if (!text) return null
  return /^\d+$/.test(text) ? `${text} razred` : text
}

export const GRADE_PROBLEM = 'Razred je broj, na primer 7.'

/**
 * What is wrong with a grade a person typed, or null. Empty is fine. An old entry that is not a number can stay as long
 * as it is not changed (`original`), but nothing like it can be typed anew.
 */
export function gradeProblem(typed: string, original: string | null = null): string | null {
  const text = typed.trim()
  if (text === '' || /^\d{1,2}$/.test(text)) return null
  return text === (original ?? '').trim() ? null : GRADE_PROBLEM
}
