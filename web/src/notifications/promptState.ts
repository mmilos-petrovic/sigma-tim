/**
 * How far the person has got with the invitation to switch notifications on, per person and device:
 * nothing (the full-screen invitation is still to come), `asked` (they pressed "Ne sada": a banner follows) or
 * `dismissed` (they closed the banner too: only the settings remain).
 */
export type PromptState = 'asked' | 'dismissed' | null

const KEY = 'push-prompt:'

export function readPromptState(
  profileId: string,
  storage: () => Storage = () => localStorage,
): PromptState {
  try {
    const value = storage().getItem(KEY + profileId)
    return value === 'asked' || value === 'dismissed' ? value : null
  } catch {
    return null
  }
}

export function writePromptState(
  profileId: string,
  state: Exclude<PromptState, null>,
  storage: () => Storage = () => localStorage,
): void {
  try {
    storage().setItem(KEY + profileId, state)
  } catch {
    // not remembered: the invitation simply comes again
  }
}
