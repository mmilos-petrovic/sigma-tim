import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createFakeAdminApi } from '../../test/fakeAdminApi'
import { inDialog, page, renderAdmin } from '../../test/renderAdmin'
import { AdminError } from '../adminApi'

const student = (name: string) => screen.findByRole('article', { name })
const open = async (api = createFakeAdminApi()) => {
  const view = renderAdmin('/administracija/zahtevi', { api })
  await page('Zahtevi za preuzimanje')
  await student('Luka Ilić')
  return view
}

describe('takeover requests', () => {
  it('groups the requests by student and shows who asks', async () => {
    await open()
    const luka = within(await student('Luka Ilić'))
    expect(luka.getByText('OŠ Vuk Karadžić, razred 7a')).toBeInTheDocument()
    expect(luka.getByText('Ana Nikolić')).toBeInTheDocument()
    expect(luka.getByText('Marko Jovanović')).toBeInTheDocument()
  })

  it('says when nothing is waiting', async () => {
    renderAdmin('/administracija/zahtevi', { api: createFakeAdminApi({ takeovers: [] }) })
    expect(await screen.findByText('Nema zahteva na čekanju.')).toBeInTheDocument()
  })

  it('copes with a student whose school details are missing', async () => {
    const api = createFakeAdminApi()
    api.state.takeovers = [
      {
        ...api.state.takeovers[0],
        student: { ...api.state.takeovers[0].student, school: null, grade: null, section: null },
      },
    ]
    renderAdmin('/administracija/zahtevi', { api })
    const luka = within(await student('Luka Ilić'))
    expect(luka.getByText('Ana Nikolić')).toBeInTheDocument()
    expect(luka.queryByText(/razred/)).not.toBeInTheDocument()
  })

  it('approves one request after confirmation, and the competing ones go with it', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await student('Luka Ilić')).getByRole('button', { name: 'Odobri: Ana Nikolić' }),
    )

    const dialog = await inDialog('Odobravanje zahteva')
    expect(dialog.getByText(/Luka Ilić postaje učenik nastavnika Ana Nikolić/)).toBeInTheDocument()
    expect(dialog.getByText(/Ostali zahtevi za tog učenika biće odbijeni/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Odobri' }))

    expect(adminApi.approveTakeover).toHaveBeenCalledWith('q-1')
    expect(await screen.findByText('Nema zahteva na čekanju.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Zahtev je odobren.')
  })

  it('leaves everything as it was when the approval is cancelled', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await student('Luka Ilić')).getByRole('button', { name: 'Odobri: Ana Nikolić' }),
    )
    await userEvent.click(
      (await inDialog('Odobravanje zahteva')).getByRole('button', { name: 'Odustani' }),
    )
    expect(adminApi.approveTakeover).not.toHaveBeenCalled()
  })

  it('rejects a request and keeps the other one', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await student('Luka Ilić')).getByRole('button', { name: 'Odbij: Marko Jovanović' }),
    )

    expect(adminApi.rejectTakeover).toHaveBeenCalledWith('q-2')
    const luka = within(await student('Luka Ilić'))
    await luka.findByText('Ana Nikolić')
    expect(luka.queryByText('Marko Jovanović')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Zahtev je odbijen.')
  })

  it('explains why an approval was refused', async () => {
    const { adminApi } = await open()
    adminApi.failNext(
      'approveTakeover',
      new AdminError('PT409', 'the student already has a teacher'),
    )
    await userEvent.click(
      within(await student('Luka Ilić')).getByRole('button', { name: 'Odobri: Ana Nikolić' }),
    )
    const dialog = await inDialog('Odobravanje zahteva')
    await userEvent.click(dialog.getByRole('button', { name: 'Odobri' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Učenik već ima nastavnika.')
  })

  it('explains a failure to load, with a retry', async () => {
    const api = createFakeAdminApi()
    api.failNext('listTakeovers', new AdminError('network'))
    renderAdmin('/administracija/zahtevi', { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await student('Luka Ilić')).toBeInTheDocument()
  })
})
