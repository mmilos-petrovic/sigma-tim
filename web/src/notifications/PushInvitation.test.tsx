import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createFakeBrowser,
  createFakePrefs,
  createFakeStore,
  VAPID,
  type FakeBrowser,
} from '../test/fakePush'
import { NotificationsButton, NotificationsDialog } from './NotificationSettings'
import { PushApiProvider, PushDevice } from './PushDevice'
import { PushInvitation } from './PushInvitation'
import { createPushApi } from './pushApi'
import { readPromptState } from './promptState'

const ME = 'profile-me'

/** The page as the shell builds it; `settings` also opens the settings window. */
function renderApp(
  browser: FakeBrowser,
  { vapid = VAPID as string | null, settings = false } = {},
) {
  const store = createFakeStore()
  const prefs = createFakePrefs()
  const api = createPushApi({ env: browser, store, prefs, vapidKey: vapid ?? undefined })
  const view = render(
    <PushApiProvider api={api}>
      <PushDevice profileId={ME}>
        <PushInvitation profileId={ME} />
        <NotificationsButton onOpen={() => undefined} />
        {settings && <NotificationsDialog onClose={() => undefined} />}
      </PushDevice>
    </PushApiProvider>,
  )
  return { ...view, browser, store, prefs }
}

describe('the invitation after the first sign-in', () => {
  it('asks once, and switches notifications on when the person agrees', async () => {
    const user = userEvent.setup()
    const { store } = renderApp(createFakeBrowser())
    await screen.findByRole('dialog', { name: 'Uključite obaveštenja' })
    await user.click(screen.getByRole('button', { name: 'Uključi obaveštenja' }))
    await waitFor(() => expect(store.rows).toHaveLength(1))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Uključite obaveštenja' })).toBeNull(),
    )
    expect(screen.queryByRole('complementary', { name: 'Obaveštenja' })).toBeNull()
  })

  it('leaves a banner after "Ne sada", and nothing once the banner is closed', async () => {
    const user = userEvent.setup()
    const { store, unmount } = renderApp(createFakeBrowser())
    await screen.findByRole('dialog', { name: 'Uključite obaveštenja' })
    await user.click(screen.getByRole('button', { name: 'Ne sada' }))

    const banner = await screen.findByRole('complementary', { name: 'Obaveštenja' })
    expect(banner).toHaveTextContent('Obaveštenja su isključena na ovom uređaju.')
    expect(readPromptState(ME)).toBe('asked')
    expect(store.rows).toEqual([])

    await user.click(screen.getByRole('button', { name: 'Zatvori obaveštenje o obaveštenjima' }))
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
    expect(readPromptState(ME)).toBe('dismissed')

    // the next visit shows neither
    unmount()
    renderApp(createFakeBrowser())
    await screen.findByRole('button', { name: 'Obaveštenja' })
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(screen.queryByRole('dialog', { name: 'Uključite obaveštenja' })).toBeNull()
  })

  it('the banner can switch notifications on', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem(`push-prompt:${ME}`, 'asked')
    const { store } = renderApp(createFakeBrowser())
    await user.click(await screen.findByRole('button', { name: 'Uključi' }))
    await waitFor(() => expect(store.rows).toHaveLength(1))
    await waitFor(() => expect(screen.queryByRole('complementary')).toBeNull())
  })

  it('Escape counts as "Ne sada"', async () => {
    const user = userEvent.setup()
    renderApp(createFakeBrowser())
    await screen.findByRole('dialog', { name: 'Uključite obaveštenja' })
    await user.keyboard('{Escape}')
    await screen.findByRole('complementary', { name: 'Obaveštenja' })
  })

  it('does not bring the invitation back after the browser refuses', async () => {
    const user = userEvent.setup()
    renderApp(createFakeBrowser({ answer: 'denied' }))
    await screen.findByRole('dialog', { name: 'Uključite obaveštenja' })
    await user.click(screen.getByRole('button', { name: 'Uključi obaveštenja' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Uključite obaveštenja' })).toBeNull(),
    )
    expect(screen.queryByRole('complementary')).toBeNull()
    expect(readPromptState(ME)).toBe('asked')
  })

  it('gives way to the banner when switching on fails, so the person can try again', async () => {
    const user = userEvent.setup()
    renderApp(
      createFakeBrowser({ permissionState: 'default', answer: 'granted', subscribeFails: true }),
    )
    await screen.findByRole('dialog', { name: 'Uključite obaveštenja' })
    await user.click(screen.getByRole('button', { name: 'Uključi obaveštenja' }))
    const banner = await screen.findByRole('complementary', { name: 'Obaveštenja' })
    expect(banner).toHaveTextContent('isključena')
    expect(screen.getByRole('button', { name: 'Uključi' })).toBeEnabled()
  })

  it('shows how to install the app on an iPhone instead of asking', async () => {
    const user = userEvent.setup()
    renderApp(createFakeBrowser({ supported: false, needsInstall: true }))
    const invitation = await screen.findByRole('dialog', {
      name: 'Dodajte aplikaciju na početni ekran',
    })
    expect(invitation).toHaveTextContent('Dodaj na početni ekran')
    expect(screen.queryByRole('button', { name: 'Uključi obaveštenja' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'U redu' }))
    const banner = await screen.findByRole('complementary', { name: 'Obaveštenja' })
    expect(banner).toHaveTextContent('dodajte aplikaciju na početni ekran')

    await user.click(screen.getByRole('button', { name: 'Kako' }))
    expect(
      await screen.findByRole('dialog', { name: 'Dodajte aplikaciju na početni ekran' }),
    ).toBeInTheDocument()
  })

  it('stays out of the way when notifications are on, blocked, unsupported or not set up', async () => {
    for (const browser of [
      createFakeBrowser({ permissionState: 'granted' }),
      createFakeBrowser({ permissionState: 'denied' }),
      createFakeBrowser({ supported: false }),
    ]) {
      const { unmount } = renderApp(browser)
      await screen.findByRole('button', { name: 'Obaveštenja' })
      expect(screen.queryByRole('dialog', { name: 'Uključite obaveštenja' })).toBeNull()
      expect(screen.queryByRole('complementary')).toBeNull()
      unmount()
    }
    renderApp(createFakeBrowser(), { vapid: null })
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Obaveštenja' })).toBeNull())
    expect(screen.queryByRole('dialog', { name: 'Uključite obaveštenja' })).toBeNull()
  })

  it('has nothing to show in an app without push (tests, for example)', () => {
    render(<PushInvitation profileId={ME} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    render(<NotificationsButton onOpen={() => undefined} />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('the settings of this device', () => {
  // the person has been through the invitation: only the settings are in play
  beforeEach(() => window.localStorage.setItem(`push-prompt:${ME}`, 'dismissed'))

  const settings = () => screen.findByRole('dialog', { name: 'Obaveštenja' })

  it('turns notifications on when they are already allowed in the browser, and off again', async () => {
    const user = userEvent.setup()
    const { store, prefs } = renderApp(createFakeBrowser({ permissionState: 'granted' }), {
      settings: true,
    })
    const dialog = await settings()
    expect(await screen.findByText('Obaveštenja su uključena na ovom uređaju.')).toBeInTheDocument()
    expect(store.rows).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Isključi obaveštenja' }))
    expect(
      await screen.findByText('Obaveštenja su isključena na ovom uređaju.'),
    ).toBeInTheDocument()
    expect(store.rows).toEqual([])
    expect(prefs.isOff(ME)).toBe(true)
    expect(dialog).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Uključi obaveštenja' }))
    expect(await screen.findByText('Obaveštenja su uključena na ovom uređaju.')).toBeInTheDocument()
    expect(store.rows).toHaveLength(1)
  })

  it('does not switch itself on again after the person switched it off', async () => {
    const browser = createFakeBrowser({ permissionState: 'granted' })
    const store = createFakeStore()
    const prefs = createFakePrefs()
    prefs.setOff(ME, true)
    const api = createPushApi({ env: browser, store, prefs, vapidKey: VAPID })
    render(
      <PushApiProvider api={api}>
        <PushDevice profileId={ME}>
          <NotificationsDialog onClose={() => undefined} />
        </PushDevice>
      </PushApiProvider>,
    )
    expect(
      await screen.findByText('Obaveštenja su isključena na ovom uređaju.'),
    ).toBeInTheDocument()
    expect(store.rows).toEqual([])
  })

  it('explains a blocked browser', async () => {
    renderApp(createFakeBrowser({ permissionState: 'denied' }), { settings: true })
    expect(await screen.findByText(/blokirana u pregledaču/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Uključi obaveštenja' })).toBeNull()
  })

  it('explains an unsupported browser', async () => {
    renderApp(createFakeBrowser({ supported: false }), { settings: true })
    expect(await screen.findByText('Ovaj pregledač ne podržava obaveštenja.')).toBeInTheDocument()
  })

  it('explains how to install the app on an iPhone', async () => {
    renderApp(createFakeBrowser({ supported: false, needsInstall: true }), { settings: true })
    const dialog = await settings()
    expect(dialog).toHaveTextContent('Dodaj na početni ekran')
  })

  it('says so when switching on fails', async () => {
    const user = userEvent.setup()
    renderApp(
      createFakeBrowser({ permissionState: 'default', answer: 'granted', subscribeFails: true }),
      { settings: true },
    )
    await settings()
    await user.click(await screen.findByRole('button', { name: 'Uključi obaveštenja' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nije uspelo.')
    // the button is still there to try again
    expect(screen.getByRole('button', { name: 'Uključi obaveštenja' })).toBeEnabled()
  })
})
