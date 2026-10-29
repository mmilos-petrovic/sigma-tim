import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminApiProvider } from './admin/AdminApiProvider'
import { AppRoutes } from './AppRoutes'
import { AuthExpiredError } from './auth/authApi'
import { AuthProvider } from './auth/AuthProvider'
import { readLastContext, writeLastContext } from './auth/lastContext'
import { saveReturnTo } from './auth/returnTo'
import type { MyRoles } from './auth/roles'
import { createFakeAdminApi } from './test/fakeAdminApi'
import { createFakeAuthApi, sessionFor, type FakeAuthApi } from './test/fakeAuthApi'
import { personas } from './test/fixtures'

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}

function renderApp(api: FakeAuthApi, path = '/') {
  // The administration screens need their data layer, even though these tests only look at routing.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminApiProvider api={createFakeAdminApi()}>
        <AuthProvider api={api}>
          <MemoryRouter initialEntries={[path]}>
            <Where />
            <AppRoutes />
          </MemoryRouter>
        </AuthProvider>
      </AdminApiProvider>
    </QueryClientProvider>,
  )
}

const where = () => screen.getByTestId('where').textContent
const heading = (name: string, level = 1) => screen.findByRole('heading', { name, level })
const signedInAs = (roles: MyRoles | null, email = 'stranger@example.test') =>
  createFakeAuthApi(roles ? { roles } : { roles: null, session: { userId: 'u-stranger', email } })

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('after sign-in', () => {
  it.each([
    ['admin', personas.admin, '/administracija', 'Administracija'],
    ['teacher', personas.teacher, '/moj-raspored', 'Moj raspored'],
    ['student', personas.student, '/ucenik', 'Moji časovi'],
    ['parent', personas.parent, '/roditelj', 'Časovi dece'],
  ])('the %s lands in their own context', async (_name, roles, path, title) => {
    renderApp(signedInAs(roles), '/prijava')
    expect(await heading(title)).toBeInTheDocument()
    expect(where()).toBe(path)
  })

  it('asks an account with two roles which one to open', async () => {
    renderApp(signedInAs(personas.adminTeacher), '/prijava')
    expect(await heading('Izaberite prikaz')).toBeInTheDocument()
    expect(where()).toBe('/izbor')
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: 'Administracija' })).toBeInTheDocument()
    expect(main.getByRole('link', { name: 'Moj raspored' })).toBeInTheDocument()
  })

  it('opens the chosen context and remembers it for the next sign-in', async () => {
    renderApp(signedInAs(personas.adminTeacher), '/prijava')
    await heading('Izaberite prikaz')
    await userEvent.click(
      within(screen.getByRole('main')).getByRole('link', { name: 'Moj raspored' }),
    )
    expect(await heading('Moj raspored')).toBeInTheDocument()
    expect(readLastContext('p-boss')).toBe('teacher')
  })

  it('goes straight back to the remembered context on a later sign-in', async () => {
    writeLastContext('p-boss', 'admin')
    renderApp(signedInAs(personas.adminTeacher), '/prijava')
    expect(await heading('Administracija')).toBeInTheDocument()
    expect(where()).toBe('/administracija')
  })

  it('asks again when the remembered context is no longer one of theirs', async () => {
    writeLastContext('p-boss', 'parent')
    renderApp(signedInAs(personas.adminTeacher), '/prijava')
    expect(await heading('Izaberite prikaz')).toBeInTheDocument()
  })

  it('returns to the page they were trying to open before signing in', async () => {
    saveReturnTo('/moj-raspored')
    renderApp(signedInAs(personas.adminTeacher), '/prijava')
    expect(await heading('Moj raspored')).toBeInTheDocument()
  })
})

describe('protected pages', () => {
  it('send a signed-out visitor to the sign-in page', async () => {
    renderApp(createFakeAuthApi(), '/moj-raspored')
    expect(await heading('Prijava')).toBeInTheDocument()
    expect(where()).toBe('/prijava')
    expect(screen.queryByText('Sesija je istekla. Prijavite se ponovo.')).not.toBeInTheDocument()
  })

  it('hand the page to sign in with, so the visitor comes back to it', async () => {
    const api = createFakeAuthApi()
    renderApp(api, '/moj-raspored/nedelja')
    await userEvent.click(await screen.findByRole('button', { name: 'Prijavi se Google nalogom' }))
    expect(api.signInWithGoogle).toHaveBeenCalledWith('/moj-raspored/nedelja')
  })

  it('keep a student out of the administration and show them their own page', async () => {
    renderApp(signedInAs(personas.student), '/administracija')
    expect(await heading('Moji časovi')).toBeInTheDocument()
    expect(where()).toBe('/ucenik')
  })

  it('keep a teacher out of the student pages', async () => {
    renderApp(signedInAs(personas.teacher), '/ucenik')
    expect(await heading('Moj raspored')).toBeInTheDocument()
    expect(where()).toBe('/moj-raspored')
  })

  it('let an account with two roles open both', async () => {
    renderApp(signedInAs(personas.adminTeacher), '/administracija')
    expect(await heading('Administracija')).toBeInTheDocument()
    expect(where()).toBe('/administracija')
  })

  it('send a member without roles who asks for a page to the "not a member" page', async () => {
    renderApp(signedInAs(null, 'stranger@example.test'), '/moj-raspored')
    expect(await heading('Još niste član škole')).toBeInTheDocument()
    expect(where()).toBe('/nije-clan')
  })
})

describe('"not a member" page', () => {
  it('tells an unapproved Google account what to do and which account it used', async () => {
    renderApp(signedInAs(null, 'stranger@example.test'), '/prijava')
    expect(await heading('Još niste član škole')).toBeInTheDocument()
    expect(screen.getByText(/Pozovite nastavnika da vam zakaže prvi čas/)).toBeInTheDocument()
    expect(screen.getByText('stranger@example.test')).toBeInTheDocument()
  })

  it('treats an approved profile whose role is no longer in force the same way', async () => {
    renderApp(signedInAs(personas.deactivatedTeacher), '/prijava')
    expect(await heading('Još niste član škole')).toBeInTheDocument()
  })

  it('lets them sign out and try another account', async () => {
    const api = signedInAs(null)
    renderApp(api, '/nije-clan')
    await userEvent.click(await screen.findByRole('button', { name: 'Prijavi se drugim nalogom' }))
    expect(api.signOut).toHaveBeenCalled()
    expect(await heading('Prijava')).toBeInTheDocument()
    expect(screen.queryByText('Sesija je istekla. Prijavite se ponovo.')).not.toBeInTheDocument()
  })

  it('is not for members: they are sent to their own page', async () => {
    renderApp(signedInAs(personas.teacher), '/nije-clan')
    expect(await heading('Moj raspored')).toBeInTheDocument()
  })

  it('asks a visitor who is not signed in to sign in', async () => {
    renderApp(createFakeAuthApi(), '/nije-clan')
    expect(await heading('Prijava')).toBeInTheDocument()
  })
})

describe('loading, errors and expiry', () => {
  it('shows a loading state while the account is being checked, and no verdict yet', async () => {
    const api = signedInAs(personas.teacher)
    let release!: () => void
    api.rolesGate = new Promise<void>((resolve) => (release = resolve))
    renderApp(api, '/moj-raspored')

    expect(await screen.findByRole('status')).toHaveTextContent('Učitavanje')
    expect(screen.queryByText('Još niste član škole')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Moj raspored' })).not.toBeInTheDocument()

    await act(async () => release())
    expect(await heading('Moj raspored')).toBeInTheDocument()
  })

  it('shows an error with a retry, and never "not a member", when the account cannot be loaded', async () => {
    const api = signedInAs(personas.teacher)
    api.rolesError = new Error('Failed to fetch')
    renderApp(api, '/moj-raspored')

    expect(await screen.findByRole('alert')).toHaveTextContent('Došlo je do greške')
    expect(screen.queryByText('Još niste član škole')).not.toBeInTheDocument()

    api.rolesError = null
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await heading('Moj raspored')).toBeInTheDocument()
  })

  it('lets the person sign out from the error screen', async () => {
    const api = signedInAs(personas.teacher)
    api.rolesError = new Error('Failed to fetch')
    renderApp(api, '/moj-raspored')
    await userEvent.click(await screen.findByRole('button', { name: 'Odjavi se' }))
    expect(api.signOut).toHaveBeenCalled()
  })

  it('says so when the session ran out while the app was open', async () => {
    const api = signedInAs(personas.teacher)
    renderApp(api, '/moj-raspored')
    await heading('Moj raspored')

    act(() => api.emit({ type: 'signedOut' }))
    expect(await heading('Prijava')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Sesija je istekla. Prijavite se ponovo.')
  })

  it('says so when the server rejects the session while loading the account', async () => {
    const api = signedInAs(personas.teacher)
    api.rolesError = new AuthExpiredError()
    renderApp(api, '/moj-raspored')
    expect(await heading('Prijava')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Sesija je istekla. Prijavite se ponovo.')
  })

  it('brings the person back to the page they were on after they sign in again', async () => {
    const api = signedInAs(personas.teacher)
    renderApp(api, '/moj-raspored')
    await heading('Moj raspored')
    act(() => api.emit({ type: 'signedOut' }))
    await heading('Prijava')

    api.roles = personas.teacher
    act(() => api.emit({ type: 'signedIn', session: sessionFor(personas.teacher) }))
    expect(await heading('Moj raspored')).toBeInTheDocument()
  })

  it('does not call a deliberate sign-out an expiry', async () => {
    renderApp(signedInAs(personas.teacher), '/moj-raspored')
    await userEvent.click(await screen.findByRole('button', { name: 'Odjavi se' }))
    expect(await heading('Prijava')).toBeInTheDocument()
    expect(screen.queryByText('Sesija je istekla. Prijavite se ponovo.')).not.toBeInTheDocument()
  })

  it('explains a failed Google sign-in that comes back with an error', async () => {
    renderApp(createFakeAuthApi(), '/prijava?error=access_denied&error_description=User+denied')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prijava nije uspela. Pokušajte ponovo.',
    )
  })

  it('tells the person when Google sign-in cannot even start', async () => {
    const api = createFakeAuthApi()
    api.signInWithGoogle.mockRejectedValue(new Error('network'))
    renderApp(api, '/prijava')
    await userEvent.click(await screen.findByRole('button', { name: 'Prijavi se Google nalogom' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prijava nije uspela. Pokušajte ponovo.',
    )
  })
})

describe('layout', () => {
  it.each([
    ['student', personas.student, 'mobile'],
    ['parent', personas.parent, 'mobile'],
    ['teacher', personas.teacher, 'desktop'],
    ['admin', personas.admin, 'desktop'],
  ])('the %s context is %s-first', async (_name, roles, layout) => {
    const { container } = renderApp(signedInAs(roles), '/prijava')
    await screen.findByRole('heading', { level: 1 })
    expect(container.querySelector('[data-layout]')).toHaveAttribute('data-layout', layout)
  })

  it('shows who is signed in and a way to sign out', async () => {
    const api = signedInAs(personas.student)
    renderApp(api, '/ucenik')
    const header = within(await screen.findByRole('banner'))
    expect(header.getByText('Sava Osoba')).toBeInTheDocument()
    await userEvent.click(header.getByRole('button', { name: 'Odjavi se' }))
    expect(api.signOut).toHaveBeenCalled()
  })

  it('offers a switch between contexts only to an account that has more than one', async () => {
    renderApp(signedInAs(personas.adminTeacher), '/moj-raspored')
    const switcher = within(await screen.findByRole('navigation', { name: 'Izbor prikaza' }))
    expect(switcher.getByRole('link', { name: 'Moj raspored' })).toHaveAttribute(
      'aria-current',
      'page',
    )

    await userEvent.click(switcher.getByRole('link', { name: 'Administracija' }))
    expect(await heading('Administracija')).toBeInTheDocument()
    expect(readLastContext('p-boss')).toBe('admin')
  })

  it('has no switch for an account with a single context', async () => {
    renderApp(signedInAs(personas.teacher), '/moj-raspored')
    await heading('Moj raspored')
    expect(screen.queryByRole('navigation', { name: 'Izbor prikaza' })).not.toBeInTheDocument()
  })

  it('shows an empty state on each home page, until the later phases fill it', async () => {
    renderApp(signedInAs(personas.student), '/ucenik')
    expect(await screen.findByText(/Ovde će se pojaviti vaši časovi/)).toBeInTheDocument()
  })
})

describe('public and unknown pages', () => {
  it('shows the front page to a visitor who is not signed in, with a way to sign in', async () => {
    renderApp(createFakeAuthApi(), '/')
    expect(await heading('Sigma Tim')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Prijavi se' })).toHaveAttribute('href', '/prijava')
  })

  it('points a signed-in member from the front page to the app', async () => {
    renderApp(signedInAs(personas.teacher), '/')
    expect(await screen.findByRole('link', { name: 'Otvori aplikaciju' })).toBeInTheDocument()
  })

  it('shows the front page while the session is still being read, without flashing a login prompt', async () => {
    const api = signedInAs(personas.teacher)
    let release!: () => void
    api.rolesGate = new Promise<void>((resolve) => (release = resolve))
    renderApp(api, '/')
    expect(await heading('Sigma Tim')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Prijavi se' })).not.toBeInTheDocument()
    await act(async () => release())
    expect(await screen.findByRole('link', { name: 'Otvori aplikaciju' })).toBeInTheDocument()
  })

  it('says a page does not exist', async () => {
    renderApp(signedInAs(personas.teacher), '/nema-me')
    expect(await heading('Stranica nije pronađena')).toBeInTheDocument()
  })
})

describe('development sign-in', () => {
  it('lists the test accounts in development when a password is configured, and signs in with it', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', 'local-only')
    const api = createFakeAuthApi()
    renderApp(api, '/prijava')

    expect(await screen.findByText('Prijava test nalogom')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Učenik' }))
    expect(api.signInWithPassword).toHaveBeenCalledWith('ucenik1@example.test', 'local-only')
  })

  it('is absent outside development', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', 'local-only')
    renderApp(createFakeAuthApi(), '/prijava')
    await heading('Prijava')
    expect(screen.queryByText('Prijava test nalogom')).not.toBeInTheDocument()
  })

  it('is absent without a configured password', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', '')
    renderApp(createFakeAuthApi(), '/prijava')
    await heading('Prijava')
    expect(screen.queryByText('Prijava test nalogom')).not.toBeInTheDocument()
  })
})
