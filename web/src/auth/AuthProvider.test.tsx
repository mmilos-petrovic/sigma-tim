import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createFakeAuthApi, sessionFor } from '../test/fakeAuthApi'
import { personas } from '../test/fixtures'
import { AuthExpiredError } from './authApi'
import { AuthProvider, useAuth } from './AuthProvider'

function Probe() {
  const { state, signOut, retry } = useAuth()
  const detail =
    state.status === 'signedOut'
      ? `expired=${state.expired}`
      : state.status === 'ready'
        ? `email=${state.email} roles=${state.roles ? state.roles.firstName : 'none'}`
        : ''
  return (
    <div>
      <p data-testid="state">
        {state.status} {detail}
      </p>
      <button onClick={() => void signOut()}>sign out</button>
      <button onClick={retry}>retry</button>
    </div>
  )
}

function renderProvider(api: ReturnType<typeof createFakeAuthApi>) {
  return render(
    <AuthProvider api={api}>
      <Probe />
    </AuthProvider>,
  )
}

const state = () => screen.getByTestId('state').textContent

describe('AuthProvider', () => {
  it('starts in loading and becomes ready with the roles of the signed-in account', async () => {
    const api = createFakeAuthApi({ roles: personas.teacher })
    renderProvider(api)
    expect(state()).toMatch(/^loading/)
    await waitFor(() => expect(state()).toBe('ready email=teacher@example.test roles=Tara'))
  })

  it('is signed out, not expired, when there is no session', async () => {
    const api = createFakeAuthApi()
    renderProvider(api)
    await waitFor(() => expect(state()).toBe('signedOut expired=false'))
    expect(api.loadRoles).not.toHaveBeenCalled()
  })

  it('is ready with no profile for a Google account the school has not approved', async () => {
    const api = createFakeAuthApi({
      roles: null,
      session: { userId: 'u-stranger', email: 'stranger@example.test' },
    })
    renderProvider(api)
    await waitFor(() => expect(state()).toBe('ready email=stranger@example.test roles=none'))
  })

  it('reports a failure to load the roles as an error, never as "not a member"', async () => {
    const api = createFakeAuthApi({ roles: personas.student })
    api.rolesError = new Error('Failed to fetch')
    renderProvider(api)
    await waitFor(() => expect(state()).toMatch(/^error/))
  })

  it('loads the roles again on retry', async () => {
    const api = createFakeAuthApi({ roles: personas.student })
    api.rolesError = new Error('Failed to fetch')
    renderProvider(api)
    await waitFor(() => expect(state()).toMatch(/^error/))

    api.rolesError = null
    await userEvent.click(screen.getByText('retry'))
    await waitFor(() => expect(state()).toBe('ready email=student@example.test roles=Sava'))
    expect(api.loadRoles).toHaveBeenCalledTimes(2)
  })

  it('reports a failure to read the session as an error', async () => {
    const api = createFakeAuthApi()
    api.sessionError = new Error('storage unavailable')
    renderProvider(api)
    await waitFor(() => expect(state()).toMatch(/^error/))
  })

  it('treats a rejected session while loading the roles as an expired session', async () => {
    const api = createFakeAuthApi({ roles: personas.student })
    api.rolesError = new AuthExpiredError()
    renderProvider(api)
    await waitFor(() => expect(state()).toBe('signedOut expired=true'))
    expect(api.signOut).toHaveBeenCalled()
  })

  it('treats a sign-out it did not ask for as an expired session', async () => {
    const api = createFakeAuthApi({ roles: personas.student })
    renderProvider(api)
    await waitFor(() => expect(state()).toMatch(/^ready/))

    act(() => api.emit({ type: 'signedOut' }))
    expect(state()).toBe('signedOut expired=true')
  })

  it('does not call a deliberate sign-out an expiry', async () => {
    const api = createFakeAuthApi({ roles: personas.student })
    renderProvider(api)
    await waitFor(() => expect(state()).toMatch(/^ready/))

    await userEvent.click(screen.getByText('sign out'))
    await waitFor(() => expect(state()).toBe('signedOut expired=false'))
  })

  it('picks up a sign-in that happens later and clears the expiry', async () => {
    const api = createFakeAuthApi({ roles: personas.student })
    renderProvider(api)
    await waitFor(() => expect(state()).toMatch(/^ready/))
    act(() => api.emit({ type: 'signedOut' }))
    expect(state()).toBe('signedOut expired=true')

    api.roles = personas.parent
    act(() => api.emit({ type: 'signedIn', session: sessionFor(personas.parent) }))
    await waitFor(() => expect(state()).toBe('ready email=parent@example.test roles=Petra'))
  })

  it('does not reload the roles when the same account is announced again (token refresh, tab focus)', async () => {
    const api = createFakeAuthApi({ roles: personas.student })
    renderProvider(api)
    await waitFor(() => expect(state()).toMatch(/^ready/))

    act(() => api.emit({ type: 'signedIn', session: sessionFor(personas.student) }))
    expect(state()).toMatch(/^ready/)
    expect(api.loadRoles).toHaveBeenCalledTimes(1)
  })

  it('ignores a roles answer that arrives after the person signed out', async () => {
    const api = createFakeAuthApi({ roles: personas.student })
    let release!: () => void
    api.rolesGate = new Promise<void>((resolve) => (release = resolve))
    renderProvider(api)
    await waitFor(() => expect(api.loadRoles).toHaveBeenCalled())

    await userEvent.click(screen.getByText('sign out'))
    await waitFor(() => expect(state()).toBe('signedOut expired=false'))
    await act(async () => release())
    expect(state()).toBe('signedOut expired=false')
  })
})
