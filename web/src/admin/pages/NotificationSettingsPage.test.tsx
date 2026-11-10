import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createFakeAdminApi, type FakeAdminApi } from '../../test/fakeAdminApi'
import { page, renderAdmin } from '../../test/renderAdmin'
import { AdminError, NOTIFICATION_PAGE_SIZE } from '../adminApi'

const open = async (api: FakeAdminApi = createFakeAdminApi()) => {
  const view = renderAdmin('/administracija/podesavanja', { api })
  await page('Podešavanja')
  await screen.findByRole('form', { name: 'Tihi sati i podsetnici' })
  return view
}

const form = () => within(screen.getByRole('form', { name: 'Tihi sati i podsetnici' }))
const save = () => userEvent.click(form().getByRole('button', { name: 'Sačuvaj podešavanja' }))
const minutes = () => form().getByLabelText('Koliko minuta pre početka časa')

describe('quiet hours and reminders', () => {
  it('shows what the database holds', async () => {
    await open()
    expect(
      form().getByRole('checkbox', { name: /Ne šalji obaveštenja u tihim satima/ }),
    ).not.toBeChecked()
    expect(form().getByLabelText('Od, sat')).toHaveValue('22')
    expect(form().getByLabelText('Od, minuti')).toHaveValue('00')
    expect(form().getByLabelText('Do, sat')).toHaveValue('07')
    expect(form().getByRole('checkbox', { name: 'Šalji podsetnik pre časa' })).toBeChecked()
    expect(minutes()).toHaveValue(60)
  })

  it('keeps the times switched off until quiet hours are on', async () => {
    await open()
    expect(form().getByLabelText('Od, sat')).toBeDisabled()
    await userEvent.click(
      form().getByRole('checkbox', { name: /Ne šalji obaveštenja u tihim satima/ }),
    )
    expect(form().getByLabelText('Od, sat')).toBeEnabled()
  })

  it('saves quiet hours, the reminder and the texts', async () => {
    const api = createFakeAdminApi()
    await open(api)
    await userEvent.click(
      form().getByRole('checkbox', { name: /Ne šalji obaveštenja u tihim satima/ }),
    )
    await userEvent.selectOptions(form().getByLabelText('Od, sat'), '21')
    await userEvent.selectOptions(form().getByLabelText('Od, minuti'), '30')
    await userEvent.selectOptions(form().getByLabelText('Do, sat'), '06')
    await userEvent.clear(minutes())
    await userEvent.type(minutes(), '90')
    await userEvent.type(form().getByLabelText('Tekst dobrodošlice'), '  Dobro došli!  ')
    await userEvent.type(form().getByLabelText('Kontakt podaci škole'), 'Tel 011 123 4567')
    await save()

    await waitFor(() =>
      expect(api.calls.saveNotificationSettings).toHaveBeenCalledWith({
        quietHoursEnabled: true,
        quietStart: '21:30',
        quietEnd: '06:00',
        reminderEnabled: true,
        reminderMinutes: 90,
        welcomeText: '  Dobro došli!  ',
        schoolContact: 'Tel 011 123 4567',
      }),
    )
    expect(await screen.findByText('Podešavanja su sačuvana.')).toBeInTheDocument()
    expect(api.state.notificationSettings).toMatchObject({
      quietHoursEnabled: true,
      quietStart: '21:30',
      reminderMinutes: 90,
      welcomeText: 'Dobro došli!',
    })
  })

  it('switches the reminder off', async () => {
    const api = createFakeAdminApi()
    await open(api)
    await userEvent.click(form().getByRole('checkbox', { name: 'Šalji podsetnik pre časa' }))
    expect(minutes()).toBeDisabled()
    await save()
    await waitFor(() => expect(api.state.notificationSettings.reminderEnabled).toBe(false))
  })

  it.each(['4', '721', '', '2.5', '-10'])(
    'does not send %s as the reminder time',
    async (typed) => {
      const api = createFakeAdminApi()
      await open(api)
      await userEvent.clear(minutes())
      if (typed) await userEvent.type(minutes(), typed)
      await save()
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Vreme podsetnika mora biti između 5 i 720 minuta.',
      )
      expect(api.calls.saveNotificationSettings).not.toHaveBeenCalled()
    },
  )

  it('does not send quiet hours that start and end together', async () => {
    const api = createFakeAdminApi()
    await open(api)
    await userEvent.click(
      form().getByRole('checkbox', { name: /Ne šalji obaveštenja u tihim satima/ }),
    )
    await userEvent.selectOptions(form().getByLabelText('Do, sat'), '22')
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Tihi sati ne mogu da počnu i završe se u isto vreme.',
    )
    expect(api.calls.saveNotificationSettings).not.toHaveBeenCalled()
  })

  it('explains a refusal of the database', async () => {
    const api = createFakeAdminApi()
    await open(api)
    api.failNext('saveNotificationSettings', new AdminError('PT403', 'not allowed'))
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent('Nemate dozvolu za ovu radnju.')
    expect(screen.queryByText('Podešavanja su sačuvana.')).not.toBeInTheDocument()
  })

  it('explains a lost connection and lets the person try again', async () => {
    const api = createFakeAdminApi()
    await open(api)
    api.failNext('saveNotificationSettings', new AdminError('network', 'failed to fetch'))
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom.')
    await save()
    expect(await screen.findByText('Podešavanja su sačuvana.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('is closed to a teacher who is not an admin', async () => {
    const { personas } = await import('../../test/fixtures')
    renderAdmin('/administracija/podesavanja', { roles: personas.teacher })
    expect(await page('Moj raspored')).toBeInTheDocument()
  })
})

describe('email instead of push', () => {
  const switches = () => within(screen.getByRole('region', { name: 'Email umesto obaveštenja' }))

  it('lists every kind of notice with its switch, the reminder off by default', async () => {
    await open()
    expect(switches().getAllByRole('checkbox')).toHaveLength(10)
    expect(switches().getByRole('checkbox', { name: 'Pomeren čas' })).toBeChecked()
    expect(switches().getByRole('checkbox', { name: 'Podsetnik pre časa' })).not.toBeChecked()
  })

  it('switches one kind off and on at once', async () => {
    const api = createFakeAdminApi()
    await open(api)
    await userEvent.click(switches().getByRole('checkbox', { name: 'Pomeren čas' }))
    await waitFor(() =>
      expect(api.calls.setEmailFallback).toHaveBeenCalledWith('lesson_moved', false),
    )
    await waitFor(() =>
      expect(switches().getByRole('checkbox', { name: 'Pomeren čas' })).not.toBeChecked(),
    )

    await userEvent.click(switches().getByRole('checkbox', { name: 'Podsetnik pre časa' }))
    await waitFor(() =>
      expect(api.calls.setEmailFallback).toHaveBeenLastCalledWith('lesson_reminder', true),
    )
    await waitFor(() =>
      expect(switches().getByRole('checkbox', { name: 'Podsetnik pre časa' })).toBeChecked(),
    )
  })

  it('shows the welcome and the test as always emailed and does not let them be switched', async () => {
    await open()
    for (const name of [
      /^Dobrodošlica\s+\(uvek se šalje emailom\)$/,
      /^Probno obaveštenje\s+\(uvek se šalje emailom\)$/,
    ]) {
      const box = switches().getByRole('checkbox', { name })
      expect(box).toBeChecked()
      expect(box).toBeDisabled()
    }
  })

  it('says so when it cannot be saved, and leaves the switch as it was', async () => {
    const api = createFakeAdminApi()
    await open(api)
    api.failNext('setEmailFallback', new AdminError('PT409', 'always'))
    await userEvent.click(switches().getByRole('checkbox', { name: 'Pomeren čas' }))
    expect(await switches().findByRole('alert')).toHaveTextContent(
      'Ovo obaveštenje se uvek šalje emailom.',
    )
    expect(switches().getByRole('checkbox', { name: 'Pomeren čas' })).toBeChecked()
  })
})

describe('the test notice', () => {
  it('queues one and shows it in the log', async () => {
    const api = createFakeAdminApi()
    await open(api)
    const log = within(screen.getByRole('region', { name: 'Dnevnik obaveštenja' }))
    await screen.findByText('Ana Petrović')
    expect(log.queryByText('Probno obaveštenje')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Pošalji probno obaveštenje' }))
    expect(api.calls.sendTestNotification).toHaveBeenCalledTimes(1)
    expect(await screen.findByText(/Probno obaveštenje je u redu za slanje/)).toBeInTheDocument()
    expect(await log.findByText('Probno obaveštenje')).toBeInTheDocument()
  })

  it('explains a failure', async () => {
    const api = createFakeAdminApi()
    await open(api)
    api.failNext('sendTestNotification', new AdminError('PT403', 'not allowed'))
    await userEvent.click(screen.getByRole('button', { name: 'Pošalji probno obaveštenje' }))
    const region = within(screen.getByRole('region', { name: 'Probno obaveštenje' }))
    expect(await region.findByRole('alert')).toHaveTextContent('Nemate dozvolu za ovu radnju.')
  })
})

describe('the log', () => {
  const log = () => within(screen.getByRole('region', { name: 'Dnevnik obaveštenja' }))
  const rowOf = (text: string) => within(log().getByText(text).closest('tr')!)

  it('shows who got what and how it went, newest first', async () => {
    await open()
    await log().findByText('Pomeren čas')
    const rows = log().getAllByRole('row').slice(1)
    expect(rows).toHaveLength(6)
    expect(within(rows[0]).getByText('Zauzet slobodan termin (nastavniku)')).toBeInTheDocument()
    expect(within(rows[5]).getByText('Novi čas')).toBeInTheDocument()

    expect(rowOf('Pomeren čas').getByText('Poslato · Email')).toBeInTheDocument()
    expect(rowOf('Novi čas').getByText('Poslato · Push')).toBeInTheDocument()
    expect(rowOf('Podsetnik pre časa').getByText('U redu za slanje')).toBeInTheDocument()
    expect(rowOf('Potvrđena rezervacija').getByText('Ponovni pokušaj')).toBeInTheDocument()
    expect(rowOf('Potvrđena rezervacija').getByText('timeout')).toBeInTheDocument()
    expect(rowOf('Otkazan čas').getByText(/Čeka kraj tihih sati \(do /)).toBeInTheDocument()
    expect(
      rowOf('Zauzet slobodan termin (nastavniku)').getByText('Nije uspelo'),
    ).toBeInTheDocument()
    expect(
      rowOf('Zauzet slobodan termin (nastavniku)').getByText('push service said 400'),
    ).toBeInTheDocument()
    expect(log().getByText('ana.nikolic@example.test')).toBeInTheDocument()
  })

  it('never shows the text of a notice', async () => {
    await open()
    await log().findByText('Pomeren čas')
    expect(log().queryByRole('columnheader', { name: /Tekst|Sadržaj/ })).not.toBeInTheDocument()
  })

  it('filters by state', async () => {
    const api = createFakeAdminApi()
    await open(api)
    await log().findByText('Pomeren čas')
    await userEvent.selectOptions(log().getByLabelText('Stanje'), 'failed')
    await waitFor(() => expect(log().getAllByRole('row')).toHaveLength(2))
    expect(api.calls.listNotifications).toHaveBeenLastCalledWith({ before: null, state: 'failed' })
    expect(log().queryByText('Pomeren čas')).not.toBeInTheDocument()

    await userEvent.selectOptions(log().getByLabelText('Stanje'), 'waiting')
    expect(await log().findByText('Otkazan čas')).toBeInTheDocument()
    await userEvent.selectOptions(log().getByLabelText('Stanje'), 'sent')
    expect(await log().findByText('Novi čas')).toBeInTheDocument()
  })

  it('says when there is nothing to show', async () => {
    const api = createFakeAdminApi()
    api.state.notificationLog = []
    await open(api)
    expect(await log().findByText('Nema obaveštenja.')).toBeInTheDocument()
  })

  it('offers to send a failed notice again, and only that one', async () => {
    const api = createFakeAdminApi()
    await open(api)
    await log().findByText('Pomeren čas')
    expect(log().getAllByRole('button', { name: /Pošalji ponovo/ })).toHaveLength(1)

    await userEvent.click(
      log().getByRole('button', {
        name: 'Pošalji ponovo: Zauzet slobodan termin (nastavniku), Ana Nikolić',
      }),
    )
    expect(api.calls.resendNotification).toHaveBeenCalledWith(6)
    expect(await screen.findByText('Obaveštenje je ponovo u redu za slanje.')).toBeInTheDocument()
    await waitFor(() =>
      expect(log().queryByRole('button', { name: /Pošalji ponovo/ })).not.toBeInTheDocument(),
    )
    expect(
      rowOf('Zauzet slobodan termin (nastavniku)').getByText('U redu za slanje'),
    ).toBeInTheDocument()
  })

  it('explains it when the notice was sent in the meantime', async () => {
    const api = createFakeAdminApi()
    await open(api)
    await log().findByText('Pomeren čas')
    api.failNext(
      'resendNotification',
      new AdminError('PT409', 'only a failed notice can be sent again'),
    )
    await userEvent.click(log().getByRole('button', { name: /Pošalji ponovo/ }))
    expect(await log().findByRole('alert')).toHaveTextContent('Samo obaveštenje koje nije uspelo')
  })

  it('shows older notices a page at a time', async () => {
    const api = createFakeAdminApi()
    const template = api.state.notificationLog[0]
    api.state.notificationLog = Array.from({ length: NOTIFICATION_PAGE_SIZE + 5 }, (_, index) => ({
      ...template,
      id: index + 1,
      recipientName: `Primalac ${index + 1}`,
    }))
    await open(api)
    await log().findByText(`Primalac ${NOTIFICATION_PAGE_SIZE + 5}`)
    expect(log().getAllByRole('row')).toHaveLength(NOTIFICATION_PAGE_SIZE + 1)
    expect(log().queryByText('Primalac 5')).not.toBeInTheDocument()

    await userEvent.click(log().getByRole('button', { name: 'Prikaži starija' }))
    expect(await log().findByText('Primalac 5')).toBeInTheDocument()
    expect(log().getAllByRole('row')).toHaveLength(NOTIFICATION_PAGE_SIZE + 5 + 1)
    expect(log().getByText('Primalac 1')).toBeInTheDocument()
    expect(log().queryByRole('button', { name: 'Prikaži starija' })).not.toBeInTheDocument()
    expect(api.calls.listNotifications).toHaveBeenLastCalledWith({ before: 6, state: null })
  })

  it('does not offer more when the log ends exactly on a page that is not full', async () => {
    await open()
    await log().findByText('Pomeren čas')
    expect(log().queryByRole('button', { name: 'Prikaži starija' })).not.toBeInTheDocument()
  })

  it('offers to try again when the log cannot be loaded', async () => {
    const api = createFakeAdminApi()
    api.failNext('listNotifications', new AdminError('network', 'failed to fetch'))
    await open(api)
    expect(await log().findByRole('alert')).toHaveTextContent('Nema veze sa serverom.')
    await userEvent.click(log().getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await log().findByText('Pomeren čas')).toBeInTheDocument()
  })
})

describe('loading the page', () => {
  it('shows a loading state and then the settings', async () => {
    const api = createFakeAdminApi()
    const release = api.hold('getNotificationSettings')
    renderAdmin('/administracija/podesavanja', { api })
    await page('Podešavanja')
    expect(screen.getByRole('status')).toHaveTextContent('Učitavanje')
    release()
    expect(await screen.findByRole('form', { name: 'Tihi sati i podsetnici' })).toBeInTheDocument()
  })

  it('explains a failure and offers to try again', async () => {
    const api = createFakeAdminApi()
    api.failNext('getNotificationSettings', new AdminError('network', 'failed to fetch'))
    renderAdmin('/administracija/podesavanja', { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom.')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await screen.findByRole('form', { name: 'Tihi sati i podsetnici' })).toBeInTheDocument()
  })
})
