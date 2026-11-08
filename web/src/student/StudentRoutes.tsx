import { Route, Routes } from 'react-router'
import { CONTEXT_LABEL, homePath } from '../auth/roles'
import { NotFoundContent } from '../components/NotFound'
import { LessonsPanel } from './pages/LessonsPanel'
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
      </Route>
      <Route
        path="*"
        element={<NotFoundContent homeTo={homePath(context)} homeLabel={CONTEXT_LABEL[context]} />}
      />
    </Routes>
  )
}
