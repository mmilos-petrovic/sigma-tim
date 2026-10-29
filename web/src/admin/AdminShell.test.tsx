import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { personas } from '../test/fixtures'
import { createFakeAdminApi } from '../test/fakeAdminApi'
import { page, renderAdmin } from '../test/renderAdmin'
import { AdminError } from './adminApi'

// An administrator who teaches can switch to the schedule; the real calendar is checked in the browser.
vi.mock('../teacher/calendar/WeekCalendar', async () => import('../test/mockCalendar'))

describe('administration navigation', () => {
  it('offers the five sections and marks the current one', async () => {
    renderAdmin('/administracija')
    await page('Administracija')

    const nav = within(screen.getByRole('navigation', { name: 'Glavna navigacija' }))
    for (const name of [
      'Pregled',
      'Nastavnici',
      'Predmeti',
      'Lokacije',
      'Zahtevi za preuzimanje',
    ]) {
      expect(nav.getByRole('link', { name })).toBeInTheDocument()
    }
    expect(nav.getByRole('link', { name: 'Pregled' })).toHaveAttribute('aria-current', 'page')
  })

  it('opens each section', async () => {
    renderAdmin('/administracija')
    await page('Administracija')
    const nav = within(screen.getByRole('navigation', { name: 'Glavna navigacija' }))

    await userEvent.click(nav.getByRole('link', { name: 'Nastavnici' }))
    expect(await page('Nastavnici')).toBeInTheDocument()
    expect(nav.getByRole('link', { name: 'Nastavnici' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(nav.getByRole('link', { name: 'Predmeti' }))
    expect(await page('Predmeti')).toBeInTheDocument()
    await userEvent.click(nav.getByRole('link', { name: 'Lokacije' }))
    expect(await page('Lokacije')).toBeInTheDocument()
    await userEvent.click(nav.getByRole('link', { name: 'Zahtevi za preuzimanje' }))
    expect(await page('Zahtevi za preuzimanje')).toBeInTheDocument()
  })

  it('says a page does not exist, inside the administration', async () => {
    renderAdmin('/administracija/nesto')
    expect(await page('Stranica nije pronađena')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Glavna navigacija' })).toBeInTheDocument()
  })

  it('is closed to a teacher who is not an admin', async () => {
    renderAdmin('/administracija/nastavnici', { roles: personas.teacher })
    expect(await page('Moj raspored')).toBeInTheDocument()
  })

  it('stays open to an admin who is also a teacher', async () => {
    renderAdmin('/administracija/predmeti', { roles: personas.adminTeacher })
    expect(await page('Predmeti')).toBeInTheDocument()
  })
})

describe('overview', () => {
  it('counts what the school has so far', async () => {
    renderAdmin('/administracija')
    await page('Administracija')

    const link = async (name: RegExp) =>
      within(await screen.findByRole('main')).findByRole('link', { name })
    expect(await link(/^Predmeti/)).toHaveTextContent('3')
    expect(await link(/^Lokacije/)).toHaveTextContent('2')
    expect(await link(/^Nastavnici/)).toHaveTextContent('2') // two of the three teachers are active
    expect(await link(/^Zahtevi za preuzimanje/)).toHaveTextContent('2')
  })

  it('points a new school at the first thing to add', async () => {
    renderAdmin('/administracija', {
      api: createFakeAdminApi({ subjects: [], teachers: [], locations: [], takeovers: [] }),
    })
    await page('Administracija')
    expect(await screen.findByText('Dodajte prvi predmet')).toBeInTheDocument()
    expect(screen.getByText('Dodajte prvu lokaciju')).toBeInTheDocument()
    expect(screen.getByText('Dodajte prvog nastavnika')).toBeInTheDocument()
    expect(screen.getByText('Nema zahteva na čekanju')).toBeInTheDocument()
  })

  it('shows a loading state, then the counts', async () => {
    const api = createFakeAdminApi()
    const release = api.hold('listSubjects')
    renderAdmin('/administracija', { api })
    await page('Administracija') // the page itself, not the loading screen shown while the account loads
    expect(await screen.findByRole('status')).toHaveTextContent('Učitavanje')
    release()
    expect(
      await within(await screen.findByRole('main')).findByRole('link', { name: /^Predmeti/ }),
    ).toHaveTextContent('3')
  })

  it('explains a failure and offers a retry', async () => {
    const api = createFakeAdminApi()
    api.failNext('listSubjects', new AdminError('network'))
    renderAdmin('/administracija', { api })

    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(
      await within(await screen.findByRole('main')).findByRole('link', { name: /^Predmeti/ }),
    ).toHaveTextContent('3')
  })
})
