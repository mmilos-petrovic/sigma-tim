import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { INVALID_PHONE } from '../../lib/phone'
import { createFakeTeacherApi, seedTeacher } from '../../test/fakeTeacherApi'
import { inDialog, page, renderTeacher } from '../../test/renderTeacher'

const PATH = '/moj-raspored/ucenici'
const row = (name: string) => screen.findByRole('row', { name: new RegExp(name) })
const button = (name: string | RegExp) => screen.findByRole('button', { name })
const EMAIL = 'Email adresa (Google nalog)'

describe("the teacher's students", () => {
  it('lists a student a row, with the parents next to them', async () => {
    renderTeacher(PATH)
    await page('Učenici')
    const ana = within(await row('Ana Petrović'))
    const headers = Array.from(screen.getAllByRole('table')[0].querySelectorAll('th')).map(
      (cell) => cell.textContent,
    )
    expect(headers).toEqual(['Učenik', 'Roditelj', 'Drugi roditelj'])
    expect(ana.getByText('Mira Petrović')).toBeInTheDocument()
    expect(ana.getByText('Zoran Petrović')).toBeInTheDocument()
    // two parents: nothing to add
    expect(ana.queryByRole('button', { name: /^Dodaj/ })).not.toBeInTheDocument()

    // no parent: a place to add the first and one to add the second
    const luka = within(await row('Luka Ilić'))
    expect(luka.getByRole('button', { name: 'Dodaj roditelja učeniku Luka Ilić' })).toBeVisible()
    expect(
      luka.getByRole('button', { name: 'Dodaj drugog roditelja učeniku Luka Ilić' }),
    ).toBeVisible()
  })

  it('keeps the row short: email, number, school and class are only in the view of the student', async () => {
    renderTeacher(PATH)
    await page('Učenici')
    const ana = await row('Ana Petrović')
    for (const text of ['ana.petrovic@example.test', 'OŠ Vuk Karadžić', '064 1110 001']) {
      expect(ana).not.toHaveTextContent(text)
    }
  })

  it('marks a parent who has no number, and nobody else', async () => {
    renderTeacher(PATH)
    await page('Učenici')
    const ana = within(await row('Ana Petrović'))
    // Zoran has none: a parent is meant to have one
    expect(ana.getAllByText('nedostaje broj')).toHaveLength(1)
    expect(within(await row('Luka Ilić')).queryByText('nedostaje broj')).not.toBeInTheDocument()
  })

  it('offers a view and an edit for a student, and an edit and a delete for a parent, no view', async () => {
    renderTeacher(PATH)
    await page('Učenici')
    const ana = within(await row('Ana Petrović'))
    expect(ana.getByRole('button', { name: 'Prikaži učenika Ana Petrović' })).toBeVisible()
    expect(ana.getByRole('button', { name: 'Izmeni učenika Ana Petrović' })).toBeVisible()
    for (const parent of ['Mira Petrović', 'Zoran Petrović']) {
      expect(ana.getByRole('button', { name: `Izmeni roditelja ${parent}` })).toBeVisible()
      expect(ana.getByRole('button', { name: `Ukloni roditelja ${parent}` })).toBeVisible()
      expect(ana.queryByRole('button', { name: `Prikaži roditelja ${parent}` })).toBeNull()
    }
    // deleting a student is not in the row: it is in the form that edits them
    expect(ana.queryByRole('button', { name: /^Obriši/ })).not.toBeInTheDocument()
  })

  it('says so when there are no students yet', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi({ students: [] }) })
    expect(await screen.findByText('Još nemate učenika. Dodajte prvog.')).toBeInTheDocument()
  })

  it('shows the error with a retry when the list cannot be loaded', async () => {
    const api = createFakeTeacherApi()
    api.failNext('listStudents', new AdminError('network'))
    renderTeacher(PATH, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom.')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await row('Ana Petrović')).toBeInTheDocument()
  })

  describe('viewing a student', () => {
    it('shows name, email, number, school, class and section, and nothing to change', async () => {
      renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Prikaži učenika Ana Petrović'))
      const view = await inDialog('Učenik')
      for (const text of [
        'Ana Petrović',
        'ana.petrovic@example.test',
        '064 1110 001',
        'OŠ Vuk Karadžić',
      ]) {
        expect(view.getByText(text)).toBeInTheDocument()
      }
      expect(view.getByText('Razred').nextSibling).toHaveTextContent('7')
      expect(view.getByText('Odeljenje').nextSibling).toHaveTextContent('a')
      expect(view.queryByRole('textbox')).not.toBeInTheDocument()

      await userEvent.click(view.getByRole('button', { name: 'Zatvori' }))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('writes a dash for what is not known', async () => {
      renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Prikaži učenika Luka Ilić'))
      const view = await inDialog('Učenik')
      expect(view.getByText('Broj telefona').nextSibling).toHaveTextContent('—')
    })
  })

  describe('adding a student', () => {
    const open = async () => {
      await page('Učenici')
      await userEvent.click(await button('Dodaj učenika'))
      return inDialog('Novi učenik')
    }

    it('adds the student and shows them', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.type(form.getByLabelText(EMAIL), '  Sara.Nikolic@Example.test ')
      await userEvent.type(form.getByLabelText('Ime'), ' Sara ')
      await userEvent.type(form.getByLabelText('Prezime'), 'Nikolić')
      await userEvent.type(form.getByLabelText('Škola'), 'OŠ Sveti Sava')
      await userEvent.type(form.getByLabelText('Razred'), '5')
      await userEvent.type(form.getByLabelText('Odeljenje'), 'b')
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))

      expect(teacherApi.addStudent).toHaveBeenCalledWith({
        email: 'sara.nikolic@example.test',
        firstName: 'Sara',
        lastName: 'Nikolić',
        school: 'OŠ Sveti Sava',
        grade: '5',
        section: 'b',
        phone: null,
      })
      expect(await row('Sara Nikolić')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Učenik je dodat.')
    })

    it('school, class and section are optional', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.type(form.getByLabelText(EMAIL), 'novi@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'Novi')
      await userEvent.type(form.getByLabelText('Prezime'), 'Učenik')
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(teacherApi.addStudent).toHaveBeenCalledWith(
        expect.objectContaining({ school: null, grade: null, section: null }),
      )
    })

    it('takes a phone number for the student, which is optional, and sends it in the usual form', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      expect(form.getByLabelText('Telefon učenika (nije obavezan)')).toBeInTheDocument()
      await userEvent.type(form.getByLabelText(EMAIL), 'novi@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'Novi')
      await userEvent.type(form.getByLabelText('Prezime'), 'Učenik')
      await userEvent.type(
        form.getByLabelText('Telefon učenika (nije obavezan)'),
        '00 381 65 111 2222',
      )
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(teacherApi.addStudent).toHaveBeenCalledWith(
        expect.objectContaining({ phone: '+381651112222' }),
      )
      await userEvent.click(await button('Prikaži učenika Novi Učenik'))
      expect(await (await inDialog('Učenik')).findByText('065 1112 222')).toBeInTheDocument()
    })

    it('does not accept something that is not a phone number, even though it is optional', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.type(form.getByLabelText(EMAIL), 'novi@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'Novi')
      await userEvent.type(form.getByLabelText('Prezime'), 'Učenik')
      await userEvent.type(
        form.getByLabelText('Telefon učenika (nije obavezan)'),
        '381 64 123 4567',
      )
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(form.getByRole('alert')).toHaveTextContent(INVALID_PHONE)
      expect(teacherApi.addStudent).not.toHaveBeenCalled()
    })

    it('does not call the backend for a bad email or missing names', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.type(form.getByLabelText(EMAIL), 'nije-email')
      await userEvent.type(form.getByLabelText('Ime'), 'Novi')
      await userEvent.type(form.getByLabelText('Prezime'), 'Učenik')
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(form.getByRole('alert')).toHaveTextContent('Email adresa nije ispravna.')

      await userEvent.clear(form.getByLabelText(EMAIL))
      await userEvent.type(form.getByLabelText(EMAIL), 'novi@example.test')
      await userEvent.clear(form.getByLabelText('Prezime'))
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(form.getByRole('alert')).toHaveTextContent('Ime i prezime su obavezni.')
      expect(teacherApi.addStudent).not.toHaveBeenCalled()
    })

    it('sends a student who has no teacher yet to the takeover request, instead of making a second record', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.type(form.getByLabelText(EMAIL), 'NEDA.markovic@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'Neda')
      await userEvent.type(form.getByLabelText('Prezime'), 'Marković')
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(form.getByRole('alert')).toHaveTextContent(
        'Ovaj učenik trenutno nema nastavnika. Zatražite preuzimanje u odeljku „Neraspoređeni učenici“.',
      )
      expect(teacherApi.addStudent).not.toHaveBeenCalled()
    })

    it("catches a student who is already theirs, and explains the database's own refusal too", async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.type(form.getByLabelText(EMAIL), 'luka.ilic@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'Luka')
      await userEvent.type(form.getByLabelText('Prezime'), 'Ilić')
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(form.getByRole('alert')).toHaveTextContent('Ovaj učenik je već među vašim učenicima.')
      expect(teacherApi.addStudent).not.toHaveBeenCalled()

      // a record the screen could not know about: the database says no
      await userEvent.clear(form.getByLabelText(EMAIL))
      await userEvent.type(form.getByLabelText(EMAIL), 'drugi@example.test')
      teacherApi.failNext(
        'addStudent',
        new AdminError('PT409', 'this person is already a student of this teacher'),
      )
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(await form.findByRole('alert')).toHaveTextContent(
        'Ovaj učenik je već među vašim učenicima.',
      )
      expect(form.getByLabelText('Ime')).toHaveValue('Luka') // what was typed stays
    })
  })

  describe('parents', () => {
    it('adds a parent to a student', async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Dodaj roditelja učeniku Luka Ilić'))
      const form = await inDialog('Novi roditelj')
      await userEvent.type(form.getByLabelText(EMAIL), 'Jelena.Ilic@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'Jelena')
      await userEvent.type(form.getByLabelText('Prezime'), 'Ilić')
      await userEvent.type(form.getByLabelText('Telefon roditelja'), '+381 64 123 4567')
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))

      expect(teacherApi.addParent).toHaveBeenCalledWith('st-luka', {
        email: 'jelena.ilic@example.test',
        firstName: 'Jelena',
        lastName: 'Ilić',
        phone: '+381641234567',
      })
      const luka = within(await row('Luka Ilić'))
      expect(luka.getByText('Jelena Ilić')).toBeInTheDocument()
      // the second place is still free, the first is not
      expect(
        luka.getByRole('button', { name: 'Dodaj drugog roditelja učeniku Luka Ilić' }),
      ).toBeVisible()
      expect(
        luka.queryByRole('button', { name: 'Dodaj roditelja učeniku Luka Ilić' }),
      ).not.toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Roditelj je dodat.')
    })

    it('adds a second parent from the second place', async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Dodaj drugog roditelja učeniku Luka Ilić'))
      const form = await inDialog('Novi roditelj')
      await userEvent.type(form.getByLabelText(EMAIL), 'drugi@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'Drugi')
      await userEvent.type(form.getByLabelText('Prezime'), 'Roditelj')
      await userEvent.type(form.getByLabelText('Telefon roditelja'), '+381 64 123 4567')
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(teacherApi.addParent).toHaveBeenCalledWith(
        'st-luka',
        expect.objectContaining({ email: 'drugi@example.test' }),
      )
      expect(await within(await row('Luka Ilić')).findByText('Drugi Roditelj')).toBeInTheDocument()
    })

    it('requires the number of a parent, and wants it in the international form', async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Dodaj roditelja učeniku Luka Ilić'))
      const form = await inDialog('Novi roditelj')
      await userEvent.type(form.getByLabelText(EMAIL), 'jelena.ilic@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'Jelena')
      await userEvent.type(form.getByLabelText('Prezime'), 'Ilić')
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(form.getByRole('alert')).toHaveTextContent('Unesite broj telefona.')

      await userEvent.type(form.getByLabelText('Telefon roditelja'), '381 64 123 4567')
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(form.getByRole('alert')).toHaveTextContent(INVALID_PHONE)
      expect(teacherApi.addParent).not.toHaveBeenCalled()
    })

    it("explains the database's refusal of a number", async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Dodaj roditelja učeniku Luka Ilić'))
      const form = await inDialog('Novi roditelj')
      await userEvent.type(form.getByLabelText(EMAIL), 'x@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'X')
      await userEvent.type(form.getByLabelText('Prezime'), 'Y')
      await userEvent.type(form.getByLabelText('Telefon roditelja'), '+381641234567')
      teacherApi.failNext('addParent', new AdminError('PT400', 'a parent needs a phone number'))
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(await form.findByRole('alert')).toHaveTextContent('Unesite broj telefona roditelja.')
      teacherApi.failNext('addParent', new AdminError('PT400', 'invalid phone number'))
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      await waitFor(() => expect(form.getByRole('alert')).toHaveTextContent(INVALID_PHONE))
    })

    it("explains the database's limit if a second parent was added a moment ago", async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Dodaj roditelja učeniku Luka Ilić'))
      const form = await inDialog('Novi roditelj')
      await userEvent.type(form.getByLabelText(EMAIL), 'x@example.test')
      await userEvent.type(form.getByLabelText('Ime'), 'X')
      await userEvent.type(form.getByLabelText('Prezime'), 'Y')
      await userEvent.type(form.getByLabelText('Telefon roditelja'), '+381641234567')
      teacherApi.failNext('addParent', new AdminError('PT409', 'a student has at most two parents'))
      await userEvent.click(form.getByRole('button', { name: 'Dodaj' }))
      expect(await form.findByRole('alert')).toHaveTextContent('Učenik već ima dva roditelja.')
    })

    it('removes a parent after explaining what it means', async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Ukloni roditelja Zoran Petrović'))
      const form = await inDialog('Uklanjanje roditelja')
      expect(form.getByText(/gubi pristup/)).toBeInTheDocument()
      expect(form.getByText(/pogrešnu email adresu/)).toBeInTheDocument()
      await userEvent.click(form.getByRole('button', { name: 'Ukloni' }))

      expect(teacherApi.removeParent).toHaveBeenCalledWith('st-ana', 'pr-zoran')
      // room for the corrected parent, in the second place
      await screen.findByRole('button', { name: 'Dodaj drugog roditelja učeniku Ana Petrović' })
      const ana = within(await row('Ana Petrović'))
      expect(ana.queryByText('Zoran Petrović')).not.toBeInTheDocument()
      expect(ana.getByText('Mira Petrović')).toBeInTheDocument()
    })

    describe('editing a parent', () => {
      const open = async (name = 'Mira Petrović') => {
        await page('Učenici')
        await userEvent.click(await button(`Izmeni roditelja ${name}`))
        return inDialog('Izmena roditelja')
      }

      it('shows the email only as text, and the name and the number as fields', async () => {
        renderTeacher(PATH)
        const form = await open()
        expect(form.getByText('mira.petrovic@example.test')).toBeInTheDocument()
        expect(form.queryByLabelText(/Email/)).not.toBeInTheDocument()
        expect(form.getByLabelText('Ime')).toHaveValue('Mira')
        expect(form.getByLabelText('Prezime')).toHaveValue('Petrović')
        expect(form.getByLabelText('Broj telefona')).toHaveValue('064 1110 002')
      })

      it('renames a parent', async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Prezime'))
        await userEvent.type(form.getByLabelText('Prezime'), 'Petrović-Jović')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))

        expect(teacherApi.renamePerson).toHaveBeenCalledWith('pr-mira', 'Mira', 'Petrović-Jović')
        expect(teacherApi.setPhone).not.toHaveBeenCalled()
        expect(await screen.findByText('Mira Petrović-Jović')).toBeInTheDocument()
      })

      it('changes the number, and gives one to a parent who has none so the marker goes', async () => {
        const { teacherApi } = renderTeacher(PATH)
        let form = await open()
        await userEvent.clear(form.getByLabelText('Broj telefona'))
        await userEvent.type(form.getByLabelText('Broj telefona'), '+381 65 222 3333')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        expect(teacherApi.setPhone).toHaveBeenCalledWith('pr-mira', '+381652223333')
        expect(teacherApi.renamePerson).not.toHaveBeenCalled()
        expect(await screen.findByRole('status')).toHaveTextContent('Podaci su sačuvani.')

        await userEvent.click(await button('Izmeni roditelja Zoran Petrović'))
        form = await inDialog('Izmena roditelja')
        expect(form.getByLabelText('Broj telefona')).toHaveValue('')
        await userEvent.type(form.getByLabelText('Broj telefona'), '063 777 8888')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        expect(teacherApi.setPhone).toHaveBeenLastCalledWith('pr-zoran', '+381637778888')
        await waitFor(() =>
          expect(
            within(screen.getByRole('row', { name: /Ana Petrović/ })).queryByText('nedostaje broj'),
          ).not.toBeInTheDocument(),
        )
      })

      it("does not let a parent's number be taken away, or accept what is not a number", async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Broj telefona'))
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        expect(form.getByRole('alert')).toHaveTextContent('Unesite broj telefona.')

        await userEvent.type(form.getByLabelText('Broj telefona'), '381 65 222 3333')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        expect(form.getByRole('alert')).toHaveTextContent(INVALID_PHONE)
        expect(teacherApi.setPhone).not.toHaveBeenCalled()
      })

      it('does nothing and closes when nothing changed, also when the same number is typed another way', async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Broj telefona'))
        await userEvent.type(form.getByLabelText('Broj telefona'), '+381 64 111 0002')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(teacherApi.setPhone).not.toHaveBeenCalled()
        expect(teacherApi.renamePerson).not.toHaveBeenCalled()
      })

      it("explains the database's refusals of a number", async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Broj telefona'))
        await userEvent.type(form.getByLabelText('Broj telefona'), '+381641234567')
        teacherApi.failNext('setPhone', new AdminError('PT403', 'not allowed'))
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        expect(await form.findByRole('alert')).toHaveTextContent('Nemate dozvolu za ovu radnju.')
        teacherApi.failNext(
          'setPhone',
          new AdminError('PT409', 'a teacher or parent needs a phone number'),
        )
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        await waitFor(() =>
          expect(form.getByRole('alert')).toHaveTextContent(
            'Nastavnik i roditelj moraju da imaju broj telefona.',
          ),
        )
      })
    })
  })

  describe('editing a student', () => {
    const open = async (name = 'Ana Petrović') => {
      await page('Učenici')
      await userEvent.click(await button(`Izmeni učenika ${name}`))
      return inDialog('Izmena učenika')
    }

    it('has name, email, number, school, class and section as fields', async () => {
      renderTeacher(PATH)
      const form = await open()
      expect(form.getByLabelText('Ime')).toHaveValue('Ana')
      expect(form.getByLabelText('Prezime')).toHaveValue('Petrović')
      expect(form.getByLabelText('Email adresa')).toHaveValue('ana.petrovic@example.test')
      expect(form.getByLabelText('Broj telefona (nije obavezan)')).toHaveValue('064 1110 001')
      expect(form.getByLabelText('Škola')).toHaveValue('OŠ Vuk Karadžić')
      expect(form.getByLabelText('Razred')).toHaveValue('7')
      expect(form.getByLabelText('Odeljenje')).toHaveValue('a')
    })

    it('saves only what changed', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.clear(form.getByLabelText('Ime'))
      await userEvent.type(form.getByLabelText('Ime'), 'Anja')
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))

      expect(teacherApi.renamePerson).toHaveBeenCalledWith('pr-ana', 'Anja', 'Petrović')
      expect(teacherApi.updateStudentDetails).not.toHaveBeenCalled()
      expect(teacherApi.setPhone).not.toHaveBeenCalled()
      expect(teacherApi.changeStudentEmail).not.toHaveBeenCalled()
      expect(await row('Anja Petrović')).toBeInTheDocument()
    })

    it('changes school, class and section, and clears them when emptied', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.clear(form.getByLabelText('Škola'))
      await userEvent.clear(form.getByLabelText('Razred'))
      await userEvent.type(form.getByLabelText('Razred'), '8')
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))

      expect(teacherApi.updateStudentDetails).toHaveBeenCalledWith('st-ana', {
        school: null,
        grade: '8',
        section: 'a',
      })
      expect(teacherApi.renamePerson).not.toHaveBeenCalled()
    })

    it('does nothing and closes when nothing changed', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
      expect(teacherApi.renamePerson).not.toHaveBeenCalled()
      expect(teacherApi.updateStudentDetails).not.toHaveBeenCalled()
      expect(teacherApi.setPhone).not.toHaveBeenCalled()
      expect(teacherApi.changeStudentEmail).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('requires both names', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.clear(form.getByLabelText('Prezime'))
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
      expect(form.getByRole('alert')).toHaveTextContent('Ime i prezime su obavezni.')
      expect(teacherApi.renamePerson).not.toHaveBeenCalled()
    })

    describe('the number', () => {
      it('changes it, starting from the one there is, in the usual form', async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Broj telefona (nije obavezan)'))
        await userEvent.type(
          form.getByLabelText('Broj telefona (nije obavezan)'),
          '00 381 65 222 3333',
        )
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        expect(teacherApi.setPhone).toHaveBeenCalledWith('pr-ana', '+381652223333')
        expect(await screen.findByRole('status')).toHaveTextContent('Podaci su sačuvani.')
        await userEvent.click(await button('Prikaži učenika Ana Petrović'))
        expect(await (await inDialog('Učenik')).findByText('065 2223 333')).toBeInTheDocument()
      })

      it('gives a student who has none one, and takes it away with an empty field', async () => {
        const { teacherApi } = renderTeacher(PATH)
        let form = await open('Luka Ilić')
        expect(form.getByLabelText('Broj telefona (nije obavezan)')).toHaveValue('')
        await userEvent.type(form.getByLabelText('Broj telefona (nije obavezan)'), '+381654445555')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        await waitFor(() =>
          expect(teacherApi.setPhone).toHaveBeenCalledWith('pr-luka', '+381654445555'),
        )

        await screen.findByRole('status')
        await userEvent.click(await button('Izmeni učenika Luka Ilić'))
        form = await inDialog('Izmena učenika')
        await userEvent.clear(form.getByLabelText('Broj telefona (nije obavezan)'))
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        await waitFor(() => expect(teacherApi.setPhone).toHaveBeenLastCalledWith('pr-luka', null))
      })

      it('does not call the backend for something that is not a number, or for the same number typed another way', async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Broj telefona (nije obavezan)'))
        await userEvent.type(
          form.getByLabelText('Broj telefona (nije obavezan)'),
          '381 65 222 3333',
        )
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        expect(form.getByRole('alert')).toHaveTextContent(INVALID_PHONE)

        await userEvent.clear(form.getByLabelText('Broj telefona (nije obavezan)'))
        await userEvent.type(
          form.getByLabelText('Broj telefona (nije obavezan)'),
          '+381 64 111 0001',
        )
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(teacherApi.setPhone).not.toHaveBeenCalled()
      })
    })

    describe('the email', () => {
      it('warns that the old account loses access once it is changed, more strongly for somebody who signed in', async () => {
        renderTeacher(PATH)
        let form = await open()
        expect(form.queryByText(/Stari Google nalog/)).not.toBeInTheDocument()
        await userEvent.type(form.getByLabelText('Email adresa'), 'x')
        expect(form.getByText(/Stari Google nalog odmah gubi pristup/)).toBeInTheDocument()
        // she has signed in before (the seed says so)
        expect(form.getByText(/se već prijavljivao/)).toBeInTheDocument()

        await userEvent.click(form.getByRole('button', { name: 'Odustani' }))
        await userEvent.click(await button('Izmeni učenika Luka Ilić'))
        form = await inDialog('Izmena učenika')
        await userEvent.type(form.getByLabelText('Email adresa'), 'x')
        expect(form.getByText(/Stari Google nalog/)).toBeInTheDocument()
        expect(form.queryByText(/se već prijavljivao/)).not.toBeInTheDocument()
      })

      it('saves the new address in lower case', async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Email adresa'))
        await userEvent.type(form.getByLabelText('Email adresa'), '  Ana.Nova@Example.test ')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))

        expect(teacherApi.changeStudentEmail).toHaveBeenCalledWith(
          'st-ana',
          'ana.nova@example.test',
        )
        expect(await screen.findByRole('status')).toHaveTextContent('Podaci su sačuvani.')
        await userEvent.click(await button('Prikaži učenika Ana Petrović'))
        expect(
          await (await inDialog('Učenik')).findByText('ana.nova@example.test'),
        ).toBeInTheDocument()
      })

      it('does not call the backend for a bad address, or for the one already there in other letters', async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Email adresa'))
        await userEvent.type(form.getByLabelText('Email adresa'), 'nije-email')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        expect(form.getByRole('alert')).toHaveTextContent('Email adresa nije ispravna.')

        await userEvent.clear(form.getByLabelText('Email adresa'))
        await userEvent.type(form.getByLabelText('Email adresa'), 'ANA.petrovic@example.test')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(teacherApi.changeStudentEmail).not.toHaveBeenCalled()
      })

      it("explains the database's refusals, keeps what was typed, and saves nothing else before it", async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Ime'))
        await userEvent.type(form.getByLabelText('Ime'), 'Anja')
        await userEvent.clear(form.getByLabelText('Email adresa'))
        await userEvent.type(form.getByLabelText('Email adresa'), 'luka.ilic@example.test')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        expect(await form.findByRole('alert')).toHaveTextContent(
          'Ova adresa već pripada drugoj osobi.',
        )
        // the email is tried first, so the rename did not happen either
        expect(teacherApi.renamePerson).not.toHaveBeenCalled()

        teacherApi.failNext(
          'changeStudentEmail',
          new AdminError('PT409', 'this person is also connected to another teacher'),
        )
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        await screen.findByText(/povezana i sa drugim nastavnikom/)
        expect(form.getByRole('alert')).toHaveTextContent(
          'Email adresu može da promeni administrator.',
        )

        teacherApi.failNext('changeStudentEmail', new AdminError('PT403', 'not allowed'))
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
        await screen.findByText('Email adresu ove osobe može da promeni samo administrator.')
        expect(form.getByLabelText('Email adresa')).toHaveValue('luka.ilic@example.test')
        expect(form.getByLabelText('Ime')).toHaveValue('Anja')
      })

      it('saves email, name and number in one go, the email first', async () => {
        const { teacherApi } = renderTeacher(PATH)
        const form = await open()
        await userEvent.clear(form.getByLabelText('Ime'))
        await userEvent.type(form.getByLabelText('Ime'), 'Anja')
        await userEvent.clear(form.getByLabelText('Email adresa'))
        await userEvent.type(form.getByLabelText('Email adresa'), 'anja@example.test')
        await userEvent.clear(form.getByLabelText('Broj telefona (nije obavezan)'))
        await userEvent.type(form.getByLabelText('Broj telefona (nije obavezan)'), '065 111 2222')
        await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))

        await waitFor(() => expect(teacherApi.setPhone).toHaveBeenCalled())
        const calledAt = (fn: (...args: never[]) => unknown) =>
          vi.mocked(fn).mock.invocationCallOrder[0]
        expect(calledAt(teacherApi.changeStudentEmail)).toBeLessThan(
          calledAt(teacherApi.renamePerson),
        )
        expect(calledAt(teacherApi.renamePerson)).toBeLessThan(calledAt(teacherApi.setPhone))
      })
    })
  })

  describe('students without a teacher', () => {
    it('lists them and asks for one at a time', async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      const neda = within(await row('Neda Marković'))
      expect(neda.getByText(/Gimnazija/)).toBeInTheDocument()
      // already asked for
      const vuk = within(await row('Vuk Vasić'))
      expect(vuk.getByText('Zahtev je poslat')).toBeInTheDocument()
      expect(vuk.queryByRole('button')).not.toBeInTheDocument()

      await userEvent.click(neda.getByRole('button', { name: 'Zatraži preuzimanje' }))
      expect(teacherApi.requestTakeover).toHaveBeenCalledWith('st-neda')
      expect(
        await within(await row('Neda Marković')).findByText('Zahtev je poslat'),
      ).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Zahtev je poslat administratoru.')
    })

    it('explains it when somebody was faster', async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      teacherApi.failNext(
        'requestTakeover',
        new AdminError('PT409', 'the student already has a teacher'),
      )
      await userEvent.click(
        within(await row('Neda Marković')).getByRole('button', { name: 'Zatraži preuzimanje' }),
      )
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Učenik je u međuvremenu dobio nastavnika.',
      )
    })

    it('says so when there are none', async () => {
      renderTeacher(PATH, { api: createFakeTeacherApi({ unassigned: [] }) })
      expect(await screen.findByText('Trenutno nema neraspoređenih učenika.')).toBeInTheDocument()
    })
  })
})

describe('deleting a student', () => {
  const edit = async (name: string) => {
    await userEvent.click(await button(`Izmeni učenika ${name}`))
    return inDialog('Izmena učenika')
  }
  const del = (form: Awaited<ReturnType<typeof edit>>, name: string) =>
    form.queryByRole('button', { name: `Obriši učenika ${name}` })

  it('is offered in the form that edits a student with no lesson that was held, and not for one who has', async () => {
    renderTeacher(PATH)
    await page('Učenici')
    expect(del(await edit('Luka Ilić'), 'Luka Ilić')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Odustani' }))
    // Ana has a lesson that took place (on Monday), so she stays for good
    expect(del(await edit('Ana Petrović'), 'Ana Petrović')).not.toBeInTheDocument()
  })

  it('is not offered while the lessons of the students are not known', async () => {
    const api = createFakeTeacherApi()
    api.failNext('listStudentCounts', new AdminError('network'))
    renderTeacher(PATH, { api })
    await page('Učenici')
    await row('Luka Ilić')
    expect(del(await edit('Luka Ilić'), 'Luka Ilić')).not.toBeInTheDocument()
  })

  it('asks first, and says what is lost and how many lessons are cancelled', async () => {
    renderTeacher(PATH)
    await page('Učenici')
    await userEvent.click(del(await edit('Luka Ilić'), 'Luka Ilić')!)
    const dialog = await inDialog('Brisanje učenika')
    expect(dialog.getByText('Luka Ilić')).toBeInTheDocument()
    expect(dialog.getByText(/roditelji koji nemaju drugo dete/)).toBeInTheDocument()
    expect(dialog.getByText(/Zakazani časovi koji će biti otkazani/)).toHaveTextContent(': 2')
    // the form that edits the student is replaced by the question
    expect(screen.queryByRole('dialog', { name: 'Izmena učenika' })).not.toBeInTheDocument()
  })

  it('does not mention lessons when there are none to cancel', async () => {
    const state = seedTeacher()
    state.lessons = []
    renderTeacher(PATH, { api: createFakeTeacherApi(state) })
    await page('Učenici')
    await userEvent.click(del(await edit('Luka Ilić'), 'Luka Ilić')!)
    const dialog = await inDialog('Brisanje učenika')
    expect(dialog.queryByText(/Zakazani časovi/)).not.toBeInTheDocument()
  })

  it('deletes the student and the row goes', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await page('Učenici')
    await userEvent.click(del(await edit('Luka Ilić'), 'Luka Ilić')!)
    await userEvent.click(
      (await inDialog('Brisanje učenika')).getByRole('button', { name: 'Obriši' }),
    )
    expect(teacherApi.deleteStudent).toHaveBeenCalledWith('st-luka')
    expect(await screen.findByRole('status')).toHaveTextContent('Učenik je obrisan.')
    await waitFor(() =>
      expect(screen.queryByRole('row', { name: /Luka Ilić/ })).not.toBeInTheDocument(),
    )
  })

  it('changes nothing when the teacher backs out', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await page('Učenici')
    await userEvent.click(del(await edit('Luka Ilić'), 'Luka Ilić')!)
    await userEvent.click(
      (await inDialog('Brisanje učenika')).getByRole('button', { name: 'Odustani' }),
    )
    expect(teacherApi.deleteStudent).not.toHaveBeenCalled()
    expect(await row('Luka Ilić')).toBeInTheDocument()
  })

  it('explains it when the database refuses a student who has had a lesson since', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await page('Učenici')
    await userEvent.click(del(await edit('Luka Ilić'), 'Luka Ilić')!)
    const dialog = await inDialog('Brisanje učenika')
    teacherApi.failNext(
      'deleteStudent',
      new AdminError('PT409', 'a student with a lesson that took place cannot be deleted'),
    )
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Učenik ima održan čas i ne može da se obriše.',
    )
  })
})
