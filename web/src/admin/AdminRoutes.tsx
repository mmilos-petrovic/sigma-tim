import { Route, Routes } from 'react-router'
import { homePath } from '../auth/roles'
import { NotFoundContent } from '../components/NotFound'
import { CvDetailPage } from '../cv/CvDetailPage'
import { CvDirectoryPage } from '../cv/CvDirectoryPage'
import { LocationsPage } from './pages/LocationsPage'
import { NotificationSettingsPage } from './pages/NotificationSettingsPage'
import { OverviewPage } from './pages/OverviewPage'
import { StudentsPage } from './pages/StudentsPage'
import { SubjectsPage } from './pages/SubjectsPage'
import { TakeoverRequestsPage } from './pages/TakeoverRequestsPage'
import { TeachersPage } from './pages/TeachersPage'

const CV_BASE = `${homePath('admin')}/cv`

export function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="nastavnici" element={<TeachersPage />} />
      <Route path="ucenici" element={<StudentsPage />} />
      <Route path="predmeti" element={<SubjectsPage />} />
      <Route path="lokacije" element={<LocationsPage />} />
      <Route path="zahtevi" element={<TakeoverRequestsPage />} />
      <Route path="cv" element={<CvDirectoryPage base={CV_BASE} />} />
      <Route path="cv/:slug" element={<CvDetailPage base={CV_BASE} />} />
      <Route path="podesavanja" element={<NotificationSettingsPage />} />
      <Route
        path="*"
        element={<NotFoundContent homeTo={homePath('admin')} homeLabel="Administracija" />}
      />
    </Routes>
  )
}
