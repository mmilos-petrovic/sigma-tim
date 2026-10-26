/** What the signed-in account is, as reported by the database (`my_roles()`). */
export interface MyRoles {
  profileId: string
  email: string
  firstName: string
  lastName: string
  avatarUrl: string | null
  isAdmin: boolean
  isTeacher: boolean
  isStudent: boolean
  isParent: boolean
}

/** A part of the app an account can work in. Several roles on one account mean several contexts. */
export type Context = 'admin' | 'teacher' | 'student' | 'parent'

export const CONTEXTS: readonly Context[] = ['admin', 'teacher', 'student', 'parent']

const HOME: Record<Context, string> = {
  admin: '/administracija',
  teacher: '/moj-raspored',
  student: '/ucenik',
  parent: '/roditelj',
}

export const CONTEXT_LABEL: Record<Context, string> = {
  admin: 'Administracija',
  teacher: 'Moj raspored',
  student: 'Moji časovi',
  parent: 'Časovi dece',
}

export const LOGIN_PATH = '/prijava'
export const NOT_MEMBER_PATH = '/nije-clan'
export const CHOOSER_PATH = '/izbor'

export function homePath(context: Context): string {
  return HOME[context]
}

export function isContext(value: unknown): value is Context {
  return typeof value === 'string' && (CONTEXTS as readonly string[]).includes(value)
}

/** The contexts an account may open. Empty: the school has not approved this account (or no role is in force). */
export function contextsOf(roles: MyRoles | null): Context[] {
  if (!roles) return []
  const held: Record<Context, boolean> = {
    admin: roles.isAdmin,
    teacher: roles.isTeacher,
    student: roles.isStudent,
    parent: roles.isParent,
  }
  return CONTEXTS.filter((context) => held[context])
}

/** The context a path belongs to, matched on whole path segments ("/moj-raspored-x" belongs to none). */
export function contextForPath(path: string): Context | null {
  const pathname = path.split(/[?#]/)[0]
  return (
    CONTEXTS.find(
      (context) => pathname === HOME[context] || pathname.startsWith(`${HOME[context]}/`),
    ) ?? null
  )
}

/**
 * Where an account goes after signing in (and when it opens a page that is not theirs):
 * back to the page they came from if it is theirs; else the only context, or the context they used last;
 * else a choice between the contexts. The UI decides here, the database decides what each context can read.
 */
export function resolveDestination(input: {
  contexts: readonly Context[]
  lastContext: Context | null
  returnTo: string | null
}): string {
  const { contexts, lastContext, returnTo } = input
  if (contexts.length === 0) return NOT_MEMBER_PATH

  if (returnTo) {
    const target = contextForPath(returnTo)
    if (target && contexts.includes(target)) return returnTo
  }
  if (contexts.length === 1) return homePath(contexts[0])
  if (lastContext && contexts.includes(lastContext)) return homePath(lastContext)
  return CHOOSER_PATH
}
