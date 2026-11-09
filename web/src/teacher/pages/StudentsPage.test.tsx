import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { INVALID_PHONE } from '../../lib/phone'
import { createFakeTeacherApi, seedTeacher } from '../../test/fakeTeacherApi'
import { inDialog, page, renderTeacher } from '../../test/renderTeacher'

const PATH = '/moj-raspored/ucenici'
const row = (name: string) => screen.findByRole('row', { name: new RegExp(name) })
const button = (name: string | RegExp) => screen.findByRole('button', { name })
const EMAIL = 'Email adresa (Google nalog)'

describe("the teacher's students", () => {
  it('lists the students with school, class and parents', async () => {
    renderTeacher(PATH)
    await page('Učenici')

    const ana = within(await row('Ana Petrović'))
    expect(ana.getByText('ana.petrovic@example.test')).toBeInTheDocument()
    expect(ana.getByText(/OŠ Vuk Karadžić/)).toBeInTheDocument()
    expect(ana.getByText(/7\s*a/)).toBeInTheDocument()
    expect(ana.getByText('Mira Petrović')).toBeInTheDocument()
    expect(ana.getByText('Zoran Petrović')).toBeInTheDocument()

    const luka = within(await row('Luka Ilić'))
    expect(luka.getByText('Nema roditelja')).toBeInTheDocument()
  })

  it('shows the phone numbers, and marks a parent who has none', async () => {
    renderTeacher(PATH)
    await page('Učenici')
    const ana = within(await row('Ana Petrović'))
    expect(ana.getByText('064 1110 001')).toBeInTheDocument() // the student's
    expect(ana.getByText('064 1110 002')).toBeInTheDocument() // Mira's
    // Zoran has none: a parent is meant to have one
    expect(ana.getAllByText('nedostaje broj')).toHaveLength(1)
    // a student without one is not a problem
    expect(within(await row('Luka Ilić')).queryByText('nedostaje broj')).not.toBeInTheDocument()
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
      expect(await within(await row('Novi Učenik')).findByText('065 1112 222')).toBeInTheDocument()
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
      expect(within(await row('Luka Ilić')).getByText('Jelena Ilić')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Roditelj je dodat.')
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

    it('offers no more once a student has two parents', async () => {
      renderTeacher(PATH)
      await page('Učenici')
      await row('Ana Petrović')
      expect(
        screen.queryByRole('button', { name: 'Dodaj roditelja učeniku Ana Petrović' }),
      ).not.toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: 'Dodaj roditelja učeniku Luka Ilić' }),
      ).toBeInTheDocument()
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
      await screen.findByRole('button', { name: 'Dodaj roditelja učeniku Ana Petrović' }) // room for the corrected parent
      const ana = within(await row('Ana Petrović'))
      expect(ana.queryByText('Zoran Petrović')).not.toBeInTheDocument()
      expect(ana.getByText('Mira Petrović')).toBeInTheDocument()
    })

    it('renames a parent but shows the email only as text', async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Izmeni roditelja Mira Petrović'))
      const form = await inDialog('Izmena roditelja')
      expect(form.getByText('mira.petrovic@example.test')).toBeInTheDocument()
      expect(form.queryByLabelText(/Email/)).not.toBeInTheDocument()
      await userEvent.clear(form.getByLabelText('Prezime'))
      await userEvent.type(form.getByLabelText('Prezime'), 'Petrović-Jović')
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))

      expect(teacherApi.renamePerson).toHaveBeenCalledWith('pr-mira', 'Mira', 'Petrović-Jović')
      expect(await screen.findByText('Mira Petrović-Jović')).toBeInTheDocument()
    })
  })

  describe('editing a student', () => {
    const open = async () => {
      await page('Učenici')
      await userEvent.click(await button('Izmeni učenika Ana Petrović'))
      return inDialog('Izmena učenika')
    }

    it('shows the email as text and the rest as fields', async () => {
      renderTeacher(PATH)
      const form = await open()
      expect(form.getByText('ana.petrovic@example.test')).toBeInTheDocument()
      expect(form.queryByLabelText(/Email/)).not.toBeInTheDocument()
      expect(form.getByLabelText('Ime')).toHaveValue('Ana')
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
  })

  describe('phone numbers of existing people', () => {
    it("changes a student's number, starting from the one there is", async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Telefon učenika Ana Petrović'))
      const form = await inDialog('Broj telefona')
      expect(form.getByLabelText('Broj telefona (nije obavezan)')).toHaveValue('064 1110 001')
      await userEvent.clear(form.getByLabelText('Broj telefona (nije obavezan)'))
      await userEvent.type(form.getByLabelText('Broj telefona (nije obavezan)'), '+381 65 222 3333')
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))

      expect(teacherApi.setPhone).toHaveBeenCalledWith('pr-ana', '+381652223333')
      expect(await within(await row('Ana Petrović')).findByText('065 2223 333')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Broj telefona je sačuvan.')
    })

    it("gives a student who has none one, and takes a student's number away with an empty one", async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Telefon učenika Luka Ilić'))
      let form = await inDialog('Broj telefona')
      expect(form.getByLabelText('Broj telefona (nije obavezan)')).toHaveValue('')
      await userEvent.type(form.getByLabelText('Broj telefona (nije obavezan)'), '+381654445555')
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
      expect(await within(await row('Luka Ilić')).findByText('065 4445 555')).toBeInTheDocument()

      await userEvent.click(await button('Telefon učenika Luka Ilić'))
      form = await inDialog('Broj telefona')
      await userEvent.clear(form.getByLabelText('Broj telefona (nije obavezan)'))
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
      expect(teacherApi.setPhone).toHaveBeenLastCalledWith('pr-luka', null)
      expect(screen.getByRole('status')).toHaveTextContent('Broj telefona je uklonjen.')
      await waitFor(() =>
        expect(
          within(screen.getByRole('row', { name: /Luka Ilić/ })).queryByText('065 4445 555'),
        ).not.toBeInTheDocument(),
      )
    })

    it('gives a parent who has none a number, and the marker goes', async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Telefon roditelja Zoran Petrović'))
      const form = await inDialog('Broj telefona')
      expect(form.getByLabelText('Broj telefona')).toHaveValue('')
      await userEvent.type(form.getByLabelText('Broj telefona'), '063 777 8888')
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
      expect(teacherApi.setPhone).toHaveBeenCalledWith('pr-zoran', '+381637778888')
      const ana = within(await row('Ana Petrović'))
      expect(await ana.findByText('063 7778 888')).toBeInTheDocument()
      expect(ana.queryByText('nedostaje broj')).not.toBeInTheDocument()
    })

    it("does not let a parent's number be taken away", async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Telefon roditelja Mira Petrović'))
      const form = await inDialog('Broj telefona')
      await userEvent.clear(form.getByLabelText('Broj telefona'))
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
      expect(form.getByRole('alert')).toHaveTextContent('Unesite broj telefona.')
      expect(teacherApi.setPhone).not.toHaveBeenCalled()
    })

    it('does not call the backend for something that is not a number, or when nothing changed', async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Telefon učenika Ana Petrović'))
      const form = await inDialog('Broj telefona')
      await userEvent.clear(form.getByLabelText('Broj telefona (nije obavezan)'))
      await userEvent.type(form.getByLabelText('Broj telefona (nije obavezan)'), '381 65 222 3333')
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
      expect(form.getByRole('alert')).toHaveTextContent(INVALID_PHONE)

      // the same number, typed another way: nothing to save
      await userEvent.clear(form.getByLabelText('Broj telefona (nije obavezan)'))
      await userEvent.type(form.getByLabelText('Broj telefona (nije obavezan)'), '+381 64 111 0001')
      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(teacherApi.setPhone).not.toHaveBeenCalled()
    })

    it("explains the database's refusals", async () => {
      const { teacherApi } = renderTeacher(PATH)
      await page('Učenici')
      await userEvent.click(await button('Telefon roditelja Mira Petrović'))
      const form = await inDialog('Broj telefona')
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

  describe("changing a student's email", () => {
    const open = async (name = 'Ana Petrović') => {
      await page('Učenici')
      await userEvent.click(await button(`Promeni email učeniku ${name}`))
      return inDialog('Promena email adrese')
    }

    it('shows the current address, warns that the old account loses access, and saves the new one', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      expect(form.getByText('ana.petrovic@example.test')).toBeInTheDocument()
      expect(form.getByText(/stari Google nalog odmah gubi pristup/i)).toBeInTheDocument()
      // she has signed in before (the seed says so): the warning is stronger
      expect(form.getByText(/se već prijavljivao/)).toBeInTheDocument()

      await userEvent.type(form.getByLabelText('Nova email adresa'), '  Ana.Nova@Example.test ')
      await userEvent.click(form.getByRole('button', { name: 'Promeni' }))

      expect(teacherApi.changeStudentEmail).toHaveBeenCalledWith('st-ana', 'ana.nova@example.test')
      expect(await screen.findByText('ana.nova@example.test')).toBeInTheDocument()
      expect(screen.getByRole('status')).toHaveTextContent('Email adresa je promenjena.')
    })

    it('does not warn about a previous sign-in for somebody who never signed in', async () => {
      renderTeacher(PATH)
      const form = await open('Luka Ilić')
      expect(form.queryByText(/se već prijavljivao/)).not.toBeInTheDocument()
    })

    it('does not call the backend for a bad address, or for the one already there', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.type(form.getByLabelText('Nova email adresa'), 'nije-email')
      await userEvent.click(form.getByRole('button', { name: 'Promeni' }))
      expect(form.getByRole('alert')).toHaveTextContent('Email adresa nije ispravna.')

      await userEvent.clear(form.getByLabelText('Nova email adresa'))
      await userEvent.type(form.getByLabelText('Nova email adresa'), 'ANA.petrovic@example.test')
      await userEvent.click(form.getByRole('button', { name: 'Promeni' }))
      expect(form.getByRole('alert')).toHaveTextContent('To je trenutna email adresa učenika.')
      expect(teacherApi.changeStudentEmail).not.toHaveBeenCalled()
    })

    it("explains the database's refusals", async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await open()
      await userEvent.type(form.getByLabelText('Nova email adresa'), 'luka.ilic@example.test')
      await userEvent.click(form.getByRole('button', { name: 'Promeni' }))
      expect(await form.findByRole('alert')).toHaveTextContent(
        'Ova adresa već pripada drugoj osobi.',
      )

      teacherApi.failNext(
        'changeStudentEmail',
        new AdminError('PT409', 'this person is also connected to another teacher'),
      )
      await userEvent.click(form.getByRole('button', { name: 'Promeni' }))
      await screen.findByText(/povezana i sa drugim nastavnikom/)
      expect(form.getByRole('alert')).toHaveTextContent(
        'Email adresu može da promeni administrator.',
      )

      teacherApi.failNext('changeStudentEmail', new AdminError('PT403', 'not allowed'))
      await userEvent.click(form.getByRole('button', { name: 'Promeni' }))
      await screen.findByText('Email adresu ove osobe može da promeni samo administrator.')
      expect(form.getByLabelText('Nova email adresa')).toHaveValue('luka.ilic@example.test') // kept
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
  const del = (name: string) => screen.findByRole('button', { name: `Obriši učenika ${name}` })

  it('is offered for a student who has no lesson that was held, and not for one who has', async () => {
    renderTeacher(PATH)
    await page('Učenici')
    expect(await del('Luka Ilić')).toBeInTheDocument()
    // Ana has a lesson that took place (on Monday), so she stays for good
    expect(
      screen.queryByRole('button', { name: 'Obriši učenika Ana Petrović' }),
    ).not.toBeInTheDocument()
  })

  it('is not offered while the lessons of the students are not known', async () => {
    const api = createFakeTeacherApi()
    api.failNext('listStudentCounts', new AdminError('network'))
    renderTeacher(PATH, { api })
    await page('Učenici')
    await row('Luka Ilić')
    expect(screen.queryByRole('button', { name: /^Obriši učenika/ })).not.toBeInTheDocument()
  })

  it('asks first, and says what is lost and how many lessons are cancelled', async () => {
    renderTeacher(PATH)
    await page('Učenici')
    await userEvent.click(await del('Luka Ilić'))
    const dialog = await inDialog('Brisanje učenika')
    expect(dialog.getByText('Luka Ilić')).toBeInTheDocument()
    expect(dialog.getByText(/roditelji koji nemaju drugo dete/)).toBeInTheDocument()
    expect(dialog.getByText(/Zakazani časovi koji će biti otkazani/)).toHaveTextContent(': 2')
  })

  it('does not mention lessons when there are none to cancel', async () => {
    const state = seedTeacher()
    state.lessons = []
    renderTeacher(PATH, { api: createFakeTeacherApi(state) })
    await page('Učenici')
    await userEvent.click(await del('Luka Ilić'))
    const dialog = await inDialog('Brisanje učenika')
    expect(dialog.queryByText(/Zakazani časovi/)).not.toBeInTheDocument()
  })

  it('deletes the student and the row goes', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await page('Učenici')
    await userEvent.click(await del('Luka Ilić'))
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
    await userEvent.click(await del('Luka Ilić'))
    await userEvent.click(
      (await inDialog('Brisanje učenika')).getByRole('button', { name: 'Odustani' }),
    )
    expect(teacherApi.deleteStudent).not.toHaveBeenCalled()
    expect(await row('Luka Ilić')).toBeInTheDocument()
  })

  it('explains it when the database refuses a student who has had a lesson since', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await page('Učenici')
    await userEvent.click(await del('Luka Ilić'))
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
