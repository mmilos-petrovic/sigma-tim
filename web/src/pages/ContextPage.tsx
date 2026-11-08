import { useEffect } from 'react'
import { Navigate } from 'react-router'
import { AdminRoutes } from '../admin/AdminRoutes'
import { ADMIN_NAV } from '../admin/nav'
import { destinationFor } from '../auth/destination'
import { writeLastContext } from '../auth/lastContext'
import { type Context } from '../auth/roles'
import { AppShell } from '../components/AppShell'
import { useMember } from '../components/guards'
import { StudentRoutes } from '../student/StudentRoutes'
import { TEACHER_NAV } from '../teacher/nav'
import { TeacherRoutes } from '../teacher/TeacherRoutes'

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
      nav={context === 'admin' ? ADMIN_NAV : context === 'teacher' ? TEACHER_NAV : undefined}
    >
      {context === 'admin' ? (
        <AdminRoutes />
      ) : context === 'teacher' ? (
        <TeacherRoutes />
      ) : (
        <StudentRoutes context={context} />
      )}
    </AppShell>
  )
}
