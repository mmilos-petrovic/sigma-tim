import { Route, Routes } from 'react-router'
import { CONTEXT_LABEL, homePath } from '../auth/roles'
import { NotFoundContent } from '../components/NotFound'
import { LessonsPage } from './pages/LessonsPage'
import { SchedulePage } from './pages/SchedulePage'
import { SettingsPage } from './pages/SettingsPage'
import { StudentsPage } from './pages/StudentsPage'

export function TeacherRoutes() {
  return (
    <Routes>
      <Route index element={<SchedulePage />} />
      <Route path="ucenici" element={<StudentsPage />} />
      <Route path="casovi" element={<LessonsPage />} />
      <Route path="podesavanja" element={<SettingsPage />} />
      <Route
        path="*"
        element={<NotFoundContent homeTo={homePath('teacher')} homeLabel={CONTEXT_LABEL.teacher} />}
      />
    </Routes>
  )
}
