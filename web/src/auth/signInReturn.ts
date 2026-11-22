// Google sends the person back to the front page. The front page tells that apart from an ordinary visit of a member (who
// is shown the way into the app and is not pushed in) by a note made when the sign-in started, kept in sessionStorage
// like the page the person wanted to open (see `returnTo.ts`).
const KEY = 'sigma.signingIn'
// Somebody who left for Google and never came back does not push the next visit of the front page into the app.
const FRESH_MS = 10 * 60 * 1000

export function markSignInStarted(): void {
  try {
    window.sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    // Without storage a member who signs in lands on the front page and opens the app from there.
  }
}

/** Reads without removing, so it is safe to call while rendering. */
export function peekSignInStarted(): boolean {
  try {
    const since = Number(window.sessionStorage.getItem(KEY))
    return Number.isFinite(since) && since > 0 && Date.now() - since < FRESH_MS
  } catch {
    return false
  }
}

export function clearSignInStarted(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clean up
  }
}
