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
import {
  createBrowserEnv,
  createLocalPushPrefs,
  createSupabasePushStore,
} from './notifications/browserEnv'
import { PushApiProvider } from './notifications/PushDevice'
import { readPrerendered, seedQueries } from './prerender/seed'
import { createPushApi } from './notifications/pushApi'
import { CvApiProvider } from './cv/CvApiProvider'
import { createSupabaseCvApi } from './cv/supabaseCvApi'
import { EnrolmentApiProvider } from './enrolment/EnrolmentApiProvider'
import { createSupabaseEnrolmentApi } from './enrolment/supabaseEnrolmentApi'
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
      cv: createSupabaseCvApi(client),
      enrolment: createSupabaseEnrolmentApi(client),
      push: createPushApi({
        env: createBrowserEnv(),
        store: createSupabasePushStore(client),
        prefs: createLocalPushPrefs(),
        vapidKey: import.meta.env.VITE_VAPID_PUBLIC_KEY,
      }),
    }
  : null

// One retry is enough: a failing request gets an explained error and a "try again" button.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1 } } })

// A prerendered page brings the answers it was made from, so that it does not change while the same ones are asked for again.
const prerendered = readPrerendered(document)
if (prerendered) seedQueries(queryClient, prerendered)

export default function App() {
  return (
    <ErrorBoundary>
      {services ? (
        <QueryClientProvider client={queryClient}>
          <AdminApiProvider api={services.admin}>
            <TeacherApiProvider api={services.teacher}>
              <StudentApiProvider api={services.student}>
                <CvApiProvider api={services.cv}>
                  <EnrolmentApiProvider api={services.enrolment}>
                    <AuthProvider api={services.auth}>
                      <PushApiProvider api={services.push}>
                        <BrowserRouter>
                          <AppRoutes />
                        </BrowserRouter>
                      </PushApiProvider>
                    </AuthProvider>
                  </EnrolmentApiProvider>
                </CvApiProvider>
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
