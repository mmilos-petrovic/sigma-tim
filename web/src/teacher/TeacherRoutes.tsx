import { Route, Routes } from 'react-router'
import { CONTEXT_LABEL, homePath } from '../auth/roles'
import { NotFoundContent } from '../components/NotFound'
import { CvDetailPage } from '../cv/CvDetailPage'
import { CvDirectoryPage } from '../cv/CvDirectoryPage'
import { CvPage } from './pages/CvPage'
import { LessonsPage } from './pages/LessonsPage'
import { PoolPage } from './pages/PoolPage'
import { SchedulePage } from './pages/SchedulePage'
import { SettingsPage } from './pages/SettingsPage'
import { StudentsPage } from './pages/StudentsPage'

const CV_BASE = `${homePath('teacher')}/cv-nastavnika`

export function TeacherRoutes() {
  return (
    <Routes>
      <Route index element={<SchedulePage />} />
      <Route path="ucenici" element={<StudentsPage />} />
      <Route path="neraspodeljeni" element={<PoolPage />} />
      <Route path="casovi" element={<LessonsPage />} />
      <Route path="moj-cv" element={<CvPage />} />
      <Route path="cv-nastavnika" element={<CvDirectoryPage base={CV_BASE} />} />
      <Route path="cv-nastavnika/:slug" element={<CvDetailPage base={CV_BASE} />} />
      <Route path="podesavanja" element={<SettingsPage />} />
      <Route
        path="*"
        element={<NotFoundContent homeTo={homePath('teacher')} homeLabel={CONTEXT_LABEL.teacher} />}
      />
    </Routes>
  )
}
