import { Route, Routes } from 'react-router'
import { homePath } from '../auth/roles'
import { NotFoundContent } from '../components/NotFound'
import { LocationsPage } from './pages/LocationsPage'
import { NotificationSettingsPage } from './pages/NotificationSettingsPage'
import { OverviewPage } from './pages/OverviewPage'
import { StudentsPage } from './pages/StudentsPage'
import { SubjectsPage } from './pages/SubjectsPage'
import { TakeoverRequestsPage } from './pages/TakeoverRequestsPage'
import { TeachersPage } from './pages/TeachersPage'

export function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="nastavnici" element={<TeachersPage />} />
      <Route path="ucenici" element={<StudentsPage />} />
      <Route path="predmeti" element={<SubjectsPage />} />
      <Route path="lokacije" element={<LocationsPage />} />
      <Route path="zahtevi" element={<TakeoverRequestsPage />} />
      <Route path="podesavanja" element={<NotificationSettingsPage />} />
      <Route
        path="*"
        element={<NotFoundContent homeTo={homePath('admin')} homeLabel="Administracija" />}
      />
    </Routes>
  )
}
