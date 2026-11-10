import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createPushApi } from '../notifications/pushApi'
import { createFakeBrowser, createFakePrefs, createFakeStore, VAPID } from '../test/fakePush'
import { personas } from '../test/fixtures'
import { page, renderAdmin } from '../test/renderAdmin'

vi.mock('../teacher/calendar/WeekCalendar', async () => import('../test/mockCalendar'))

function pushApi(browser = createFakeBrowser()) {
  const store = createFakeStore()
  const api = createPushApi({ env: browser, store, prefs: createFakePrefs(), vapidKey: VAPID })
  return { api, store, browser }
}

describe('notifications in the app shell', () => {
  it('invites a person who has just signed in to switch notifications on', async () => {
    const { api, store } = pushApi()
    renderAdmin('/administracija', { push: api })
    await page('Administracija')

    await userEvent.click(await screen.findByRole('button', { name: 'Uključi obaveštenja' }))
    await waitFor(() => expect(store.rows).toHaveLength(1))
    expect(store.rows[0].profileId).toBe(personas.admin.profileId)
  })

  it('keeps the bell in the header, which opens the settings of the device', async () => {
    const { api } = pushApi(createFakeBrowser({ permissionState: 'granted' }))
    renderAdmin('/administracija', { push: api })
    await page('Administracija')

    await userEvent.click(await screen.findByRole('button', { name: 'Obaveštenja' }))
    const dialog = await screen.findByRole('dialog', { name: 'Obaveštenja' })
    expect(await screen.findByText('Obaveštenja su uključena na ovom uređaju.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Zatvori' }))
    expect(dialog).not.toBeInTheDocument()
  })

  it('stops notifications to this device when the person signs out', async () => {
    const { api, store } = pushApi(createFakeBrowser({ permissionState: 'granted' }))
    const release = vi.spyOn(api, 'release')
    const { auth } = renderAdmin('/administracija', { push: api })
    await page('Administracija')
    await waitFor(() => expect(store.rows).toHaveLength(1))

    await userEvent.click(screen.getByRole('button', { name: 'Odjavi se' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
    expect(release).toHaveBeenCalledWith(personas.admin.profileId)
    expect(store.rows).toEqual([])
  })

  it('signs out even when the device cannot be released', async () => {
    const { api } = pushApi()
    vi.spyOn(api, 'release').mockRejectedValue(new Error('offline'))
    const { auth } = renderAdmin('/administracija', { push: api })
    await page('Administracija')
    await userEvent.click(screen.getByRole('button', { name: 'Odjavi se' }))
    await waitFor(() => expect(auth.signOut).toHaveBeenCalled())
  })

  it('shows nothing about notifications in an app without push', async () => {
    renderAdmin('/administracija')
    await page('Administracija')
    expect(screen.queryByRole('button', { name: 'Obaveštenja' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
