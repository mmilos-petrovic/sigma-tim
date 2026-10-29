import { Route, Routes } from 'react-router'
import { homePath } from '../auth/roles'
import { NotFoundContent } from '../components/NotFound'
import { LocationsPage } from './pages/LocationsPage'
import { OverviewPage } from './pages/OverviewPage'
import { SubjectsPage } from './pages/SubjectsPage'
import { TakeoverRequestsPage } from './pages/TakeoverRequestsPage'
import { TeachersPage } from './pages/TeachersPage'

export function AdminRoutes() {
  return (
    <Routes>
      <Route index element={<OverviewPage />} />
      <Route path="nastavnici" element={<TeachersPage />} />
      <Route path="predmeti" element={<SubjectsPage />} />
      <Route path="lokacije" element={<LocationsPage />} />
      <Route path="zahtevi" element={<TakeoverRequestsPage />} />
      <Route
        path="*"
        element={<NotFoundContent homeTo={homePath('admin')} homeLabel="Administracija" />}
      />
    </Routes>
  )
}
