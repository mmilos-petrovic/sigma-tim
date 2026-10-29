import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AdminApiProvider } from '../admin/AdminApiProvider'
import { AppRoutes } from '../AppRoutes'
import { AuthProvider } from '../auth/AuthProvider'
import type { MyRoles } from '../auth/roles'
import { ClockProvider } from '../teacher/clock'
import { TeacherApiProvider } from '../teacher/TeacherApiProvider'
import { createFakeAdminApi } from './fakeAdminApi'
import { createFakeAuthApi } from './fakeAuthApi'
import { createFakeTeacherApi, TEST_NOW, type FakeTeacherApi } from './fakeTeacherApi'
import { personas } from './fixtures'

/** Renders the whole app at a path as a signed-in teacher, on top of an in-memory backend. */
export function renderTeacher(
  path: string,
  options: { api?: FakeTeacherApi; roles?: MyRoles; now?: Date } = {},
) {
  const teacherApi = options.api ?? createFakeTeacherApi()
  const auth = createFakeAuthApi({ roles: options.roles ?? personas.teacher })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AdminApiProvider api={createFakeAdminApi()}>
        <TeacherApiProvider api={teacherApi}>
          <ClockProvider now={options.now ?? TEST_NOW}>
            <AuthProvider api={auth}>
              <MemoryRouter initialEntries={[path]}>
                <AppRoutes />
              </MemoryRouter>
            </AuthProvider>
          </ClockProvider>
        </TeacherApiProvider>
      </AdminApiProvider>
    </QueryClientProvider>,
  )
  return { ...view, teacherApi, auth }
}

export const page = (name: string) => screen.findByRole('heading', { name, level: 1 })
export const dialog = (name: string) => screen.findByRole('dialog', { name })
export const inDialog = async (name: string) => within(await dialog(name))
