import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createFakeAdminApi } from '../../test/fakeAdminApi'
import { inDialog, page, renderAdmin } from '../../test/renderAdmin'
import { AdminError } from '../adminApi'

const row = (name: string) => screen.findByRole('row', { name: new RegExp(name) })

describe('subjects', () => {
  it('lists the subjects with how many teachers teach each', async () => {
    renderAdmin('/administracija/predmeti')
    await page('Predmeti')

    expect(await row('Fizika')).toHaveTextContent('1')
    expect(await row('Matematika')).toHaveTextContent('2') // Ana and the deactivated Goran
    expect(await row('Hemija')).toHaveTextContent('1')
  })

  it('invites the admin to add the first subject', async () => {
    renderAdmin('/administracija/predmeti', { api: createFakeAdminApi({ subjects: [] }) })
    expect(await screen.findByText('Još nema predmeta. Dodajte prvi.')).toBeInTheDocument()
  })

  it('adds a subject and shows it', async () => {
    const { adminApi } = renderAdmin('/administracija/predmeti')
    await page('Predmeti')

    await userEvent.type(await screen.findByLabelText('Novi predmet'), '  Srpski jezik ')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj predmet' }))

    expect(adminApi.addSubject).toHaveBeenCalledWith('Srpski jezik')
    expect(await row('Srpski jezik')).toBeInTheDocument()
    expect(screen.getByLabelText('Novi predmet')).toHaveValue('')
  })

  it('does not call the backend for an empty name', async () => {
    const { adminApi } = renderAdmin('/administracija/predmeti')
    await page('Predmeti')
    await userEvent.click(await screen.findByRole('button', { name: 'Dodaj predmet' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Unesite naziv predmeta.')
    expect(adminApi.addSubject).not.toHaveBeenCalled()
  })

  it('catches a name that differs only in case, and keeps what was typed', async () => {
    // the database would accept "fizika" next to "Fizika"; to a person it is the same subject
    const { adminApi } = renderAdmin('/administracija/predmeti')
    await page('Predmeti')
    await userEvent.type(await screen.findByLabelText('Novi predmet'), 'fizika')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj predmet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Predmet sa tim nazivom već postoji.',
    )
    expect(screen.getByLabelText('Novi predmet')).toHaveValue('fizika')
    expect(adminApi.addSubject).not.toHaveBeenCalled()
  })

  it('also explains a duplicate the database reports (somebody added it a moment ago)', async () => {
    const { adminApi } = renderAdmin('/administracija/predmeti')
    await page('Predmeti')
    adminApi.failNext('addSubject', new AdminError('23505'))
    await userEvent.type(await screen.findByLabelText('Novi predmet'), 'Latinski')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj predmet' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Predmet sa tim nazivom već postoji.',
    )
    expect(adminApi.addSubject).toHaveBeenCalledWith('Latinski')
  })

  it('refuses to rename a subject to the name of another', async () => {
    const { adminApi } = renderAdmin('/administracija/predmeti')
    await page('Predmeti')
    await userEvent.click(within(await row('Hemija')).getByRole('button', { name: 'Preimenuj' }))
    const dialog = await inDialog('Preimenovanje predmeta')
    await userEvent.clear(dialog.getByLabelText('Naziv'))
    await userEvent.type(dialog.getByLabelText('Naziv'), 'FIZIKA')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Predmet sa tim nazivom već postoji.',
    )
    expect(adminApi.renameSubject).not.toHaveBeenCalled()
  })

  it('lets a subject keep its own name when only the case changes', async () => {
    const { adminApi } = renderAdmin('/administracija/predmeti')
    await page('Predmeti')
    await userEvent.click(within(await row('Hemija')).getByRole('button', { name: 'Preimenuj' }))
    const dialog = await inDialog('Preimenovanje predmeta')
    await userEvent.clear(dialog.getByLabelText('Naziv'))
    await userEvent.type(dialog.getByLabelText('Naziv'), 'HEMIJA')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    expect(adminApi.renameSubject).toHaveBeenCalledWith('s-hem', 'HEMIJA')
  })

  it('renames a subject', async () => {
    const { adminApi } = renderAdmin('/administracija/predmeti')
    await page('Predmeti')
    await userEvent.click(within(await row('Hemija')).getByRole('button', { name: 'Preimenuj' }))

    const dialog = await inDialog('Preimenovanje predmeta')
    const field = dialog.getByLabelText('Naziv')
    expect(field).toHaveValue('Hemija')
    await userEvent.clear(field)
    await userEvent.type(field, 'Hemija i biologija')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))

    expect(adminApi.renameSubject).toHaveBeenCalledWith('s-hem', 'Hemija i biologija')
    expect(await row('Hemija i biologija')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('deletes an unused subject after confirmation', async () => {
    const api = createFakeAdminApi({
      subjects: [
        { id: 's-mat', name: 'Matematika' },
        { id: 's-extra', name: 'Latinski' },
      ],
      teachers: [],
    })
    renderAdmin('/administracija/predmeti', { api })
    await page('Predmeti')
    await userEvent.click(within(await row('Latinski')).getByRole('button', { name: 'Obriši' }))

    const dialog = await inDialog('Brisanje predmeta')
    expect(dialog.getByText(/Latinski/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši' }))

    expect(api.deleteSubject).toHaveBeenCalledWith('s-extra')
    await screen.findByRole('row', { name: /Matematika/ })
    expect(screen.queryByRole('row', { name: /Latinski/ })).not.toBeInTheDocument()
  })

  it('does nothing when the confirmation is cancelled', async () => {
    const { adminApi } = renderAdmin('/administracija/predmeti')
    await page('Predmeti')
    await userEvent.click(within(await row('Hemija')).getByRole('button', { name: 'Obriši' }))
    await userEvent.click(
      (await inDialog('Brisanje predmeta')).getByRole('button', { name: 'Odustani' }),
    )
    expect(adminApi.deleteSubject).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says why a subject in use cannot be deleted', async () => {
    renderAdmin('/administracija/predmeti')
    await page('Predmeti')
    await userEvent.click(within(await row('Hemija')).getByRole('button', { name: 'Obriši' }))
    const dialog = await inDialog('Brisanje predmeta')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Predmet se koristi (kod nastavnika ili u časovima) i ne može da se obriše.',
    )
    expect(await row('Hemija')).toBeInTheDocument()
  })

  it('closes a dialog with Escape', async () => {
    renderAdmin('/administracija/predmeti')
    await page('Predmeti')
    await userEvent.click(within(await row('Hemija')).getByRole('button', { name: 'Preimenuj' }))
    await inDialog('Preimenovanje predmeta')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
