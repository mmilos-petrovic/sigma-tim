/** A reason for cancelling or declining is at most this many characters (a database rule, `private.clean_note`). */
export const MAX_REASON = 200

/** What is sent for a reason typed in a form: trimmed, and null when nothing but blanks was typed. */
export function cleanReason(text: string | null | undefined): string | null {
  const trimmed = (text ?? '').trim()
  return trimmed === '' ? null : trimmed
}
