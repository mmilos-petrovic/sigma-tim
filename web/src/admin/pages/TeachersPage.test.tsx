import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { personas } from '../../test/fixtures'
import { createFakeAdminApi, seed } from '../../test/fakeAdminApi'
import { inDialog, page, renderAdmin } from '../../test/renderAdmin'
import { AdminError } from '../adminApi'

const row = (name: string) => screen.findByRole('row', { name: new RegExp(name) })
const open = async (
  path = '/administracija/nastavnici',
  options?: Parameters<typeof renderAdmin>[1],
) => {
  const view = renderAdmin(path, options)
  await page('Nastavnici')
  await row('Ana Nikolić')
  return view
}

describe('teachers list', () => {
  it('shows name, email, subjects and status of every teacher', async () => {
    await open()

    const ana = within(await row('Ana Nikolić'))
    expect(ana.getByText('ana.nikolic@example.test')).toBeInTheDocument()
    expect(ana.getByText('Fizika, Matematika')).toBeInTheDocument()
    expect(ana.getByText('Aktivan')).toBeInTheDocument()

    expect(within(await row('Goran Savić')).getByText('Deaktiviran')).toBeInTheDocument()
  })

  it('marks a teacher who has not signed in yet', async () => {
    await open()
    expect(
      within(await row('Marko Jovanović')).getByText('Još se nije prijavio'),
    ).toBeInTheDocument()
    expect(
      within(await row('Ana Nikolić')).queryByText('Još se nije prijavio'),
    ).not.toBeInTheDocument()
  })

  it('invites the admin to add the first teacher', async () => {
    renderAdmin('/administracija/nastavnici', { api: createFakeAdminApi({ teachers: [] }) })
    expect(await screen.findByText('Još nema nastavnika. Dodajte prvog.')).toBeInTheDocument()
  })

  it('explains a failure and offers a retry', async () => {
    const api = createFakeAdminApi()
    api.failNext('listTeachers', new AdminError('network'))
    renderAdmin('/administracija/nastavnici', { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await row('Ana Nikolić')).toBeInTheDocument()
  })
})

describe('adding a teacher', () => {
  const fill = async (
    dialog: Awaited<ReturnType<typeof inDialog>>,
    email = 'Novi@Example.test ',
  ) => {
    await userEvent.type(dialog.getByLabelText('Email'), email)
    await userEvent.type(dialog.getByLabelText('Ime'), ' Novi ')
    await userEvent.type(dialog.getByLabelText('Prezime'), 'Nastavnik')
  }

  it('creates the teacher with a trimmed, lower-case email and the chosen subjects', async () => {
    const { adminApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))

    const dialog = await inDialog('Dodaj nastavnika')
    await fill(dialog)
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))

    expect(adminApi.createTeacher).toHaveBeenCalledWith({
      email: 'novi@example.test',
      firstName: 'Novi',
      lastName: 'Nastavnik',
      subjectIds: ['s-fiz'],
    })
    expect(await row('Novi Nastavnik')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nastavnik je dodat.')
  })

  it('checks the form before asking the backend', async () => {
    const { adminApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))
    const dialog = await inDialog('Dodaj nastavnika')

    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(dialog.getByText('Unesite ispravnu email adresu.')).toBeInTheDocument()

    await userEvent.type(dialog.getByLabelText('Email'), 'nije-adresa')
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(dialog.getByText('Unesite ispravnu email adresu.')).toBeInTheDocument()

    await userEvent.clear(dialog.getByLabelText('Email'))
    await userEvent.type(dialog.getByLabelText('Email'), 'ok@example.test')
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(dialog.getByText('Unesite ime i prezime.')).toBeInTheDocument()

    await userEvent.type(dialog.getByLabelText('Ime'), 'Ime')
    await userEvent.type(dialog.getByLabelText('Prezime'), 'Prezime')
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(dialog.getByText('Izaberite bar jedan predmet.')).toBeInTheDocument()

    expect(adminApi.createTeacher).not.toHaveBeenCalled()
  })

  it('shows what the backend says and keeps the form filled in', async () => {
    const { adminApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))
    const dialog = await inDialog('Dodaj nastavnika')

    await fill(dialog, 'ana.nikolic@example.test')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent('Ova osoba je već nastavnik.')
    expect(dialog.getByLabelText('Email')).toHaveValue('ana.nikolic@example.test')
    expect(dialog.getByRole('checkbox', { name: 'Fizika' })).toBeChecked()
    expect(adminApi.createTeacher).toHaveBeenCalledTimes(1)
  })

  it('does not submit twice while the first request is running', async () => {
    const api = createFakeAdminApi()
    await open('/administracija/nastavnici', { api })
    const release = api.hold('createTeacher')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))
    const dialog = await inDialog('Dodaj nastavnika')
    await fill(dialog)
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    release()
    await row('Novi Nastavnik')
    expect(api.createTeacher).toHaveBeenCalledTimes(1)
  })
})

describe("editing a teacher's subjects", () => {
  it('starts from the current subjects and saves the new selection', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Predmeti' }),
    )

    const dialog = await inDialog('Predmeti nastavnika Ana Nikolić')
    expect(dialog.getByRole('checkbox', { name: 'Matematika' })).toBeChecked()
    expect(dialog.getByRole('checkbox', { name: 'Fizika' })).toBeChecked()
    expect(dialog.getByRole('checkbox', { name: 'Hemija' })).not.toBeChecked()

    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Hemija' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))

    expect(adminApi.setTeacherSubjects).toHaveBeenCalledWith('t-ana', ['s-mat', 's-hem'])
    expect(
      await within(await row('Ana Nikolić')).findByText('Hemija, Matematika'),
    ).toBeInTheDocument()
  })

  it('refuses to leave a teacher without a subject', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await row('Marko Jovanović')).getByRole('button', { name: 'Predmeti' }),
    )
    const dialog = await inDialog('Predmeti nastavnika Marko Jovanović')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Hemija' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))

    expect(dialog.getByText('Izaberite bar jedan predmet.')).toBeInTheDocument()
    expect(adminApi.setTeacherSubjects).not.toHaveBeenCalled()
  })
})

describe('changing an email', () => {
  it('warns that the old Google account loses access, then changes the address', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await row('Marko Jovanović')).getByRole('button', { name: 'Promeni email' }),
    )

    const dialog = await inDialog('Promena email adrese')
    expect(dialog.getByText(/Stari Google nalog više neće imati pristup/)).toBeInTheDocument()
    const field = dialog.getByLabelText('Nova email adresa')
    expect(field).toHaveValue('marko.jovanovic@example.test')

    await userEvent.clear(field)
    await userEvent.type(field, ' Marko.Novi@Example.test')
    await userEvent.click(dialog.getByRole('button', { name: 'Promeni' }))

    expect(adminApi.changeEmail).toHaveBeenCalledWith('t-marko', 'marko.novi@example.test')
    expect(await screen.findByText('marko.novi@example.test')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Email adresa je promenjena.')
  })

  it('refuses a malformed address without asking the backend', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await row('Marko Jovanović')).getByRole('button', { name: 'Promeni email' }),
    )
    const dialog = await inDialog('Promena email adrese')
    await userEvent.clear(dialog.getByLabelText('Nova email adresa'))
    await userEvent.type(dialog.getByLabelText('Nova email adresa'), 'nije-adresa')
    await userEvent.click(dialog.getByRole('button', { name: 'Promeni' }))
    expect(dialog.getByText('Unesite ispravnu email adresu.')).toBeInTheDocument()
    expect(adminApi.changeEmail).not.toHaveBeenCalled()
  })

  it('explains an address that belongs to someone else', async () => {
    await open()
    await userEvent.click(
      within(await row('Marko Jovanović')).getByRole('button', { name: 'Promeni email' }),
    )
    const dialog = await inDialog('Promena email adrese')
    await userEvent.clear(dialog.getByLabelText('Nova email adresa'))
    await userEvent.type(dialog.getByLabelText('Nova email adresa'), 'ana.nikolic@example.test')
    await userEvent.click(dialog.getByRole('button', { name: 'Promeni' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Ova adresa već pripada drugoj osobi.',
    )
  })

  it('does not offer it for the admin’s own profile', async () => {
    const api = createFakeAdminApi({
      teachers: [
        {
          ...seed().teachers[0],
          id: 'p-boss',
          firstName: 'Boris',
          lastName: 'Šef',
          email: 'boss@example.test',
        },
      ],
    })
    renderAdmin('/administracija/nastavnici', { api, roles: personas.adminTeacher })
    const own = within(await row('Boris Šef'))
    expect(own.getByText('(vi)')).toBeInTheDocument()
    expect(own.queryByRole('button', { name: 'Promeni email' })).not.toBeInTheDocument()
  })
})

describe('deactivating a teacher', () => {
  it('shows what it will do and deactivates on confirmation', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Deaktiviraj' }),
    )

    const dialog = await inDialog('Deaktivacija nastavnika')
    expect(await dialog.findByText('Budući časovi koji se brišu: 3')).toBeInTheDocument()
    expect(dialog.getByText('Učenici koji postaju neraspoređeni: 2')).toBeInTheDocument()
    expect(dialog.getByText('Zahtevi za preuzimanje koji se zatvaraju: 1')).toBeInTheDocument()
    expect(adminApi.teacherImpact).toHaveBeenCalledWith('t-ana')

    await userEvent.click(dialog.getByRole('button', { name: 'Deaktiviraj' }))

    expect(adminApi.deactivateTeacher).toHaveBeenCalledWith('t-ana')
    expect(await within(await row('Ana Nikolić')).findByText('Deaktiviran')).toBeInTheDocument()
    expect(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Aktiviraj' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nastavnik je deaktiviran.')
  })

  it('cannot be confirmed before the consequences are known', async () => {
    const api = createFakeAdminApi()
    const release = api.hold('teacherImpact')
    await open('/administracija/nastavnici', { api })
    await userEvent.click(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Deaktiviraj' }),
    )

    const dialog = await inDialog('Deaktivacija nastavnika')
    expect(dialog.getByRole('button', { name: 'Deaktiviraj' })).toBeDisabled()
    release()
    await dialog.findByText('Budući časovi koji se brišu: 3')
    expect(dialog.getByRole('button', { name: 'Deaktiviraj' })).toBeEnabled()
  })

  it('does not deactivate without a way to show the consequences', async () => {
    const api = createFakeAdminApi()
    api.failNext('teacherImpact', new AdminError('network'))
    await open('/administracija/nastavnici', { api })
    await userEvent.click(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Deaktiviraj' }),
    )
    const dialog = await inDialog('Deaktivacija nastavnika')
    expect(await dialog.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    expect(dialog.getByRole('button', { name: 'Deaktiviraj' })).toBeDisabled()
  })

  it('leaves the teacher alone when cancelled', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Deaktiviraj' }),
    )
    await userEvent.click(
      (await inDialog('Deaktivacija nastavnika')).getByRole('button', { name: 'Odustani' }),
    )
    expect(adminApi.deactivateTeacher).not.toHaveBeenCalled()
  })

  it('explains a teacher who was already deactivated meanwhile', async () => {
    const { adminApi } = await open()
    adminApi.failNext(
      'deactivateTeacher',
      new AdminError('PT409', 'the teacher is already deactivated'),
    )
    await userEvent.click(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Deaktiviraj' }),
    )
    const dialog = await inDialog('Deaktivacija nastavnika')
    await dialog.findByText('Budući časovi koji se brišu: 3')
    await userEvent.click(dialog.getByRole('button', { name: 'Deaktiviraj' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Nastavnik je već deaktiviran.')
  })
})

describe('reactivating a teacher', () => {
  it('says what does not come back, then reactivates', async () => {
    const { adminApi } = await open()
    await userEvent.click(
      within(await row('Goran Savić')).getByRole('button', { name: 'Aktiviraj' }),
    )

    const dialog = await inDialog('Aktivacija nastavnika')
    expect(
      dialog.getByText(/Obrisani časovi i oslobođeni učenici se ne vraćaju/),
    ).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Aktiviraj' }))

    expect(adminApi.reactivateTeacher).toHaveBeenCalledWith('t-gone')
    expect(await within(await row('Goran Savić')).findByText('Aktivan')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Nastavnik je ponovo aktivan.')
  })
})
