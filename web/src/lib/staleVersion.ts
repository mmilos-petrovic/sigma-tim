/**
 * A tab that was opened before a new version was published asks for files (screens loaded on demand) that no longer exist.
 * The browser says "Failed to fetch dynamically imported module", and loading the page again is all that helps. It is done
 * without asking anybody, but only once a minute: a page that cannot load for another reason must not reload for ever.
 */

const KEY = 'sigma.reloadedAt'
const NOT_AGAIN_FOR_MS = 60_000

// Chrome and Edge, Firefox, Safari; and the same for a stylesheet that belongs to a screen
const CHUNK_ERROR =
  /dynamically imported module|Importing a module script failed|Unable to preload CSS/i

export function isChunkLoadError(error: unknown): boolean {
  return error instanceof Error && CHUNK_ERROR.test(error.message)
}

interface Deps {
  now?: number
  storage?: Pick<Storage, 'getItem' | 'setItem'>
  reload?: () => void
}

/**
 * Loads the page again, unless that was done during the last minute (or the browser keeps nothing between loads, and a
 * second reload could not be told from the first). Returns whether it did.
 */
export function reloadForNewVersion(deps: Deps = {}): boolean {
  const now = deps.now ?? Date.now()
  try {
    const storage = deps.storage ?? window.sessionStorage
    const last = Number(storage.getItem(KEY))
    if (last > 0 && now - last < NOT_AGAIN_FOR_MS) return false
    storage.setItem(KEY, String(now))
  } catch {
    return false
  }
  ;(deps.reload ?? (() => window.location.reload()))()
  return true
}
