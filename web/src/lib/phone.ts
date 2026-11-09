/** The numbers the database showed, by the profile they belong to. */
export function mapPhones(rows: { profile_id: string; phone: string }[]): Map<string, string> {
  return new Map(rows.map((row) => [row.profile_id, row.phone]))
}

/** An example of a number as it is meant to be typed (and as it is shown). */
export const PHONE_EXAMPLE = '064 1234 567'

export const INVALID_PHONE = `Broj telefona nije ispravan. Upišite ga na primer ovako: ${PHONE_EXAMPLE}. Broj iz druge države upišite sa pozivnim brojem, na primer +49 30 1234567.`

const SERBIA = '+381'

/**
 * The international form of a number a person typed (`+` and 7 to 15 digits, the first not 0), or null when it is not one.
 * Spaces, dashes, dots and brackets are dropped and a leading 00 is a +, as in the database's `normalize_phone`. A single
 * leading 0 is how a Serbian number is written at home, so it becomes +381 here, before the number is sent: the database
 * only ever gets the international form and has the last word. Anything else without + or 00 is refused: the country
 * cannot be guessed.
 */
export function normalizePhone(input: string): string | null {
  let phone = input.replace(/[\s().-]/g, '')
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`
  else if (phone.startsWith('0')) phone = `${SERBIA}${phone.slice(1)}`
  return /^\+[1-9][0-9]{6,14}$/.test(phone) ? phone : null
}

/**
 * A number the way it is written at home: a Serbian one (+381) with a 0 in front, in groups of 3, 4 and the rest
 * (`064 4994 235`). A number from another country stays international, and so does anything that is not a number.
 */
export function formatPhone(phone: string): string {
  if (!/^\+381[1-9][0-9]{5,12}$/.test(phone)) return phone
  const national = `0${phone.slice(SERBIA.length)}`
  return [national.slice(0, 3), national.slice(3, 7), national.slice(7)].filter(Boolean).join(' ')
}

/** What is wrong with a number as typed, or null. An optional number may be empty; one that is typed has to be a number. */
export function phoneProblem(input: string, required: boolean): string | null {
  if (input.trim() === '') return required ? 'Unesite broj telefona.' : null
  return normalizePhone(input) ? null : INVALID_PHONE
}
