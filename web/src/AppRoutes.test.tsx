import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { AdminApiProvider } from './admin/AdminApiProvider'
import { CvApiProvider } from './cv/CvApiProvider'
import { EnrolmentApiProvider } from './enrolment/EnrolmentApiProvider'
import type { EnrolmentApi } from './enrolment/enrolmentApi'
import { AppRoutes } from './AppRoutes'
import { AuthExpiredError } from './auth/authApi'
import { AuthProvider } from './auth/AuthProvider'
import { readLastContext, writeLastContext } from './auth/lastContext'
import { saveReturnTo } from './auth/returnTo'
import type { MyRoles } from './auth/roles'
import { markSignInStarted, peekSignInStarted } from './auth/signInReturn'
import { createFakeAdminApi } from './test/fakeAdminApi'
import { createFakeCvApi } from './test/fakeCvApi'
import { createFakeEnrolmentApi } from './test/fakeEnrolmentApi'
import { createFakeStudentApi } from './test/fakeStudentApi'
import { createFakeTeacherApi } from './test/fakeTeacherApi'
import { StudentApiProvider } from './student/StudentApiProvider'
import { TeacherApiProvider } from './teacher/TeacherApiProvider'
import { createFakeAuthApi, sessionFor, type FakeAuthApi } from './test/fakeAuthApi'
import { personas } from './test/fixtures'

// The signed-in screens are loaded when a route needs them. Loading them once here keeps the first test that opens one
// from paying for it (a slow machine would run into the timeout of the lookups).
beforeAll(async () => {
  await Promise.all([
    import('./pages/ChooserPage'),
    import('./pages/ContextPage'),
    import('./enrolment/EnrolmentPage'),
  ])
}, 60_000)

// The teacher's home is the schedule; the real calendar is checked in the browser.
vi.mock('./teacher/calendar/WeekCalendar', async () => import('./test/mockCalendar'))

function Where() {
  const { pathname } = useLocation()
  return <p data-testid="where">{pathname}</p>
}

function renderApp(
  api: FakeAuthApi,
  path = '/',
  enrolment: EnrolmentApi = createFakeEnrolmentApi(),
) {
  // The administration screens need their data layer, even though these tests only look at routing.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminApiProvider api={createFakeAdminApi()}>
        <TeacherApiProvider api={createFakeTeacherApi()}>
          <StudentApiProvider api={createFakeStudentApi()}>
            <CvApiProvider api={createFakeCvApi()}>
              <EnrolmentApiProvider api={enrolment}>
                <AuthProvider api={api}>
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
}

const where = () => screen.getByTestId('where').textContent
const heading = (name: string, level = 1) => screen.findByRole('heading', { name, level })
const signedInAs = (roles: MyRoles | null, email = 'stranger@example.test') =>
  createFakeAuthApi(roles ? { roles } : { roles: null, session: { userId: 'u-stranger', email } })

/** What Google does after a sign-in: the person is on the front page again, and the page takes them on from there. */
function comeBackFromGoogle(api: FakeAuthApi) {
  markSignInStarted()
  return renderApp(api, '/')
}

const FRONT_PAGE = 'Sigma tim Kruševac'

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
    comeBackFromGoogle(signedInAs(roles))
    expect(await heading(title)).toBeInTheDocument()
    expect(where()).toBe(path)
  })

  it('asks an account with two roles which one to open', async () => {
    comeBackFromGoogle(signedInAs(personas.adminTeacher))
    expect(await heading('Izaberite prikaz')).toBeInTheDocument()
    expect(where()).toBe('/izbor')
    const main = within(screen.getByRole('main'))
    expect(main.getByRole('link', { name: 'Administracija' })).toBeInTheDocument()
    expect(main.getByRole('link', { name: 'Moj raspored' })).toBeInTheDocument()
  })

  it('opens the chosen context and remembers it for the next sign-in', async () => {
    comeBackFromGoogle(signedInAs(personas.adminTeacher))
    await heading('Izaberite prikaz')
    await userEvent.click(
      within(screen.getByRole('main')).getByRole('link', { name: 'Moj raspored' }),
    )
    expect(await heading('Moj raspored')).toBeInTheDocument()
    expect(readLastContext('p-boss')).toBe('teacher')
  })

  it('goes straight back to the remembered context on a later sign-in', async () => {
    writeLastContext('p-boss', 'admin')
    comeBackFromGoogle(signedInAs(personas.adminTeacher))
    expect(await heading('Administracija')).toBeInTheDocument()
    expect(where()).toBe('/administracija')
  })

  it('asks again when the remembered context is no longer one of theirs', async () => {
    writeLastContext('p-boss', 'parent')
    comeBackFromGoogle(signedInAs(personas.adminTeacher))
    expect(await heading('Izaberite prikaz')).toBeInTheDocument()
  })

  it('returns to the page they were trying to open before signing in', async () => {
    saveReturnTo('/moj-raspored')
    comeBackFromGoogle(signedInAs(personas.adminTeacher))
    expect(await heading('Moj raspored')).toBeInTheDocument()
  })
})

describe('protected pages', () => {
  it('send a signed-out visitor to the front page, where they sign in', async () => {
    renderApp(createFakeAuthApi(), '/moj-raspored')
    expect(await heading(FRONT_PAGE)).toBeInTheDocument()
    expect(where()).toBe('/')
    expect(screen.queryByText('Sesija je istekla. Prijavite se ponovo.')).not.toBeInTheDocument()
  })

  it('hand the page to sign in with, so the visitor comes back to it', async () => {
    const api = createFakeAuthApi()
    renderApp(api, '/moj-raspored/nedelja')
    await userEvent.click(await screen.findByRole('button', { name: 'Prijava' }))
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
    renderApp(signedInAs(null, 'stranger@example.test'), '/nije-clan')
    expect(await heading('Još niste član škole')).toBeInTheDocument()
    expect(screen.getByText(/Pozovite nastavnika da vam zakaže prvi čas/)).toBeInTheDocument()
    expect(screen.getByText('stranger@example.test')).toBeInTheDocument()
  })

  it('treats an approved profile whose role is no longer in force the same way', async () => {
    renderApp(signedInAs(personas.deactivatedTeacher), '/moj-raspored')
    expect(await heading('Još niste član škole')).toBeInTheDocument()
  })

  it('lets them sign out and try another account', async () => {
    const api = signedInAs(null)
    renderApp(api, '/nije-clan')
    await userEvent.click(await screen.findByRole('button', { name: 'Prijavi se drugim nalogom' }))
    expect(api.signOut).toHaveBeenCalled()
    expect(await heading(FRONT_PAGE)).toBeInTheDocument()
    expect(where()).toBe('/')
    expect(screen.queryByText('Sesija je istekla. Prijavite se ponovo.')).not.toBeInTheDocument()
  })

  it('is not for members: they are sent to their own page', async () => {
    renderApp(signedInAs(personas.teacher), '/nije-clan')
    expect(await heading('Moj raspored')).toBeInTheDocument()
  })

  it('sends a visitor who is not signed in to the front page', async () => {
    renderApp(createFakeAuthApi(), '/nije-clan')
    expect(await heading(FRONT_PAGE)).toBeInTheDocument()
  })

  it('is what the front page says to an unapproved account that has only signed in', async () => {
    comeBackFromGoogle(signedInAs(null, 'stranger@example.test'))
    await screen.findByText(/škola taj nalog još ne poznaje/)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Prijavljeni ste kao stranger@example.test, ali škola taj nalog još ne poznaje.',
    )
    expect(where()).toBe('/')
    // the note about the sign-in is used up: a later visit to the front page does not repeat it
    expect(peekSignInStarted()).toBe(false)
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
    expect(await heading(FRONT_PAGE)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Sesija je istekla. Prijavite se ponovo.')
  })

  it('says so when the server rejects the session while loading the account', async () => {
    const api = signedInAs(personas.teacher)
    api.rolesError = new AuthExpiredError()
    renderApp(api, '/moj-raspored')
    expect(await heading(FRONT_PAGE)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Sesija je istekla. Prijavite se ponovo.')
  })

  it('signs in for the page the person was on when the session ran out', async () => {
    const api = signedInAs(personas.teacher)
    renderApp(api, '/moj-raspored')
    await heading('Moj raspored')
    act(() => api.emit({ type: 'signedOut' }))
    await heading(FRONT_PAGE)

    await userEvent.click(screen.getByRole('button', { name: 'Prijava' }))
    expect(api.signInWithGoogle).toHaveBeenCalledWith('/moj-raspored')
  })

  it('takes the person back into the app when they have signed in again', async () => {
    const api = signedInAs(personas.teacher)
    renderApp(api, '/moj-raspored')
    await heading('Moj raspored')
    act(() => api.emit({ type: 'signedOut' }))
    await heading(FRONT_PAGE)

    // Google sends the person back to the front page; the page they wanted waits in the browser
    saveReturnTo('/moj-raspored')
    markSignInStarted()
    api.roles = personas.teacher
    act(() => api.emit({ type: 'signedIn', session: sessionFor(personas.teacher) }))
    expect(await heading('Moj raspored')).toBeInTheDocument()
    expect(where()).toBe('/moj-raspored')
  })

  it('does not call a deliberate sign-out an expiry', async () => {
    renderApp(signedInAs(personas.teacher), '/moj-raspored')
    await userEvent.click(await screen.findByRole('button', { name: 'Odjavi se' }))
    expect(await heading(FRONT_PAGE)).toBeInTheDocument()
    expect(where()).toBe('/')
    expect(screen.queryByText('Sesija je istekla. Prijavite se ponovo.')).not.toBeInTheDocument()
  })

  it('explains a failed Google sign-in that comes back with an error', async () => {
    renderApp(createFakeAuthApi(), '/?error=access_denied&error_description=User+denied')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prijava nije uspela. Pokušajte ponovo.',
    )
  })

  it('tells the person when Google sign-in cannot even start', async () => {
    const api = createFakeAuthApi()
    api.signInWithGoogle.mockRejectedValue(new Error('network'))
    renderApp(api, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Prijava' }))
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
    const { container } = comeBackFromGoogle(signedInAs(roles))
    await waitFor(() =>
      expect(container.querySelector('[data-layout]')).toHaveAttribute('data-layout', layout),
    )
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

  it('keeps the header of teachers and the administration short enough for one line of a phone', async () => {
    renderApp(signedInAs(personas.adminTeacher), '/moj-raspored')
    const header = within(await screen.findByRole('banner'))
    expect(header.queryByText('Sigma Tim')).not.toBeInTheDocument()

    // short words on the screen, the full names for a screen reader
    const switcher = within(header.getByRole('navigation', { name: 'Izbor prikaza' }))
    expect(switcher.getByRole('link', { name: 'Administracija' })).toHaveTextContent(/^Admin$/)
    expect(switcher.getByRole('link', { name: 'Moj raspored' })).toHaveTextContent(/^Raspored$/)

    // icons instead of words; the buttons keep their names
    const signOut = header.getByRole('button', { name: 'Odjavi se' })
    expect(signOut).toHaveTextContent('')
    expect(signOut).toHaveAttribute('title', 'Odjavi se')
    expect(signOut.querySelector('svg')).not.toBeNull()
  })

  it('has a house next to the name of the school in the header of a student, back to the front page', async () => {
    renderApp(signedInAs(personas.student), '/ucenik')
    const header = within(await screen.findByRole('banner'))
    expect(header.getByRole('link', { name: 'Sigma Tim' })).toHaveAttribute('href', '/ucenik')
    expect(header.getByRole('link', { name: 'Početna strana' })).toHaveAttribute('href', '/')
  })

  it('has no such house in the short header of a teacher, which has no name of the school', async () => {
    renderApp(signedInAs(personas.teacher), '/moj-raspored')
    const header = within(await screen.findByRole('banner'))
    expect(header.queryByRole('link', { name: 'Početna strana' })).not.toBeInTheDocument()
  })

  it('keeps the name of the school in the header of a student, with icons instead of words', async () => {
    renderApp(signedInAs(personas.student), '/ucenik')
    const header = within(await screen.findByRole('banner'))
    expect(header.getByText('Sigma Tim')).toBeInTheDocument()
    const signOut = header.getByRole('button', { name: 'Odjavi se' })
    expect(signOut).toHaveTextContent('')
    expect(signOut).toHaveAttribute('title', 'Odjavi se')
    expect(signOut.querySelector('svg')).not.toBeNull()
  })

  it('has no switch for an account with a single context', async () => {
    renderApp(signedInAs(personas.teacher), '/moj-raspored')
    await heading('Moj raspored')
    expect(screen.queryByRole('navigation', { name: 'Izbor prikaza' })).not.toBeInTheDocument()
  })

  it('opens the list of lessons on the home page of a student and of a parent', async () => {
    renderApp(signedInAs(personas.student), '/ucenik')
    expect(await heading('Moji časovi')).toBeInTheDocument()
    expect(await heading('Predstojeći časovi', 2)).toBeInTheDocument()
  })

  it('does the same for a parent', async () => {
    renderApp(signedInAs(personas.parent), '/roditelj')
    expect(await heading('Časovi dece')).toBeInTheDocument()
    expect(await heading('Predstojeći časovi', 2)).toBeInTheDocument()
  })
})

describe('public and unknown pages', () => {
  it('shows the front page to a visitor who is not signed in, with a way to sign in', async () => {
    renderApp(createFakeAuthApi(), '/')
    expect(await heading(FRONT_PAGE)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prijava' })).toBeEnabled()
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
    expect(await heading(FRONT_PAGE)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Prijava' })).not.toBeInTheDocument()
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
    renderApp(api, '/')

    expect(await screen.findByText('Prijava test nalogom')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Učenik' }))
    expect(api.signInWithPassword).toHaveBeenCalledWith('ucenik1@example.test', 'local-only')
    // like Google, it comes back to the front page, which takes the person on into the app
    expect(peekSignInStarted()).toBe(true)
  })

  it('is absent outside development', async () => {
    vi.stubEnv('DEV', false)
    vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', 'local-only')
    renderApp(createFakeAuthApi(), '/')
    await heading(FRONT_PAGE)
    expect(screen.queryByText('Prijava test nalogom')).not.toBeInTheDocument()
  })

  it('is absent without a configured password', async () => {
    vi.stubEnv('DEV', true)
    vi.stubEnv('VITE_DEV_LOGIN_PASSWORD', '')
    renderApp(createFakeAuthApi(), '/')
    await heading(FRONT_PAGE)
    expect(screen.queryByText('Prijava test nalogom')).not.toBeInTheDocument()
  })
})
