import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { INVALID_PHONE } from '../../lib/phone'
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
    expect(ana.getByText('Glavna lokacija, Zemun')).toBeInTheDocument()
    expect(ana.getByText('Aktivan')).toBeInTheDocument()

    expect(within(await row('Goran Savić')).getByText('Deaktiviran')).toBeInTheDocument()
  })

  it('shows where each teacher may teach, in a column of its own', async () => {
    await open()
    expect(screen.getByRole('columnheader', { name: 'Lokacije' })).toBeInTheDocument()
    expect(within(await row('Marko Jovanović')).getByText('Glavna lokacija')).toBeInTheDocument()
    expect(within(await row('Marko Jovanović')).queryByText(/Zemun/)).not.toBeInTheDocument()
  })

  it("shows every teacher's number, and marks one who has none", async () => {
    await open()
    expect(screen.getByRole('columnheader', { name: 'Telefon' })).toBeInTheDocument()
    expect(within(await row('Ana Nikolić')).getByText('064 1110 003')).toBeInTheDocument()
    expect(within(await row('Marko Jovanović')).getByText('064 1110 004')).toBeInTheDocument()
    expect(within(await row('Goran Savić')).getByText('nedostaje broj')).toBeInTheDocument()
    expect(within(await row('Ana Nikolić')).queryByText('nedostaje broj')).not.toBeInTheDocument()
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
    await userEvent.type(dialog.getByLabelText('Telefon'), '+381 64 123 4567')
  }

  it('creates the teacher with a trimmed, lower-case email and the chosen subjects', async () => {
    const { adminApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))

    const dialog = await inDialog('Dodaj nastavnika')
    await fill(dialog)
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Zemun' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))

    expect(adminApi.createTeacher).toHaveBeenCalledWith({
      email: 'novi@example.test',
      firstName: 'Novi',
      lastName: 'Nastavnik',
      subjectIds: ['s-fiz'],
      locationIds: ['l-second'],
      phone: '+381641234567',
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
    expect(dialog.getByText('Unesite broj telefona.')).toBeInTheDocument()

    await userEvent.type(dialog.getByLabelText('Telefon'), '381 64 123 4567')
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(dialog.getByText(INVALID_PHONE)).toBeInTheDocument()

    await userEvent.clear(dialog.getByLabelText('Telefon'))
    await userEvent.type(dialog.getByLabelText('Telefon'), '+381 64 123 4567')
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(dialog.getByText('Izaberite bar jedan predmet.')).toBeInTheDocument()

    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(dialog.getByText('Izaberite bar jednu lokaciju.')).toBeInTheDocument()

    expect(adminApi.createTeacher).not.toHaveBeenCalled()
  })

  it('shows what the backend says and keeps the form filled in', async () => {
    const { adminApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))
    const dialog = await inDialog('Dodaj nastavnika')

    await fill(dialog, 'ana.nikolic@example.test')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Glavna lokacija' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent('Ova osoba je već nastavnik.')
    expect(dialog.getByLabelText('Email')).toHaveValue('ana.nikolic@example.test')
    expect(dialog.getByRole('checkbox', { name: 'Fizika' })).toBeChecked()
    expect(dialog.getByRole('checkbox', { name: 'Glavna lokacija' })).toBeChecked()
    expect(adminApi.createTeacher).toHaveBeenCalledTimes(1)
  })

  it('offers the locations of the school, none chosen to begin with', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))
    const dialog = await inDialog('Dodaj nastavnika')
    const boxes = within(dialog.getByRole('group', { name: 'Lokacije' })).getAllByRole('checkbox')
    expect(boxes.map((c) => (c as HTMLInputElement).labels?.[0].textContent)).toEqual([
      'Glavna lokacija',
      'Zemun',
    ])
    expect(boxes.every((c) => !(c as HTMLInputElement).checked)).toBe(true)
  })

  it('sends several locations, and the new teacher shows with all of them', async () => {
    const { adminApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))
    const dialog = await inDialog('Dodaj nastavnika')
    await fill(dialog)
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Glavna lokacija' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Zemun' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(adminApi.createTeacher).toHaveBeenCalledWith(
      expect.objectContaining({ locationIds: ['l-main', 'l-second'] }),
    )
    expect(
      await within(await row('Novi Nastavnik')).findByText('Glavna lokacija, Zemun'),
    ).toBeInTheDocument()
  })

  it('cannot add a teacher before the school has a location', async () => {
    renderAdmin('/administracija/nastavnici', { api: createFakeAdminApi({ locations: [] }) })
    await page('Nastavnici')
    expect(
      await screen.findByText('Pre nego što dodate nastavnika, dodajte bar jednu lokaciju.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dodaj nastavnika' })).toBeDisabled()
  })

  it("explains the database's refusal of the number", async () => {
    const api = createFakeAdminApi()
    await open('/administracija/nastavnici', { api })
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))
    const dialog = await inDialog('Dodaj nastavnika')
    await fill(dialog)
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Glavna lokacija' }))
    api.failNext('createTeacher', new AdminError('PT400', 'a teacher needs a phone number'))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Unesite broj telefona nastavnika.')
    api.failNext('createTeacher', new AdminError('PT400', 'invalid phone number'))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    await waitFor(() => expect(dialog.getByRole('alert')).toHaveTextContent(INVALID_PHONE))
  })

  it('explains the database refusing a location that is gone', async () => {
    const api = createFakeAdminApi()
    await open('/administracija/nastavnici', { api })
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))
    const dialog = await inDialog('Dodaj nastavnika')
    await fill(dialog)
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Glavna lokacija' }))
    api.failNext('createTeacher', new AdminError('PT400', 'unknown location'))
    await userEvent.click(dialog.getByRole('button', { name: 'Dodaj' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Lokacija više ne postoji. Osvežite stranicu.',
    )
  })

  it('does not submit twice while the first request is running', async () => {
    const api = createFakeAdminApi()
    await open('/administracija/nastavnici', { api })
    const release = api.hold('createTeacher')
    await userEvent.click(screen.getByRole('button', { name: 'Dodaj nastavnika' }))
    const dialog = await inDialog('Dodaj nastavnika')
    await fill(dialog)
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Fizika' }))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Glavna lokacija' }))
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

describe("editing a teacher's phone number", () => {
  const openPhone = async (name: string) => {
    const view = await open()
    await userEvent.click(within(await row(name)).getByRole('button', { name: 'Telefon' }))
    return { ...view, dialog: await inDialog('Broj telefona') }
  }

  it('starts from the number there is, and saves the new one in the usual form', async () => {
    const { adminApi, dialog } = await openPhone('Ana Nikolić')
    expect(dialog.getByLabelText('Broj telefona')).toHaveValue('064 1110 003')
    expect(dialog.getByText('Ana Nikolić')).toBeInTheDocument()
    await userEvent.clear(dialog.getByLabelText('Broj telefona'))
    await userEvent.type(dialog.getByLabelText('Broj telefona'), '00 381 65 999 8888')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))

    expect(adminApi.setPersonPhone).toHaveBeenCalledWith('t-ana', '+381659998888')
    expect(await screen.findByRole('status')).toHaveTextContent('Broj telefona je sačuvan.')
    expect(await within(await row('Ana Nikolić')).findByText('065 9998 888')).toBeInTheDocument()
  })

  it('gives a teacher who has none a number, also a deactivated one', async () => {
    const { adminApi, dialog } = await openPhone('Goran Savić')
    expect(dialog.getByLabelText('Broj telefona')).toHaveValue('')
    await userEvent.type(dialog.getByLabelText('Broj telefona'), '066 111 2222')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    expect(adminApi.setPersonPhone).toHaveBeenCalledWith('t-gone', '+381661112222')
    const goran = within(await row('Goran Savić'))
    expect(await goran.findByText('066 1112 222')).toBeInTheDocument()
    expect(goran.queryByText('nedostaje broj')).not.toBeInTheDocument()
  })

  it('does not let a teacher be left without one, or accept what is not a number', async () => {
    const { adminApi, dialog } = await openPhone('Ana Nikolić')
    await userEvent.clear(dialog.getByLabelText('Broj telefona'))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    expect(dialog.getByRole('alert')).toHaveTextContent('Unesite broj telefona.')
    await userEvent.type(dialog.getByLabelText('Broj telefona'), '381 65 111 2222')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    expect(dialog.getByRole('alert')).toHaveTextContent(INVALID_PHONE)
    expect(adminApi.setPersonPhone).not.toHaveBeenCalled()
  })

  it('closes without asking the backend when the number is the same, however it is written', async () => {
    const { adminApi, dialog } = await openPhone('Ana Nikolić')
    await userEvent.clear(dialog.getByLabelText('Broj telefona'))
    await userEvent.type(dialog.getByLabelText('Broj telefona'), '+381 64 111 0003')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(adminApi.setPersonPhone).not.toHaveBeenCalled()
  })

  it("explains the database's refusals", async () => {
    const { adminApi, dialog } = await openPhone('Ana Nikolić')
    await userEvent.clear(dialog.getByLabelText('Broj telefona'))
    await userEvent.type(dialog.getByLabelText('Broj telefona'), '+381651112222')
    adminApi.failNext('setPersonPhone', new AdminError('PT409', 'this person was erased'))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Nalog je obrisan. Osvežite stranicu.',
    )
    adminApi.failNext(
      'setPersonPhone',
      new AdminError('PT409', 'a teacher or parent needs a phone number'),
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() =>
      expect(dialog.getByRole('alert')).toHaveTextContent(
        'Nastavnik i roditelj moraju da imaju broj telefona.',
      ),
    )
  })

  it('leaves everything alone when cancelled', async () => {
    const { adminApi, dialog } = await openPhone('Ana Nikolić')
    await userEvent.click(dialog.getByRole('button', { name: 'Odustani' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(adminApi.setPersonPhone).not.toHaveBeenCalled()
  })
})

describe("editing a teacher's locations", () => {
  const openLocations = async (name: string) => {
    const view = await open()
    await userEvent.click(within(await row(name)).getByRole('button', { name: 'Lokacije' }))
    return { ...view, dialog: await inDialog(`Lokacije nastavnika ${name}`) }
  }
  const lessonAt = (id: string, locationId: string, day: number, status = 'confirmed') => ({
    id,
    locationId,
    start: `2026-11-${10 + day}T15:00:00Z`,
    end: `2026-11-${10 + day}T16:00:00Z`,
    status,
  })

  it('starts from the current locations and saves the new selection', async () => {
    const { adminApi, dialog } = await openLocations('Ana Nikolić')
    expect(dialog.getByRole('checkbox', { name: 'Glavna lokacija' })).toBeChecked()
    expect(dialog.getByRole('checkbox', { name: 'Zemun' })).toBeChecked()

    await userEvent.click(dialog.getByRole('checkbox', { name: 'Zemun' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))

    expect(adminApi.setTeacherLocations).toHaveBeenCalledWith('t-ana', ['l-main'])
    expect(await screen.findByRole('status')).toHaveTextContent('Lokacije su sačuvane.')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await within(await row('Ana Nikolić')).findByText('Glavna lokacija')).toBeInTheDocument()
  })

  it('adds a location', async () => {
    const { adminApi, dialog } = await openLocations('Marko Jovanović')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Zemun' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    expect(adminApi.setTeacherLocations).toHaveBeenCalledWith('t-marko', ['l-main', 'l-second'])
    expect(
      await within(await row('Marko Jovanović')).findByText('Glavna lokacija, Zemun'),
    ).toBeInTheDocument()
  })

  it('refuses to leave a teacher without a location, without asking the backend', async () => {
    const { adminApi, dialog } = await openLocations('Marko Jovanović')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Glavna lokacija' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    expect(dialog.getByRole('alert')).toHaveTextContent('Izaberite bar jednu lokaciju.')
    expect(adminApi.setTeacherLocations).not.toHaveBeenCalled()
  })

  it('is offered for a deactivated teacher too, so that they can be reactivated safely', async () => {
    await open()
    expect(
      within(await row('Goran Savić')).getByRole('button', { name: 'Lokacije' }),
    ).toBeInTheDocument()
  })

  it('lists the lessons that stop a location from being taken away, and changes nothing', async () => {
    const api = createFakeAdminApi({
      blockers: {
        't-ana': [
          lessonAt('b1', 'l-second', 1),
          lessonAt('b2', 'l-second', 2, 'open'),
          lessonAt('b3', 'l-second', 3, 'pending'),
        ],
      },
    })
    const view = await open('/administracija/nastavnici', { api })
    await userEvent.click(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Lokacije' }),
    )
    const dialog = await inDialog('Lokacije nastavnika Ana Nikolić')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Zemun' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))

    const alert = await dialog.findByRole('alert')
    expect(alert).toHaveTextContent(
      /na lokaciji koja se uklanja nastavnik još ima buduće časove i slobodne termine/i,
    )
    const items = within(alert)
      .getAllByRole('listitem')
      .map((li) => li.textContent)
    expect(items).toEqual([
      'sre, 11. novembar, 16:00–17:00 · Zemun · čas',
      'čet, 12. novembar, 16:00–17:00 · Zemun · slobodan termin',
      'pet, 13. novembar, 16:00–17:00 · Zemun · zahtev na čekanju',
    ])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(view.adminApi.state.teachers.find((t) => t.id === 't-ana')?.locationIds).toEqual([
      'l-main',
      'l-second',
    ])
    expect(dialog.getByRole('checkbox', { name: 'Zemun' })).not.toBeChecked() // the choice stays, to be changed
  })

  it('says how many more there are than it lists', async () => {
    const api = createFakeAdminApi({
      blockers: {
        't-ana': Array.from({ length: 20 }, (_, i) => lessonAt(`b${i}`, 'l-second', 1)),
      },
    })
    // the database lists the first twenty and says the total
    const original = api.setTeacherLocations
    api.setTeacherLocations = async (id, ids) => {
      try {
        await original(id, ids)
      } catch (failure) {
        const error = failure as AdminError
        const data = JSON.parse(error.details ?? '{}')
        throw new AdminError(error.code, error.message, JSON.stringify({ ...data, total: 25 }))
      }
    }
    await open('/administracija/nastavnici', { api })
    await userEvent.click(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Lokacije' }),
    )
    const dialog = await inDialog('Lokacije nastavnika Ana Nikolić')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Zemun' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    const alert = await dialog.findByRole('alert')
    expect(within(alert).getAllByRole('listitem')).toHaveLength(20)
    expect(alert).toHaveTextContent('i još 5')
  })

  it('falls back to a plain sentence when the detail is missing', async () => {
    const { adminApi, dialog } = await openLocations('Ana Nikolić')
    adminApi.failNext('setTeacherLocations', new AdminError('PT409', 'still has lessons'))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Zemun' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Nastavnik još ima buduće časove ili slobodne termine na lokaciji koja se uklanja.',
    )
  })

  it('explains an erased account and a location that is gone', async () => {
    const { adminApi, dialog } = await openLocations('Ana Nikolić')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Zemun' }))
    adminApi.failNext('setTeacherLocations', new AdminError('PT409', 'this teacher was erased'))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Nalog je obrisan. Osvežite stranicu.',
    )
    adminApi.failNext('setTeacherLocations', new AdminError('PT400', 'unknown location'))
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() =>
      expect(dialog.getByRole('alert')).toHaveTextContent(
        'Lokacija više ne postoji. Osvežite stranicu.',
      ),
    )
  })

  it('leaves the teacher alone when cancelled', async () => {
    const { adminApi, dialog } = await openLocations('Ana Nikolić')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Zemun' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Odustani' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(adminApi.setTeacherLocations).not.toHaveBeenCalled()
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

describe('erasing a teacher', () => {
  const erase = async (name: string) => {
    await userEvent.click(within(await row(name)).getByRole('button', { name: 'Obriši nalog' }))
    return inDialog('Brisanje naloga')
  }
  const confirmWith = async (dialog: Awaited<ReturnType<typeof inDialog>>, name: string) => {
    await dialog.findByText('Budući časovi koji se brišu', { exact: false })
    await userEvent.type(dialog.getByLabelText(/Za potvrdu upišite/), name)
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši nalog' }))
  }

  it('is offered for active and deactivated teachers, not for the admin or other admins', async () => {
    const api = createFakeAdminApi({
      teachers: [
        ...seed().teachers,
        {
          ...seed().teachers[0],
          id: 'p-boss',
          firstName: 'Boris',
          lastName: 'Šef',
          email: 'boss@example.test',
        },
        {
          ...seed().teachers[0],
          id: 'p-other-admin',
          firstName: 'Dragan',
          lastName: 'Upravnik',
          email: 'dragan@example.test',
          isAdmin: true,
        },
      ],
    })
    renderAdmin('/administracija/nastavnici', { api, roles: personas.adminTeacher })
    expect(
      within(await row('Ana Nikolić')).getByRole('button', { name: 'Obriši nalog' }),
    ).toBeInTheDocument()
    expect(
      within(await row('Goran Savić')).getByRole('button', { name: 'Obriši nalog' }),
    ).toBeInTheDocument()
    expect(
      within(await row('Boris Šef')).queryByRole('button', { name: 'Obriši nalog' }),
    ).not.toBeInTheDocument()
    expect(
      within(await row('Dragan Upravnik')).queryByRole('button', { name: 'Obriši nalog' }),
    ).not.toBeInTheDocument()
  })

  it('says what goes and what stays, and shows the consequences', async () => {
    const { adminApi } = await open()
    const dialog = await erase('Ana Nikolić')

    expect(await dialog.findByText('Budući časovi koji se brišu: 3')).toBeInTheDocument()
    expect(dialog.getByText('Učenici koji postaju neraspoređeni: 2')).toBeInTheDocument()
    expect(dialog.getByText('Zahtevi za preuzimanje koji se zatvaraju: 1')).toBeInTheDocument()
    expect(adminApi.teacherImpact).toHaveBeenCalledWith('t-ana')
    expect(dialog.getByText(/Ovo se ne može poništiti/)).toBeInTheDocument()
    expect(dialog.getByText(/biografija, predmeti i CV/)).toBeInTheDocument()
    expect(dialog.getByText(/i učenik ili roditelj, i ti nalozi se brišu/)).toBeInTheDocument()
    expect(dialog.getByText(/Časovi koji su već počeli ostaju u evidenciji/)).toBeInTheDocument()
  })

  it('cannot be confirmed before the consequences are known', async () => {
    const api = createFakeAdminApi()
    const release = api.hold('teacherImpact')
    await open('/administracija/nastavnici', { api })
    const dialog = await erase('Ana Nikolić')
    expect(dialog.getByRole('button', { name: 'Obriši nalog' })).toBeDisabled()
    release()
    await dialog.findByText('Budući časovi koji se brišu: 3')
    expect(dialog.getByRole('button', { name: 'Obriši nalog' })).toBeEnabled()
  })

  it('asks for the name before it erases anything', async () => {
    const { adminApi } = await open()
    const dialog = await erase('Ana Nikolić')
    await dialog.findByText('Budući časovi koji se brišu: 3')

    await userEvent.click(dialog.getByRole('button', { name: 'Obriši nalog' }))
    expect(dialog.getByText('Upišite ime i prezime nastavnika radi potvrde.')).toBeInTheDocument()

    await userEvent.type(dialog.getByLabelText(/Za potvrdu upišite/), 'Ana Nikolic')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši nalog' }))
    expect(adminApi.eraseTeacher).not.toHaveBeenCalled()
  })

  it('deletes a teacher with no lessons that took place, and the name check ignores case and spaces', async () => {
    const { adminApi } = await open()
    await confirmWith(await erase('Marko Jovanović'), '  marko  jovanović ')

    expect(adminApi.eraseTeacher).toHaveBeenCalledWith('t-marko')
    expect(await screen.findByRole('status')).toHaveTextContent('Nalog je obrisan.')
    expect(screen.queryByRole('row', { name: /Marko Jovanović/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Obrisani nalozi' })).not.toBeInTheDocument()
  })

  it('keeps a record of a teacher who has lessons that took place', async () => {
    const { adminApi } = await open()
    await confirmWith(await erase('Ana Nikolić'), 'Ana Nikolić')

    expect(adminApi.eraseTeacher).toHaveBeenCalledWith('t-ana')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Nalog je obrisan. Održani časovi ostaju u evidenciji.',
    )

    // gone from the working list, present in the record of erased accounts
    const records = within(await screen.findByRole('region', { name: 'Obrisani nalozi' }))
    expect(records.getByText('Ana Nikolić')).toBeInTheDocument()
    expect(records.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByText('ana.nikolic@example.test')).not.toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Marko Jovanović/ })).toBeInTheDocument()
  })

  it('shows a record of an erased account that was there from the start', async () => {
    const api = createFakeAdminApi({
      teachers: [
        ...seed().teachers,
        {
          ...seed().teachers[0],
          id: 't-erased',
          firstName: 'Nikola',
          lastName: 'Petrović',
          email: 'erased-1@erased.invalid',
          isActive: false,
          hasSignedIn: false,
          subjectIds: [],
          erased: true,
        },
      ],
    })
    await open('/administracija/nastavnici', { api })
    const records = within(await screen.findByRole('region', { name: 'Obrisani nalozi' }))
    expect(records.getByText('Nikola Petrović')).toBeInTheDocument()
    expect(records.getByText(/Časovi koji su održani su sačuvani/)).toBeInTheDocument()
    expect(screen.queryByText('erased-1@erased.invalid')).not.toBeInTheDocument()
    expect(screen.queryByRole('row', { name: /Nikola Petrović/ })).not.toBeInTheDocument()
  })

  it('does not show the record section when nobody was erased', async () => {
    await open()
    expect(screen.queryByRole('region', { name: 'Obrisani nalozi' })).not.toBeInTheDocument()
  })

  it('explains an administrator who cannot be erased', async () => {
    const { adminApi } = await open()
    adminApi.failNext('eraseTeacher', new AdminError('PT409', 'an administrator cannot be erased'))
    await confirmWith(await erase('Ana Nikolić'), 'Ana Nikolić')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Administrator se ne briše ovde. Prvo mu oduzmite ulogu administratora.',
    )
  })

  it('explains an account that was erased meanwhile, and one that is gone', async () => {
    const { adminApi } = await open()
    adminApi.failNext('eraseTeacher', new AdminError('PT409', 'this person was already erased'))
    const dialog = await erase('Ana Nikolić')
    await confirmWith(dialog, 'Ana Nikolić')
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Nalog je već obrisan. Osvežite stranicu.',
    )

    adminApi.failNext('eraseTeacher', new AdminError('PT404'))
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši nalog' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Nastavnik više ne postoji. Osvežite stranicu.',
    )
  })

  it('leaves everything alone when cancelled', async () => {
    const { adminApi } = await open()
    await userEvent.click((await erase('Ana Nikolić')).getByRole('button', { name: 'Odustani' }))
    expect(adminApi.eraseTeacher).not.toHaveBeenCalled()
  })

  it('tells the admin why a record cannot be reactivated or given another email', async () => {
    const { adminApi } = await open()
    adminApi.failNext('reactivateTeacher', new AdminError('PT409', 'this person was erased'))
    await userEvent.click(
      within(await row('Goran Savić')).getByRole('button', { name: 'Aktiviraj' }),
    )
    const dialog = await inDialog('Aktivacija nastavnika')
    await userEvent.click(dialog.getByRole('button', { name: 'Aktiviraj' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Obrisani nalog ne može da se vrati. Osvežite stranicu.',
    )
  })
})
