import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createFakeAdminApi } from '../../test/fakeAdminApi'
import { inDialog, page, renderAdmin } from '../../test/renderAdmin'
import { AdminError } from '../adminApi'

const PATH = '/administracija/ucenici'
const rows = async () => {
  await screen.findByRole('table')
  return screen.getAllByRole('row').slice(1) // without the header
}
const row = (name: string) => screen.findByRole('row', { name: new RegExp(name) })
const del = (label: string | RegExp) => screen.findByRole('button', { name: label })

async function open(api = createFakeAdminApi()) {
  renderAdmin(PATH, { api })
  await page('Učenici')
  await row('Luka Ilić')
  return api
}

describe('the administrator’s list of students', () => {
  it('is a link of its own, right under the teachers', async () => {
    renderAdmin('/administracija')
    await page('Administracija')
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' })
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(links.indexOf('Učenici')).toBe(links.indexOf('Nastavnici') + 1)
    expect(within(nav).getByRole('link', { name: 'Učenici' })).toHaveAttribute(
      'href',
      '/administracija/ucenici',
    )
  })

  it('shows the person added last on top, and a person who studies with two teachers once', async () => {
    await open()
    const names = (await rows()).map((r) => within(r).getAllByRole('cell')[0].textContent)
    expect(names).toHaveLength(3)
    expect(names[0]).toContain('Luka Ilić') // added in April
    expect(names[1]).toContain('Ana Petrović') // first added in February
    expect(names[2]).toContain('Neda Marković') // added in January
  })

  it('writes the name, the email, the day the student was added, the teachers, the places and the parents', async () => {
    await open()
    const luka = within(await row('Luka Ilić'))
    expect(luka.getByText('luka.ilic@example.test')).toBeInTheDocument()
    expect(luka.getByText('05.04.2026')).toBeInTheDocument()
    expect(luka.getByText('Ana Nikolić')).toBeInTheDocument()
    expect(luka.getByText('Zemun')).toBeInTheDocument()
    expect(luka.getByText('Nema roditelja')).toBeInTheDocument()

    const ana = within(await row('Ana Petrović'))
    expect(ana.getByText('10.02.2026')).toBeInTheDocument() // the first of her two records
    expect(ana.getByText('Ana Nikolić, Marko Jovanović')).toBeInTheDocument()
    expect(ana.getByText('Glavna lokacija, Zemun')).toBeInTheDocument()
    expect(ana.getByText('Mira Petrović, Zoran Petrović')).toBeInTheDocument()
  })

  it('says that a student nobody teaches has no teacher, and no lessons yet', async () => {
    await open()
    const neda = within(await row('Neda Marković'))
    expect(neda.getByText('Bez nastavnika')).toBeInTheDocument()
    expect(neda.getByText('Nema časova')).toBeInTheDocument()
  })

  it('finds a student by a part of the name or the email, whatever the case or diacritics', async () => {
    await open()
    await userEvent.type(screen.getByLabelText('Pretraga po imenu ili emailu'), 'PETROVIC')
    await waitFor(async () => expect(await rows()).toHaveLength(1))
    expect(await row('Ana Petrović')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Pretraga po imenu ili emailu'))
    await userEvent.type(screen.getByLabelText('Pretraga po imenu ili emailu'), 'neda.mark')
    await waitFor(async () => expect(await rows()).toHaveLength(1))
    expect(await row('Neda Marković')).toBeInTheDocument()
  })

  it('says so when nobody matches', async () => {
    await open()
    await userEvent.type(screen.getByLabelText('Pretraga po imenu ili emailu'), 'zzz')
    expect(await screen.findByText('Nema učenika koji odgovaraju pretrazi.')).toBeInTheDocument()
  })

  it('says there are no students yet, and explains a failure with another try', async () => {
    const empty = createFakeAdminApi()
    empty.state.students = []
    renderAdmin(PATH, { api: empty })
    expect(await screen.findByText('Još nema učenika.')).toBeInTheDocument()

    const failing = createFakeAdminApi()
    failing.failNext('listStudents', new AdminError('network'))
    renderAdmin(PATH, { api: failing })
    expect(await screen.findByText(/Nema veze sa serverom/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await row('Luka Ilić')).toBeInTheDocument()
  })
})

describe('deleting a student', () => {
  it('is offered for each record that has no lesson held, and not for one that has', async () => {
    await open()
    expect(await del('Obriši učenika Luka Ilić (Ana Nikolić)')).toBeInTheDocument()
    expect(await del('Obriši učenika Neda Marković (Bez nastavnika)')).toBeInTheDocument()
    // Ana has two records: with Ana Nikolić nothing was held, with Marko two lessons were
    expect(await del('Obriši učenika Ana Petrović (Ana Nikolić)')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Obriši učenika Ana Petrović (Marko Jovanović)' }),
    ).not.toBeInTheDocument()
  })

  it('names the teacher on the button of a person who has several records, and only then', async () => {
    await open()
    expect(await del('Obriši učenika Ana Petrović (Ana Nikolić)')).toHaveTextContent(
      'Obriši (Ana Nikolić)',
    )
    expect(await del('Obriši učenika Luka Ilić (Ana Nikolić)')).toHaveTextContent(/^Obriši$/)
  })

  it('asks first, and says what is lost and how many lessons are cancelled', async () => {
    await open()
    await userEvent.click(await del('Obriši učenika Luka Ilić (Ana Nikolić)'))
    const dialog = await inDialog('Brisanje učenika')
    expect(dialog.getByText('Luka Ilić')).toBeInTheDocument()
    expect(dialog.getByText(/Zakazani časovi koji će biti otkazani/)).toHaveTextContent(': 2')
  })

  it('names the teacher in the question when the person has several records', async () => {
    await open()
    await userEvent.click(await del('Obriši učenika Ana Petrović (Ana Nikolić)'))
    const dialog = await inDialog('Brisanje učenika')
    expect(dialog.getByText('Ana Petrović (Ana Nikolić)')).toBeInTheDocument()
  })

  it('deletes one record and leaves the person with the other', async () => {
    const api = await open()
    await userEvent.click(await del('Obriši učenika Ana Petrović (Ana Nikolić)'))
    await userEvent.click(
      (await inDialog('Brisanje učenika')).getByRole('button', { name: 'Obriši' }),
    )
    expect(api.calls.deleteStudent).toHaveBeenCalledWith('st-ana2')
    expect(await screen.findByRole('status')).toHaveTextContent('Učenik je obrisan.')
    await waitFor(async () =>
      expect(within(await row('Ana Petrović')).getByText('Marko Jovanović')).toBeInTheDocument(),
    )
    expect(within(await row('Ana Petrović')).queryByText(/Ana Nikolić/)).not.toBeInTheDocument()
  })

  it('deletes the last record, and the person leaves the list', async () => {
    const api = await open()
    await userEvent.click(await del('Obriši učenika Neda Marković (Bez nastavnika)'))
    await userEvent.click(
      (await inDialog('Brisanje učenika')).getByRole('button', { name: 'Obriši' }),
    )
    expect(api.calls.deleteStudent).toHaveBeenCalledWith('st-neda')
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Neda Marković/ })).not.toBeInTheDocument(),
    )
  })

  it('changes nothing when the administrator backs out', async () => {
    const api = await open()
    await userEvent.click(await del('Obriši učenika Luka Ilić (Ana Nikolić)'))
    await userEvent.click(
      (await inDialog('Brisanje učenika')).getByRole('button', { name: 'Odustani' }),
    )
    expect(api.calls.deleteStudent).not.toHaveBeenCalled()
  })

  it('explains it when the database refuses a student who has had a lesson since', async () => {
    const api = await open()
    await userEvent.click(await del('Obriši učenika Luka Ilić (Ana Nikolić)'))
    const dialog = await inDialog('Brisanje učenika')
    api.failNext(
      'deleteStudent',
      new AdminError('PT409', 'a student with a lesson that took place cannot be deleted'),
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Učenik ima održan čas i ne može da se obriše.',
    )
  })
})
