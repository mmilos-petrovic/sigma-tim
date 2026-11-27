import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { createFakeEnrolmentApi, makeCompleted } from '../../test/fakeEnrolmentApi'
import { createFakeStudentApi, seedStudent } from '../../test/fakeStudentApi'
import { makeRoles, personas } from '../../test/fixtures'
import { page, renderStudent } from '../../test/renderStudent'
import type { MyProfile, ProfilePerson } from '../studentApi'

const unconfirmedStudent = makeRoles({ ...personas.student, profileConfirmed: false })
const unconfirmedParent = makeRoles({ ...personas.parent, profileConfirmed: false })

const person = (overrides: Partial<ProfilePerson> = {}): ProfilePerson => ({
  profileId: 'p-student',
  self: true,
  firstName: 'Sava',
  lastName: 'Savić',
  email: 'sava@example.test',
  phone: null,
  school: 'Osnovna škola Vuk Karadžić',
  grade: '6',
  cityPart: null,
  schoolTeacher: null,
  situation: null,
  ...overrides,
})

/** A student a teacher added, with the school and the grade the teacher entered. */
const addedByTeacher = (): MyProfile => ({
  confirmed: false,
  isParent: false,
  phone: null,
  people: [person()],
})

const empty = (): MyProfile => ({
  confirmed: false,
  isParent: false,
  phone: null,
  people: [person({ school: null, grade: null })],
})

const parentOfTwo = (): MyProfile => ({
  confirmed: false,
  isParent: true,
  phone: null,
  people: [
    person({ profileId: 'c-1', self: false, firstName: 'Mika', lastName: 'Mikić', grade: '3' }),
    person({
      profileId: 'c-2',
      self: false,
      firstName: 'Nika',
      lastName: 'Mikić',
      school: 'Gimnazija',
      grade: '1',
    }),
  ],
})

const apiWith = (profile: MyProfile) => createFakeStudentApi({ ...seedStudent(), profile })

describe('the profile that comes first', () => {
  it('is all a student a teacher added sees: what the teacher entered, to confirm', async () => {
    renderStudent('/ucenik', { roles: unconfirmedStudent, api: apiWith(addedByTeacher()) })
    await page('Profil')
    expect(
      await screen.findByText(/Proveri podatke koje je upisao nastavnik i potvrdi da su tačni/),
    ).toBeInTheDocument()
    const form = within(screen.getByRole('form', { name: 'Profil' }))
    expect(form.getByLabelText('Ime')).toHaveValue('Sava')
    expect(form.getByLabelText('Škola')).toHaveValue('Osnovna škola Vuk Karadžić')
    expect(form.getByLabelText('Razred')).toHaveValue('6')
    expect(form.getByRole('button', { name: 'Potvrdi podatke' })).toBeInTheDocument()
    // no lessons, no tabs, no footer: only the profile
    expect(screen.queryByRole('heading', { name: 'Predstojeći časovi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Prikaz' })).not.toBeInTheDocument()
  })

  it('is the same at any address of the student', async () => {
    renderStudent('/ucenik/termini', { roles: unconfirmedStudent, api: apiWith(addedByTeacher()) })
    await page('Profil')
    expect(await screen.findByRole('form', { name: 'Profil' })).toBeInTheDocument()
  })

  it('asks a student with nothing entered to fill the profile in', async () => {
    renderStudent('/ucenik', { roles: unconfirmedStudent, api: apiWith(empty()) })
    await page('Profil')
    expect(await screen.findByText('Popuni profil da bi te videli nastavnici.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sačuvaj' })).toBeInTheDocument()
  })

  it('needs the privacy policy, and then opens the lessons', async () => {
    const api = apiWith(addedByTeacher())
    renderStudent('/ucenik', { roles: unconfirmedStudent, api })
    await userEvent.click(await screen.findByRole('button', { name: 'Potvrdi podatke' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prihvatite politiku privatnosti da biste nastavili.',
    )
    expect(api.calls.saveMyProfile).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.clear(screen.getByLabelText('Razred'))
    await userEvent.type(screen.getByLabelText('Razred'), '7')
    await userEvent.type(screen.getByLabelText('Telefon (nije obavezno)'), '064 1234 567')
    await userEvent.click(screen.getByRole('button', { name: 'Potvrdi podatke' }))

    expect(api.calls.saveMyProfile).toHaveBeenCalledWith({
      phone: '+381641234567',
      people: [
        {
          profileId: 'p-student',
          firstName: 'Sava',
          lastName: 'Savić',
          phone: '',
          school: 'Osnovna škola Vuk Karadžić',
          grade: '7',
          cityPart: '',
          schoolTeacher: '',
          situation: '',
        },
      ],
      consent: true,
    })
    expect(await screen.findByRole('heading', { name: 'Predstojeći časovi' })).toBeInTheDocument()
    expect(screen.queryByRole('form', { name: 'Profil' })).not.toBeInTheDocument()
  })

  it('names what is missing, before asking the database', async () => {
    const api = apiWith(empty())
    renderStudent('/ucenik', { roles: unconfirmedStudent, api })
    await userEvent.click(await screen.findByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Upišite školu.')
    await userEvent.type(screen.getByLabelText('Škola'), 'Gimnazija')
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Upišite razred.')
    await userEvent.type(screen.getByLabelText('Razred'), '2')
    await userEvent.type(screen.getByLabelText('Telefon (nije obavezno)'), '12345')
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Broj telefona nije ispravan')
    expect(api.calls.saveMyProfile).not.toHaveBeenCalled()
  })

  it('explains a refusal of the database', async () => {
    const api = apiWith(addedByTeacher())
    api.failNext('saveMyProfile', new AdminError('PT400', 'the privacy policy has to be accepted'))
    renderStudent('/ucenik', { roles: unconfirmedStudent, api })
    await userEvent.click(await screen.findByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Potvrdi podatke' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prihvatite politiku privatnosti da biste nastavili.',
    )
  })

  it('keeps the header: the name, the way to change the profile and to sign out', async () => {
    renderStudent('/ucenik', { roles: unconfirmedStudent, api: apiWith(addedByTeacher()) })
    const header = within(await screen.findByRole('banner'))
    expect(header.getByRole('link', { name: 'Podešavanja' })).toHaveAttribute(
      'href',
      '/ucenik/podesavanja',
    )
    expect(header.getByRole('button', { name: 'Odjavi se' })).toBeInTheDocument()
  })
})

describe('the profile of a parent', () => {
  it('has the own phone, which is needed, and a part for each child', async () => {
    const api = apiWith(parentOfTwo())
    renderStudent('/roditelj', { roles: unconfirmedParent, api })
    await page('Profil')
    expect(await screen.findByText(/Proveri podatke koje je upisao nastavnik/)).toBeInTheDocument()
    const children = screen.getAllByRole('group')
    expect(children.map((group) => group.querySelector('legend')?.textContent)).toEqual([
      'Dete: Mika Mikić',
      'Dete: Nika Mikić',
    ])
    expect(screen.getByLabelText('Vaš telefon za kontakt')).toHaveValue('')
    expect(screen.getAllByLabelText('Telefon deteta (nije obavezno)')).toHaveLength(2)

    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Potvrdi podatke' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unesite broj telefona.')
    expect(api.calls.saveMyProfile).not.toHaveBeenCalled()
  })

  it('names the child whose data is missing', async () => {
    const profile = parentOfTwo()
    profile.people[1] = { ...profile.people[1]!, school: null }
    renderStudent('/roditelj', { roles: unconfirmedParent, api: apiWith(profile) })
    await userEvent.type(await screen.findByLabelText('Vaš telefon za kontakt'), '064 1234 567')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Potvrdi podatke' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Upišite školu (Nika).')
  })

  it('saves them all at once, and opens the lessons of the children', async () => {
    const api = apiWith(parentOfTwo())
    renderStudent('/roditelj', { roles: unconfirmedParent, api })
    await userEvent.type(await screen.findByLabelText('Vaš telefon za kontakt'), '064 1234 567')
    const [first] = screen.getAllByLabelText('Telefon deteta (nije obavezno)')
    await userEvent.type(first!, '063 111 222')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Potvrdi podatke' }))

    const sent = api.calls.saveMyProfile.mock.calls[0]![0]
    expect(sent.phone).toBe('+381641234567')
    expect(
      sent.people.map((p: { profileId: string; phone: string }) => [p.profileId, p.phone]),
    ).toEqual([
      ['c-1', '+38163111222'],
      ['c-2', ''],
    ])
    expect(await screen.findByRole('heading', { name: 'Predstojeći časovi' })).toBeInTheDocument()
  })
})

describe('the profile afterwards', () => {
  const confirmedStudent = (): MyProfile => ({
    confirmed: true,
    isParent: false,
    phone: '+381641234567',
    people: [person({ cityPart: 'Zemun', situation: 'Treba pomoć iz matematike.' })],
  })

  it('is reached with the gear in the header, and has everything the person entered', async () => {
    renderStudent('/ucenik', { api: apiWith(confirmedStudent()) })
    await page('Moji časovi')
    await userEvent.click(await screen.findByRole('link', { name: 'Podešavanja' }))
    await page('Podešavanja')
    const form = within(await screen.findByRole('form', { name: 'Profil' }))
    expect(form.getByLabelText('Telefon (nije obavezno)')).toHaveValue('064 1234 567')
    expect(form.getByLabelText('Deo grada (nije obavezno)')).toHaveValue('Zemun')
    expect(form.getByLabelText(/Kako ide u školi/)).toHaveValue('Treba pomoć iz matematike.')
    // the policy was accepted once
    expect(form.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(form.getByRole('button', { name: 'Sačuvaj izmene' })).toBeInTheDocument()
    expect(screen.queryByText(/Proveri podatke/)).not.toBeInTheDocument()
  })

  it('can be changed, the number can be taken away, and the person is told', async () => {
    const api = apiWith(confirmedStudent())
    renderStudent('/ucenik/podesavanja', { api })
    await page('Podešavanja')
    await userEvent.clear(await screen.findByLabelText('Škola'))
    await userEvent.type(screen.getByLabelText('Škola'), 'Gimnazija')
    await userEvent.clear(screen.getByLabelText('Telefon (nije obavezno)'))
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj izmene' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Podaci su sačuvani.')
    expect(api.state.profile.phone).toBeNull()
    expect(api.state.profile.people[0]!.school).toBe('Gimnazija')
    expect(api.calls.saveMyProfile.mock.calls[0]![0].consent).toBe(true)
  })

  it('does not let a parent take their own number away', async () => {
    const profile = parentOfTwo()
    profile.confirmed = true
    profile.phone = '+381641234567'
    const api = apiWith(profile)
    renderStudent('/roditelj/podesavanja', { api })
    await userEvent.clear(await screen.findByLabelText('Vaš telefon za kontakt'))
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj izmene' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unesite broj telefona.')
    expect(api.calls.saveMyProfile).not.toHaveBeenCalled()
  })
})

describe('more than one sign-up', () => {
  it('lets a student ask for another subject, always', async () => {
    const enrolmentApi = createFakeEnrolmentApi({ requests: [] })
    renderStudent('/ucenik/prijava', { enrolmentApi })
    await page('Moje prijave')
    const section = within(await screen.findByRole('region', { name: 'Nova prijava' }))
    // a student chooses no child
    expect(section.queryByLabelText('Dete')).not.toBeInTheDocument()
    await userEvent.selectOptions(section.getByLabelText('Predmet'), 'Fizika')
    await userEvent.click(section.getByRole('button', { name: 'Nova prijava' }))
    expect(enrolmentApi.startEnrolment).toHaveBeenCalledWith('sub-fiz', 'student', undefined)
    expect(await screen.findByRole('region', { name: 'Prijava za Fizika' })).toBeInTheDocument()
  })

  it('lets a student have one request at a time: the old one is deleted to make another', async () => {
    const enrolmentApi = createFakeEnrolmentApi({
      requests: [makeCompleted({ id: 'req-open', subjectId: 'sub-fiz', subjectName: 'Fizika' })],
    })
    renderStudent('/ucenik/prijava', { enrolmentApi })
    await page('Moje prijave')
    expect(await screen.findByRole('region', { name: 'Prijava za Fizika' })).toBeInTheDocument()
    // no new request while one is active
    expect(screen.queryByRole('region', { name: 'Nova prijava' })).not.toBeInTheDocument()
    expect(screen.getByText(/Možeš da imaš samo jednu prijavu/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Obriši prijavu' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Brisanje prijave' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši prijavu' }))

    expect(enrolmentApi.cancelRequest).toHaveBeenCalledWith('req-open')
    expect(await screen.findByRole('region', { name: 'Nova prijava' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Prijava za Fizika' })).not.toBeInTheDocument()
  })

  it('keeps the request when the person does not confirm the deletion', async () => {
    const enrolmentApi = createFakeEnrolmentApi({
      requests: [makeCompleted({ id: 'req-open', subjectId: 'sub-fiz', subjectName: 'Fizika' })],
    })
    renderStudent('/ucenik/prijava', { enrolmentApi })
    await page('Moje prijave')
    await userEvent.click(await screen.findByRole('button', { name: 'Obriši prijavu' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Brisanje prijave' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Odustani' }))
    expect(enrolmentApi.cancelRequest).not.toHaveBeenCalled()
    expect(screen.getByRole('region', { name: 'Prijava za Fizika' })).toBeInTheDocument()
  })

  it('hides a request that is over, and keeps the ones that wait', async () => {
    const enrolmentApi = createFakeEnrolmentApi({
      requests: [
        makeCompleted({ id: 'req-done', status: 'assigned', subjectName: 'Hemija' }),
        makeCompleted({ id: 'req-open', subjectId: 'sub-fiz', subjectName: 'Fizika' }),
      ],
    })
    renderStudent('/ucenik/prijava', { enrolmentApi })
    expect(await screen.findByRole('region', { name: 'Prijava za Fizika' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Prijava za Hemija' })).not.toBeInTheDocument()
  })

  it('lets a parent say for which child: one who is a student already, or another one', async () => {
    const profile = parentOfTwo()
    profile.confirmed = true
    profile.phone = '+381641234567'
    const enrolmentApi = createFakeEnrolmentApi({ requests: [] })
    renderStudent('/roditelj/prijava', { enrolmentApi, api: apiWith(profile) })
    await page('Moje prijave')
    const section = within(await screen.findByRole('region', { name: 'Nova prijava' }))
    const child = await section.findByLabelText('Dete')
    expect([...(child as HTMLSelectElement).options].map((o) => o.textContent)).toEqual([
      'Mika Mikić',
      'Nika Mikić',
      'Drugo dete',
    ])
    // the first child is chosen, so the request is about them
    await userEvent.selectOptions(section.getByLabelText('Predmet'), 'Hemija')
    await userEvent.click(section.getByRole('button', { name: 'Nova prijava' }))
    expect(enrolmentApi.startEnrolment).toHaveBeenCalledWith('sub-hem', 'parent', 'c-1')

    await userEvent.selectOptions(child, 'Drugo dete')
    await userEvent.selectOptions(section.getByLabelText('Predmet'), 'Fizika')
    await userEvent.click(section.getByRole('button', { name: 'Nova prijava' }))
    expect(enrolmentApi.startEnrolment).toHaveBeenLastCalledWith('sub-fiz', 'parent', undefined)
  })

  it('tells a person who already has a request for the subject', async () => {
    const enrolmentApi = createFakeEnrolmentApi({ requests: [] })
    enrolmentApi.startEnrolment.mockRejectedValueOnce(
      new AdminError('PT409', 'there is a request for this subject already'),
    )
    renderStudent('/ucenik/prijava', { enrolmentApi })
    const section = within(await screen.findByRole('region', { name: 'Nova prijava' }))
    await userEvent.selectOptions(section.getByLabelText('Predmet'), 'Fizika')
    await userEvent.click(section.getByRole('button', { name: 'Nova prijava' }))
    expect(await section.findByRole('alert')).toHaveTextContent('Već imate prijavu za taj predmet.')
  })
})
