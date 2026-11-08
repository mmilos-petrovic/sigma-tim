import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { AdminApiProvider } from './admin/AdminApiProvider'
import { createSupabaseAdminApi } from './admin/supabaseAdminApi'
import { AppRoutes } from './AppRoutes'
import { AuthProvider } from './auth/AuthProvider'
import { createSupabaseAuthApi } from './auth/supabaseAuthApi'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ConfigErrorScreen } from './components/Status'
import { createAppClient } from './lib/supabase'
import { StudentApiProvider } from './student/StudentApiProvider'
import { createSupabaseStudentApi } from './student/supabaseStudentApi'
import { TeacherApiProvider } from './teacher/TeacherApiProvider'
import { createSupabaseTeacherApi } from './teacher/supabaseTeacherApi'

const client = createAppClient()
const services = client
  ? {
      auth: createSupabaseAuthApi(client),
      admin: createSupabaseAdminApi(client),
      teacher: createSupabaseTeacherApi(client),
      student: createSupabaseStudentApi(client),
    }
  : null

// One retry is enough: a failing request gets an explained error and a "try again" button.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

export default function App() {
  return (
    <ErrorBoundary>
      {services ? (
        <QueryClientProvider client={queryClient}>
          <AdminApiProvider api={services.admin}>
            <TeacherApiProvider api={services.teacher}>
              <StudentApiProvider api={services.student}>
                <AuthProvider api={services.auth}>
                  <BrowserRouter>
                    <AppRoutes />
                  </BrowserRouter>
                </AuthProvider>
              </StudentApiProvider>
            </TeacherApiProvider>
          </AdminApiProvider>
        </QueryClientProvider>
      ) : (
        <ConfigErrorScreen />
      )}
    </ErrorBoundary>
  )
}
