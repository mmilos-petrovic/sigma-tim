import type { ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import type { NavItem } from '../admin/nav'
import { useAuth } from '../auth/AuthProvider'
import { CONTEXT_LABEL, homePath, type Context, type MyRoles } from '../auth/roles'

// Students and parents use the app on a phone; teachers and the administration work at a desk.
const LAYOUT: Record<Context, 'mobile' | 'desktop'> = {
  admin: 'desktop',
  teacher: 'desktop',
  student: 'mobile',
  parent: 'mobile',
}

function Avatar({ roles }: { roles: MyRoles }) {
  if (roles.avatarUrl) {
    // Google's picture hosts do not accept a referrer.
    return <img className="avatar" src={roles.avatarUrl} alt="" referrerPolicy="no-referrer" />
  }
  const initials = `${roles.firstName.charAt(0)}${roles.lastName.charAt(0)}`.toUpperCase()
  return (
    <span className="avatar avatar--initials" aria-hidden="true">
      {initials}
    </span>
  )
}

export function AppShell({
  context,
  contexts,
  roles,
  nav,
  children,
}: {
  context: Context
  contexts: readonly Context[]
  roles: MyRoles
  /** The sections of this context; a single link to its home when omitted. */
  nav?: NavItem[]
  children: ReactNode
}) {
  const { signOut } = useAuth()
  const layout = LAYOUT[context]
  const items: NavItem[] = nav ?? [
    { to: homePath(context), label: CONTEXT_LABEL[context], end: true },
  ]

  return (
    <div className="shell" data-layout={layout}>
      <header className="shell__header">
        <Link className="shell__brand" to={homePath(context)}>
          Sigma Tim
        </Link>

        {contexts.length > 1 && (
          <nav className="switcher" aria-label="Izbor prikaza">
            {contexts.map((c) => (
              <NavLink key={c} to={homePath(c)}>
                {CONTEXT_LABEL[c]}
              </NavLink>
            ))}
          </nav>
        )}

        <div className="shell__user">
          <Avatar roles={roles} />
          <span className="shell__name">
            {roles.firstName} {roles.lastName}
          </span>
          <button type="button" className="button button--secondary" onClick={() => void signOut()}>
            Odjavi se
          </button>
        </div>
      </header>

      <div className="shell__body">
        {layout === 'desktop' && (
          <aside className="shell__sidebar">
            <nav aria-label="Glavna navigacija">
              {items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        )}
        <main className="shell__main">{children}</main>
      </div>
    </div>
  )
}
