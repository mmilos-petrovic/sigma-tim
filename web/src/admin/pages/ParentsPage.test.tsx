import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createFakeAdminApi } from '../../test/fakeAdminApi'
import { inDialog, page, renderAdmin } from '../../test/renderAdmin'
import { AdminError } from '../adminApi'

const PATH = '/administracija/roditelji'
const row = (name: string) => screen.findByRole('row', { name: new RegExp(name) })
const erase = (name: string) =>
  screen.findByRole('button', { name: `Obriši na zahtev roditelja ${name}` })
const typeName = async (dialog: ReturnType<typeof within>, name: string) =>
  userEvent.type(dialog.getByLabelText(/Za potvrdu upišite ime i prezime/), name)

async function open(api = createFakeAdminApi()) {
  renderAdmin(PATH, { api })
  await page('Roditelji')
  await row('Mira Petrović')
  return api
}

describe('the administrator’s list of parents', () => {
  it('is a link of its own, right under the students', async () => {
    renderAdmin('/administracija')
    await page('Administracija')
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' })
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(links.indexOf('Roditelji')).toBe(links.indexOf('Učenici') + 1)
    expect(within(nav).getByRole('link', { name: 'Roditelji' })).toHaveAttribute(
      'href',
      '/administracija/roditelji',
    )
  })

  it('writes the name, the email, the day the parent was added and the children', async () => {
    await open()
    const mira = within(await row('Mira Petrović'))
    expect(mira.getByText('mira.petrovic@example.test')).toBeInTheDocument()
    expect(mira.getByText('20.02.2026')).toBeInTheDocument()
    expect(mira.getByText('Ana Petrović')).toBeInTheDocument()
    expect(within(await row('Jovan Ilić')).getByText('Nema dece')).toBeInTheDocument()
  })

  it('shows the parent added last on top', async () => {
    await open()
    const names = screen
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(names).toEqual([
      expect.stringContaining('Mira Petrović'),
      expect.stringContaining('Jovan Ilić'),
    ])
  })

  it('finds a parent by a word of the name or the email', async () => {
    await open()
    const search = screen.getByRole('searchbox', { name: /Pretraga/ })
    await userEvent.type(search, 'jovan')
    expect(screen.queryByRole('row', { name: /Mira Petrović/ })).not.toBeInTheDocument()
    expect(await row('Jovan Ilić')).toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 'nikoga')
    expect(await screen.findByText('Nema roditelja koji odgovaraju pretrazi.')).toBeInTheDocument()
  })

  it('searches the name and the email separately', async () => {
    renderAdmin(PATH, {
      api: createFakeAdminApi({
        parents: [
          {
            profileId: 'pr-sonja',
            firstName: 'Sonja',
            lastName: 'Kostić',
            email: 's.k@example.test',
            createdAt: '2026-05-01T10:00:00Z',
            childNames: [],
          },
          {
            profileId: 'pr-pera',
            firstName: 'Pera',
            lastName: 'Perić',
            email: 'pp@example.test',
            createdAt: '2026-05-02T10:00:00Z',
            childNames: [],
          },
        ],
      }),
    })
    await page('Roditelji')
    const search = await screen.findByRole('searchbox', { name: /Pretraga/ })
    await userEvent.type(search, 'sonja')
    expect(await row('Sonja Kostić')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Pera Perić/ })).not.toBeInTheDocument()
    await userEvent.clear(search)
    await userEvent.type(search, 's.k@example')
    expect(await row('Sonja Kostić')).toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Pera Perić/ })).not.toBeInTheDocument()
  })

  it('says so when there are no parents', async () => {
    renderAdmin(PATH, { api: createFakeAdminApi({ parents: [] }) })
    await page('Roditelji')
    expect(await screen.findByText('Još nema roditelja.')).toBeInTheDocument()
  })

  it('does not offer to erase a parent who still has a child, and says what to do first', async () => {
    await open()
    const mira = within(await row('Mira Petrović'))
    expect(mira.queryByRole('button')).not.toBeInTheDocument()
    expect(
      mira.getByText(/Prvo obrišite učenika ili uklonite roditelja sa učenika/),
    ).toBeInTheDocument()
  })

  it('asks for the name before it erases a parent without children', async () => {
    const api = await open()
    await userEvent.click(await erase('Jovan Ilić'))
    const dialog = await inDialog('Brisanje na zahtev')
    expect(dialog.getByText('Jovan Ilić')).toBeInTheDocument()
    expect(dialog.queryByText(/Održani časovi ostaju/)).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši sve podatke' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Upišite ime i prezime radi potvrde.',
    )
    expect(api.calls.erasePerson).not.toHaveBeenCalled()
  })

  it('erases the parent and the list forgets them', async () => {
    const api = await open()
    await userEvent.click(await erase('Jovan Ilić'))
    const dialog = await inDialog('Brisanje na zahtev')
    await typeName(dialog, 'Jovan Ilić')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši sve podatke' }))
    expect(api.calls.erasePerson).toHaveBeenCalledWith('pr-jovan')
    expect(await screen.findByRole('status')).toHaveTextContent('Podaci osobe su obrisani.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Jovan Ilić/ })).not.toBeInTheDocument(),
    )
  })

  it('changes nothing when the administrator backs out', async () => {
    const api = await open()
    await userEvent.click(await erase('Jovan Ilić'))
    await userEvent.click(
      (await inDialog('Brisanje na zahtev')).getByRole('button', { name: 'Odustani' }),
    )
    expect(api.calls.erasePerson).not.toHaveBeenCalled()
  })

  it('explains it when the parent got a child in the meantime', async () => {
    const api = await open()
    await userEvent.click(await erase('Jovan Ilić'))
    const dialog = await inDialog('Brisanje na zahtev')
    await typeName(dialog, 'Jovan Ilić')
    api.failNext(
      'erasePerson',
      new AdminError(
        'PT409',
        'a parent with children cannot be erased: erase or unlink the children first',
      ),
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši sve podatke' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Roditelj je još povezan sa učenikom. Prvo obrišite učenika ili uklonite roditelja sa učenika.',
    )
  })

  it('shows a load error with a way to try again', async () => {
    const api = createFakeAdminApi()
    api.failNext('listParents', new AdminError('network'))
    renderAdmin(PATH, { api })
    await page('Roditelji')
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await row('Mira Petrović')).toBeInTheDocument()
  })
})
