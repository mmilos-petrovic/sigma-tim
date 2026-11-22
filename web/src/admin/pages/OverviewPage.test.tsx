import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createFakeAdminApi } from '../../test/fakeAdminApi'
import { page, renderAdmin } from '../../test/renderAdmin'
import { AdminError } from '../adminApi'

const notices = () => within(screen.getByRole('region', { name: 'Obaveštenja' }))
const card = (name: string) => notices().getByRole('link', { name: new RegExp(name) })

describe('the overview: do notices get through', () => {
  it('counts the notices that gave up and the ones nobody tried', async () => {
    // the seed has one failed notice
    const api = createFakeAdminApi({ notificationOverdue: 4 })
    renderAdmin('/administracija', { api })
    await page('Administracija')

    const failed = await screen.findByRole('link', { name: /Neuspela obaveštenja/ })
    expect(failed).toHaveTextContent('1')
    expect(failed).toHaveTextContent('Otvorite dnevnik i pošaljite ih ponovo')
    expect(failed).toHaveClass('card--alert')
    expect(card('Čekaju na slanje')).toHaveTextContent('4')
    expect(card('Čekaju na slanje')).toHaveTextContent('slanje ne radi')
    expect(card('Čekaju na slanje')).toHaveClass('card--alert')
  })

  it('is a warning already for one notice that waits too long', async () => {
    const api = createFakeAdminApi({ notificationOverdue: 1 })
    api.state.notificationLog = api.state.notificationLog.filter((row) => row.state !== 'failed')
    renderAdmin('/administracija', { api })
    await page('Administracija')

    await screen.findByRole('link', { name: /Čekaju na slanje/ })
    expect(card('Čekaju na slanje')).toHaveTextContent('1')
    expect(card('Čekaju na slanje')).toHaveClass('card--alert')
    expect(card('Neuspela obaveštenja')).not.toHaveClass('card--alert')
  })

  it('says all is well when nothing failed and nothing waits', async () => {
    const api = createFakeAdminApi()
    api.state.notificationLog = api.state.notificationLog.filter((row) => row.state !== 'failed')
    renderAdmin('/administracija', { api })
    await page('Administracija')

    const failed = await screen.findByRole('link', { name: /Neuspela obaveštenja/ })
    expect(failed).toHaveTextContent('0')
    expect(failed).toHaveTextContent('Sva obaveštenja su stigla')
    expect(failed).not.toHaveClass('card--alert')
    expect(card('Čekaju na slanje')).toHaveTextContent('Slanje radi')
    expect(card('Čekaju na slanje')).not.toHaveClass('card--alert')
  })

  it('leads both cards to the log on the settings page', async () => {
    renderAdmin('/administracija')
    await page('Administracija')
    await screen.findByRole('link', { name: /Neuspela obaveštenja/ })
    for (const name of ['Neuspela obaveštenja', 'Čekaju na slanje']) {
      expect(card(name)).toHaveAttribute('href', '/administracija/podesavanja')
    }
  })

  it('says so when it cannot find out, instead of showing zeros, and the rest of the page stays', async () => {
    const api = createFakeAdminApi()
    api.failNext('getNotificationHealth', new AdminError('network', 'failed to fetch'))
    renderAdmin('/administracija', { api })
    await page('Administracija')

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Nema veze sa serverom')
    expect(screen.queryByRole('link', { name: /Neuspela obaveštenja/ })).not.toBeInTheDocument()
    expect(
      within(screen.getByRole('main')).getByRole('link', { name: /Predmeti/ }),
    ).toBeInTheDocument()

    await userEvent.click(within(alert).getByRole('button', { name: 'Pokušaj ponovo' }))
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /Neuspela obaveštenja/ })).toBeInTheDocument(),
    )
  })

  it('shows loading while the numbers are on their way', async () => {
    const api = createFakeAdminApi()
    const release = api.hold('getNotificationHealth')
    renderAdmin('/administracija', { api })
    await page('Administracija')
    expect(await screen.findByRole('region', { name: 'Obaveštenja' })).toHaveTextContent(
      'Učitavanje',
    )
    release()
    await screen.findByRole('link', { name: /Neuspela obaveštenja/ })
  })
})
