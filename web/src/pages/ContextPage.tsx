import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AdminRoutes } from '../admin/AdminRoutes'
import { ADMIN_NAV } from '../admin/nav'
import { destinationFor } from '../auth/destination'
import { writeLastContext } from '../auth/lastContext'
import { CONTEXT_LABEL, homePath, type Context } from '../auth/roles'
import { AppShell } from '../components/AppShell'
import { useMember } from '../components/guards'
import { NotFoundContent } from '../components/NotFound'

const EMPTY_TEXT: Record<Context, string> = {
  admin: 'Ovde će se podešavati škola: nastavnici, predmeti i lokacije.',
  teacher: 'Ovde će se pojaviti vaš raspored.',
  student: 'Ovde će se pojaviti vaši časovi.',
  parent: 'Ovde će se pojaviti časovi vaše dece.',
}

function ContextHome({ context }: { context: Context }) {
  return (
    <div className="empty">
      <h1>{CONTEXT_LABEL[context]}</h1>
      <p>{EMPTY_TEXT[context]}</p>
    </div>
  )
}

/** One context of an account (administration, teacher, student, parent) inside the app shell. */
export function ContextPage({ context }: { context: Context }) {
  const { roles, contexts } = useMember()
  const held = contexts.includes(context)

  useEffect(() => {
    // Remembered so that the next sign-in returns to where the person last worked.
    if (held) writeLastContext(roles.profileId, context)
  }, [held, roles.profileId, context])

  // Not theirs: show them where they belong instead.
  if (!held) return <Navigate to={destinationFor(roles, null)} replace />

  return (
    <AppShell
      context={context}
      contexts={contexts}
      roles={roles}
      nav={context === 'admin' ? ADMIN_NAV : undefined}
    >
      {context === 'admin' ? (
        <AdminRoutes />
      ) : (
        <Routes>
          <Route index element={<ContextHome context={context} />} />
          <Route
            path="*"
            element={
              <NotFoundContent homeTo={homePath(context)} homeLabel={CONTEXT_LABEL[context]} />
            }
          />
        </Routes>
      )}
    </AppShell>
  )
}
