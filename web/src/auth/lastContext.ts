import { isContext, type Context } from './roles'

// Per person, so a shared computer does not carry one person's choice over to the next.
const key = (profileId: string) => `sigma.lastContext.${profileId}`

/** The context this person last worked in, for returning to it at the next sign-in. Never throws. */
export function readLastContext(profileId: string): Context | null {
  try {
    const value = window.localStorage.getItem(key(profileId))
    return isContext(value) ? value : null
  } catch {
    return null
  }
}

export function writeLastContext(profileId: string, context: Context): void {
  try {
    window.localStorage.setItem(key(profileId), context)
  } catch {
    // Storage can be blocked (private window); the person is simply asked again next time.
  }
}
