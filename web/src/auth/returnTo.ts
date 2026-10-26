import { LOGIN_PATH, NOT_MEMBER_PATH } from './roles'

// Signing in with Google leaves the app and comes back to the sign-in page, so the page the person was
// trying to open has to wait in sessionStorage.
const KEY = 'sigma.returnTo'

// Backslashes, whitespace and control characters are read as "/" or ignored by some browsers ("/\evil.example").
const hasUnsafeCharacter = (path: string) =>
  [...path].some(
    (char) => char === '\\' || char.charCodeAt(0) <= 0x20 || char.charCodeAt(0) === 0x7f,
  )

/** The path if it stays inside the app and is not one of the sign-in pages; otherwise null (no open redirects). */
export function sanitizeReturnTo(path: string | null | undefined): string | null {
  if (!path || !path.startsWith('/') || path.startsWith('//') || hasUnsafeCharacter(path))
    return null
  const pathname = path.split(/[?#]/)[0]
  if (pathname === LOGIN_PATH || pathname === NOT_MEMBER_PATH) return null
  return path
}

export function saveReturnTo(path: string | null): void {
  try {
    const safe = sanitizeReturnTo(path)
    if (safe) window.sessionStorage.setItem(KEY, safe)
    else window.sessionStorage.removeItem(KEY)
  } catch {
    // The person lands on their home page instead.
  }
}

/** Reads without removing, so it is safe to call while rendering. */
export function peekReturnTo(): string | null {
  try {
    return sanitizeReturnTo(window.sessionStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function clearReturnTo(): void {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    // nothing to clean up
  }
}

export function takeReturnTo(): string | null {
  const path = peekReturnTo()
  clearReturnTo()
  return path
}
