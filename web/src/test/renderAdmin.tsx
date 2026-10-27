import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { AdminApiProvider } from '../admin/AdminApiProvider'
import { AppRoutes } from '../AppRoutes'
import { AuthProvider } from '../auth/AuthProvider'
import type { MyRoles } from '../auth/roles'
import { createFakeAdminApi, type FakeAdminApi } from './fakeAdminApi'
import { createFakeAuthApi } from './fakeAuthApi'
import { personas } from './fixtures'

/** Renders the whole app at a path as a signed-in account, on top of an in-memory admin backend. */
export function renderAdmin(path: string, options: { api?: FakeAdminApi; roles?: MyRoles } = {}) {
  const adminApi = options.api ?? createFakeAdminApi()
  const auth = createFakeAuthApi({ roles: options.roles ?? personas.admin })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AdminApiProvider api={adminApi}>
        <AuthProvider api={auth}>
          <MemoryRouter initialEntries={[path]}>
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </AdminApiProvider>
    </QueryClientProvider>,
  )
  return { ...view, adminApi, auth }
}

export const page = (name: string) => screen.findByRole('heading', { name, level: 1 })
export const dialog = (name: string) => screen.findByRole('dialog', { name })
export const inDialog = async (name: string) => within(await dialog(name))
