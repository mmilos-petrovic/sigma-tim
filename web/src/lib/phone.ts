/** The numbers the database showed, by the profile they belong to. */
export function mapPhones(rows: { profile_id: string; phone: string }[]): Map<string, string> {
  return new Map(rows.map((row) => [row.profile_id, row.phone]))
}

/** An example of a number as it is meant to be typed. */
export const PHONE_EXAMPLE = '+381 64 123 4567'

export const INVALID_PHONE = `Broj telefona nije ispravan. Upišite ga sa pozivnim brojem države, na primer ${PHONE_EXAMPLE}.`

/**
 * The international form of a number a person typed (`+` and 7 to 15 digits, the first not 0), or null when it is not one.
 * The same rules as the database's `normalize_phone`, which has the last word: spaces, dashes, dots and brackets are
 * dropped and a leading 00 is a +. A number without + or 00 is refused: the country cannot be guessed.
 */
export function normalizePhone(input: string): string | null {
  let phone = input.replace(/[\s().-]/g, '')
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`
  return /^\+[1-9][0-9]{6,14}$/.test(phone) ? phone : null
}

/** What is wrong with a number as typed, or null. An optional number may be empty; one that is typed has to be a number. */
export function phoneProblem(input: string, required: boolean): string | null {
  if (input.trim() === '') return required ? 'Unesite broj telefona.' : null
  return normalizePhone(input) ? null : INVALID_PHONE
}
