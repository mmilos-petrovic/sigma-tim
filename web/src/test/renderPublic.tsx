import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { AdminApiProvider } from '../admin/AdminApiProvider'
import { AppRoutes } from '../AppRoutes'
import { AuthProvider } from '../auth/AuthProvider'
import type { MyRoles } from '../auth/roles'
import { CvApiProvider } from '../cv/CvApiProvider'
import { EnrolmentApiProvider } from '../enrolment/EnrolmentApiProvider'
import { StudentApiProvider } from '../student/StudentApiProvider'
import { TeacherApiProvider } from '../teacher/TeacherApiProvider'
import { createFakeAdminApi } from './fakeAdminApi'
import { createFakeAuthApi, type FakeAuthApi } from './fakeAuthApi'
import { createFakeCvApi, type FakeCvApi } from './fakeCvApi'
import { createFakeEnrolmentApi, type FakeEnrolmentApi } from './fakeEnrolmentApi'
import { createFakeStudentApi } from './fakeStudentApi'
import { createFakeTeacherApi } from './fakeTeacherApi'
import { Where } from './Where'

// A member who is sent on to their own screens only needs those to start; the calendar is checked in the browser.
vi.mock('../teacher/calendar/WeekCalendar', async () => import('./mockCalendar'))

/** Where the router is now. */
export const where = () => screen.getByTestId('where').textContent

/** A visitor who has not signed in. */
export const visitor = () => createFakeAuthApi()

/** A Google account the school does not know (yet): signed in, no role. */
export const stranger = (email = 'stranger@example.test') =>
  createFakeAuthApi({ roles: null, session: { userId: 'u-stranger', email } })

export function renderPublic(
  path: string,
  options: {
    auth?: FakeAuthApi
    enrolment?: FakeEnrolmentApi
    cv?: FakeCvApi
    roles?: MyRoles
  } = {},
) {
  const auth =
    options.auth ?? (options.roles ? createFakeAuthApi({ roles: options.roles }) : visitor())
  const enrolment = options.enrolment ?? createFakeEnrolmentApi()
  const cv = options.cv ?? createFakeCvApi()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AdminApiProvider api={createFakeAdminApi()}>
        <TeacherApiProvider api={createFakeTeacherApi()}>
          <StudentApiProvider api={createFakeStudentApi()}>
            <CvApiProvider api={cv}>
              <EnrolmentApiProvider api={enrolment}>
                <AuthProvider api={auth}>
                  <MemoryRouter initialEntries={[path]}>
                    <Where />
                    <AppRoutes />
                  </MemoryRouter>
                </AuthProvider>
              </EnrolmentApiProvider>
            </CvApiProvider>
          </StudentApiProvider>
        </TeacherApiProvider>
      </AdminApiProvider>
    </QueryClientProvider>,
  )
  return { ...view, auth, enrolment, cv }
}
