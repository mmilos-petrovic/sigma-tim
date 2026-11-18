import { Route, Routes } from 'react-router'
import { CONTEXT_LABEL, homePath } from '../auth/roles'
import { NotFoundContent } from '../components/NotFound'
import { CvDetailPage } from '../cv/CvDetailPage'
import { CvDirectoryPage } from '../cv/CvDirectoryPage'
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
        <Route
          path="nastavnici"
          element={<CvDirectoryPage base={`${homePath(context)}/nastavnici`} />}
        />
        <Route
          path="nastavnici/:slug"
          element={<CvDetailPage base={`${homePath(context)}/nastavnici`} />}
        />
      </Route>
      <Route
        path="*"
        element={<NotFoundContent homeTo={homePath(context)} homeLabel={CONTEXT_LABEL[context]} />}
      />
    </Routes>
  )
}
