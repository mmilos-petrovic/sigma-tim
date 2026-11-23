import { Navigate, Route, Routes } from 'react-router'
import { CONTEXT_LABEL, homePath } from '../auth/roles'
import { NotFoundContent } from '../components/NotFound'
import { CvDetailPage } from '../cv/CvDetailPage'
import { LessonsPanel } from './pages/LessonsPanel'
import { RequestsPanel } from './pages/RequestsPanel'
import { SlotsPanel } from './pages/SlotsPanel'
import { StudentLayout } from './pages/StudentLayout'
import type { StudentContext } from './studentApi'

/** The screens of a student and of a parent: the same two lists, reached with each person's own sign-in. */
export function StudentRoutes({ context }: { context: StudentContext }) {
  return (
    <Routes>
      <Route element={<StudentLayout context={context} />}>
        <Route index element={<LessonsPanel />} />
        <Route path="termini" element={<SlotsPanel />} />
        <Route path="prijava" element={<RequestsPanel context={context} />} />
        {/* the CVs are reached from the footer, one teacher at a time; there is no list to go back to */}
        <Route path="nastavnici" element={<Navigate to={homePath(context)} replace />} />
        <Route
          path="nastavnici/:slug"
          element={
            <CvDetailPage
              base={`${homePath(context)}/nastavnici`}
              back={{ to: homePath(context), label: '← Nazad' }}
            />
          }
        />
      </Route>
      <Route
        path="*"
        element={<NotFoundContent homeTo={homePath(context)} homeLabel={CONTEXT_LABEL[context]} />}
      />
    </Routes>
  )
}
