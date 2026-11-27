import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../admin/adminApi'
import { FIXTURE_CVS } from '../test/fakeCvApi'
import {
  createFakeEnrolmentApi,
  FIXTURE_FORM,
  makeCompleted,
  makeOffer,
  makeRequest,
  type FakeEnrolmentState,
} from '../test/fakeEnrolmentApi'
import { makeRoles, personas } from '../test/fixtures'
import { page as studentPage, renderStudent } from '../test/renderStudent'
import { renderPublic, stranger } from '../test/renderPublic'

const ANA = makeOffer()
const MARKO = makeOffer({
  teacherId: 't-marko',
  firstName: 'Marko',
  lastName: 'Jovanović',
  phone: null,
  subjects: ['Hemija'],
  cvSlug: null,
})

const open = async (
  state: Partial<FakeEnrolmentState> = {},
  role: 'student' | 'parent' = 'student',
) => {
  const enrolmentApi = createFakeEnrolmentApi({
    requests: [makeCompleted({ role, offersCount: 2 })],
    offers: { 'req-1': [ANA, MARKO] },
    cvs: { 't-ana': FIXTURE_CVS[0]! },
    ...state,
  })
  const auth = stranger()
  const view = renderPublic('/upis', { auth, enrolment: enrolmentApi })
  await screen.findByRole('list', { name: 'Ponude nastavnika' })
  return { ...view, enrolmentApi, auth }
}
const offer = (name: string) =>
  within(screen.getByRole('list', { name: 'Ponude nastavnika' }))
    .getByText(name)
    .closest('li')!

describe('the offers', () => {
  it('show each teacher with the phone, the subjects and a way to read the CV', async () => {
    await open()
    const ana = within(offer('Ana Anić'))
    expect(ana.getByRole('link', { name: '064 1111 222' })).toHaveAttribute(
      'href',
      'tel:+381641111222',
    )
    expect(ana.getByRole('list', { name: 'Predmeti' })).toHaveTextContent('Matematika')
    expect(ana.getByRole('button', { name: 'CV: Ana Anić' })).toBeInTheDocument()
    // a teacher without a CV has no CV button, and without a phone says so
    const marko = within(offer('Marko Jovanović'))
    expect(marko.queryByRole('button', { name: /^CV/ })).not.toBeInTheDocument()
    expect(marko.getByText('Broj telefona nije dat')).toBeInTheDocument()
  })

  it('can be accepted at once, without waiting for the choice to open', async () => {
    await open()
    expect(screen.getByRole('button', { name: 'Prihvati ponudu: Ana Anić' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Prihvati ponudu: Marko Jovanović' })).toBeEnabled()
    expect(screen.queryByText(/Izbor nastavnika se otvara/)).not.toBeInTheDocument()
  })

  it('only says that the subject can be changed while there are no offers', async () => {
    const enrolmentApi = createFakeEnrolmentApi({ requests: [makeCompleted()] })
    renderPublic('/upis', { auth: stranger(), enrolment: enrolmentApi })
    expect(
      await screen.findByText('Predmet možeš da promeniš dok nastavnik nije izabran.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Ponude će se pojaviti ovde/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Ponude nastavnika' })).not.toBeInTheDocument()
  })

  it('opens the CV of a teacher, which the teacher cannot hide from the person who chooses', async () => {
    const { enrolmentApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'CV: Ana Anić' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'CV: Ana Anić' }))
    expect(await dialog.findByText(/Predajem matematiku osnovcima/)).toBeInTheDocument()
    expect(enrolmentApi.getOfferedCv).toHaveBeenCalledWith('req-1', 't-ana')
    await userEvent.click(dialog.getByRole('button', { name: 'Zatvori' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('says so when the CV is not there after all', async () => {
    await open({ cvs: {} })
    await userEvent.click(screen.getByRole('button', { name: 'CV: Ana Anić' }))
    expect(await screen.findByText('Ovaj nastavnik nema CV.')).toBeInTheDocument()
  })
})

describe('choosing a teacher', () => {
  const ready = () => ({
    requests: [makeCompleted({ offersCount: 2 })],
  })

  it('asks to be sure, and tells what happens to the other offers', async () => {
    const { enrolmentApi } = await open(ready())
    await userEvent.click(screen.getByRole('button', { name: 'Prihvati ponudu: Ana Anić' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Prihvatanje ponude' }))
    expect(
      dialog.getByText(/Ostale ponude se zatvaraju, a drugi nastavnici ne dobijaju obaveštenje/),
    ).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Odustani' }))
    expect(enrolmentApi.chooseTeacher).not.toHaveBeenCalled()
  })

  it('makes a student a student of the teacher, and the roles are read again', async () => {
    const { enrolmentApi, auth } = await open(ready())
    expect(auth.loadRoles).toHaveBeenCalledTimes(1)
    // from now on the account is a member
    auth.roles = makeRoles({ firstName: 'Luka', lastName: 'Lukić', isStudent: true })
    await userEvent.click(screen.getByRole('button', { name: 'Prihvati ponudu: Ana Anić' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Prihvatanje ponude' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Prihvati ponudu' }))

    expect(enrolmentApi.chooseTeacher).toHaveBeenCalledWith('req-1', 't-ana')
    expect(await screen.findByText('Nastavnik ti je dodeljen.')).toBeInTheDocument()
    expect(auth.loadRoles).toHaveBeenCalledTimes(2)
    expect(await screen.findByRole('link', { name: 'Otvori aplikaciju' })).toHaveAttribute(
      'href',
      '/ucenik',
    )
  })

  it("for a parent the teacher still has to say the child's email, and the other offers are gone", async () => {
    const { enrolmentApi, auth } = await open(
      { requests: [makeCompleted({ role: 'parent', offersCount: 2 })] },
      'parent',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Prihvati ponudu: Ana Anić' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Prihvatanje ponude' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Prihvati ponudu' }))
    expect(enrolmentApi.chooseTeacher).toHaveBeenCalledWith('req-1', 't-ana')
    expect(
      await screen.findByText(
        /Nastavnik Ana Anić je izabran. On treba da upiše email adresu deteta/,
      ),
    ).toBeInTheDocument()
    // the roles are not read again: nothing changed for the parent yet
    expect(auth.loadRoles).toHaveBeenCalledTimes(1)
  })

  it('shows only the chosen teacher once a parent chose', async () => {
    await open({
      requests: [
        makeCompleted({
          role: 'parent',
          status: 'chosen',
          chosenTeacherId: 't-ana',
          offersCount: 1,
        }),
      ],
      offers: { 'req-1': [{ ...ANA, isChosen: true }, MARKO] },
    })
    expect(
      screen.getByText(/On treba da upiše email adresu deteta da bi upis bio završen/),
    ).toBeInTheDocument()
    expect(screen.getByText('Ana Anić')).toBeInTheDocument()
    expect(screen.queryByText('Marko Jovanović')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Prihvati ponudu:/ })).not.toBeInTheDocument()
  })

  it('explains it when somebody else was faster, and keeps the dialog', async () => {
    const { enrolmentApi } = await open(ready())
    enrolmentApi.chooseTeacher.mockRejectedValueOnce(
      new AdminError('PT409', 'a teacher was already chosen'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Prihvati ponudu: Ana Anić' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Prihvatanje ponude' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Prihvati ponudu' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent('Nastavnik je već izabran.')
  })

  it('explains it when the teacher does not offer any more', async () => {
    const { enrolmentApi } = await open(ready())
    enrolmentApi.chooseTeacher.mockRejectedValueOnce(
      new AdminError('PT400', 'this teacher has not offered'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Prihvati ponudu: Marko Jovanović' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Prihvatanje ponude' }))
    await userEvent.click(dialog.getByRole('button', { name: 'Prihvati ponudu' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Taj nastavnik više ne nudi časove. Izaberite drugog.',
    )
  })

  it('says that a teacher was assigned, with a way into the app', async () => {
    const enrolmentApi = createFakeEnrolmentApi({
      requests: [makeCompleted({ status: 'assigned', chosenTeacherId: 't-ana' })],
    })
    renderPublic('/upis', { roles: makeRoles({ isStudent: true }), enrolment: enrolmentApi })
    expect(await screen.findByText('Nastavnik ti je dodeljen.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Otvori aplikaciju' })).toHaveAttribute(
      'href',
      '/ucenik',
    )
  })
})

describe('a student without a subject', () => {
  const legacy = makeRequest({ source: 'legacy', subjectId: null, subjectName: null })

  it('says which one they want, and then sees the profile or the offers', async () => {
    const enrolmentApi = createFakeEnrolmentApi({ requests: [legacy] })
    renderPublic('/upis', { auth: stranger(), enrolment: enrolmentApi })
    expect(await screen.findByText(/Izaberi predmet iz kog želiš časove/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj predmet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Izaberi predmet.')
    await userEvent.selectOptions(screen.getByLabelText('Predmet'), 'Hemija')
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj predmet' }))
    expect(enrolmentApi.setSubject).toHaveBeenCalledWith('req-1', 'sub-hem')
    // the profile of a student a teacher left behind is asked for next, without the privacy policy
    expect(await screen.findByText('Popuni profil da bi te videli nastavnici.')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('explains it when nobody teaches the subject any more', async () => {
    const enrolmentApi = createFakeEnrolmentApi({ requests: [legacy] })
    enrolmentApi.setSubject.mockRejectedValueOnce(
      new AdminError('PT400', 'nobody teaches this subject'),
    )
    renderPublic('/upis', { auth: stranger(), enrolment: enrolmentApi })
    await userEvent.selectOptions(await screen.findByLabelText('Predmet'), 'Fizika')
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj predmet' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Za izabrani predmet trenutno nema nastavnika.',
    )
  })
})

describe('the subject of a request that is open', () => {
  it('is the parent’s choice, not only the one it was made for: the title of the request is a select', async () => {
    const { enrolmentApi } = await open({}, 'parent')
    // the parent has a second select for another child: this one is in the card of the request
    const card = within(screen.getByRole('region', { name: 'Prijava za Matematika' }))
    const picker = card.getByLabelText('Predmet')
    expect(picker).toHaveValue('sub-mat')

    await userEvent.selectOptions(picker, 'Hemija')
    expect(enrolmentApi.setSubject).toHaveBeenCalledWith('req-1', 'sub-hem')
    expect(await screen.findByRole('region', { name: 'Prijava za Hemija' })).toBeInTheDocument()
    expect(
      within(screen.getByRole('region', { name: 'Prijava za Hemija' })).getByLabelText('Predmet'),
    ).toHaveValue('sub-hem')
  })

  it('explains it when nobody teaches the new subject', async () => {
    const { enrolmentApi } = await open({}, 'parent')
    enrolmentApi.setSubject.mockRejectedValueOnce(
      new AdminError('PT400', 'nobody teaches this subject'),
    )
    const card = within(screen.getByRole('region', { name: 'Prijava za Matematika' }))
    await userEvent.selectOptions(card.getByLabelText('Predmet'), 'Fizika')
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Za izabrani predmet trenutno nema nastavnika.',
    )
    // the title keeps the subject the request has
    expect(card.getByLabelText('Predmet')).toHaveValue('sub-mat')
  })

  it('is no longer changed once a teacher is chosen', async () => {
    const enrolmentApi = createFakeEnrolmentApi({
      requests: [makeCompleted({ role: 'parent', status: 'chosen' })],
      offers: { 'req-1': [{ ...ANA, isChosen: true }] },
    })
    renderPublic('/upis', { auth: stranger(), enrolment: enrolmentApi })
    await screen.findByText(/Nastavnik je izabran/)
    expect(screen.queryByLabelText('Predmet')).not.toBeInTheDocument()
  })
})

describe('another child', () => {
  const parent = makeCompleted({ role: 'parent' })

  it('is signed up by a parent for another subject', async () => {
    const enrolmentApi = createFakeEnrolmentApi({ requests: [parent], offers: {} })
    renderPublic('/upis', { auth: stranger(), enrolment: enrolmentApi })
    const section = within(await screen.findByRole('region', { name: 'Nova prijava' }))
    await userEvent.click(section.getByRole('button', { name: 'Nova prijava' }))
    expect(await section.findByRole('alert')).toHaveTextContent('Izaberi predmet.')
    await userEvent.selectOptions(section.getByLabelText('Predmet'), 'Fizika')
    await userEvent.click(section.getByRole('button', { name: 'Nova prijava' }))
    expect(enrolmentApi.startEnrolment).toHaveBeenCalledWith('sub-fiz', 'parent', undefined)
    expect(await screen.findByRole('region', { name: 'Prijava za Fizika' })).toBeInTheDocument()
  })

  it('is not offered to a student, nor when the school takes no sign-ups', async () => {
    renderPublic('/upis', {
      auth: stranger(),
      enrolment: createFakeEnrolmentApi({ requests: [makeCompleted()] }),
    })
    await screen.findByRole('region', { name: 'Prijava za Matematika' })
    expect(screen.queryByRole('region', { name: 'Nova prijava' })).not.toBeInTheDocument()
  })

  it('is not offered while the form is switched off', async () => {
    renderPublic('/upis', {
      auth: stranger(),
      enrolment: createFakeEnrolmentApi({
        requests: [parent],
        form: { ...FIXTURE_FORM, enabled: false },
      }),
    })
    await screen.findByRole('region', { name: 'Prijava za Matematika' })
    // the form info arrives after the card
    await screen.findByText(/Tvoj zahtev je primljen/)
    expect(screen.queryByRole('region', { name: 'Nova prijava' })).not.toBeInTheDocument()
  })

  it('explains a refusal', async () => {
    const enrolmentApi = createFakeEnrolmentApi({ requests: [parent] })
    enrolmentApi.startEnrolment.mockRejectedValueOnce(new AdminError('PT403', 'enrolment is off'))
    renderPublic('/upis', { auth: stranger(), enrolment: enrolmentApi })
    const section = within(await screen.findByRole('region', { name: 'Nova prijava' }))
    await userEvent.selectOptions(section.getByLabelText('Predmet'), 'Hemija')
    await userEvent.click(section.getByRole('button', { name: 'Nova prijava' }))
    expect(await section.findByRole('alert')).toHaveTextContent(
      'Prijava za časove trenutno nije dostupna.',
    )
  })
})

describe('inside the app', () => {
  it('a parent reaches the sign-ups from the header, and can ask for lessons for another child', async () => {
    const enrolmentApi = createFakeEnrolmentApi()
    renderStudent('/roditelj', { enrolmentApi })
    await studentPage('Časovi dece')
    // not a tab of the lessons
    expect(
      within(await screen.findByRole('navigation', { name: 'Prikaz' })).queryByRole('link', {
        name: 'Prijava za časove',
      }),
    ).not.toBeInTheDocument()
    await userEvent.click(
      await within(screen.getByRole('banner')).findByRole('link', { name: 'Prijava za časove' }),
    )
    expect(await studentPage('Moje prijave')).toBeInTheDocument()
    expect(await screen.findByText('Nemate otvorenih prijava za časove.')).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: 'Nova prijava' })).toBeInTheDocument()
    // the page of the requests has no tabs, and a way back
    expect(screen.queryByRole('navigation', { name: 'Prikaz' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Časovi dece/ })).toBeInTheDocument()
  })

  it('a student has the button in the header, with how many requests can choose now', async () => {
    renderStudent('/ucenik')
    await studentPage('Moji časovi')
    const button = await within(screen.getByRole('banner')).findByRole('link', {
      name: 'Prijava za časove',
    })
    // nothing to choose from: no count
    expect(button).toHaveTextContent(/^$/)
    expect(
      within(await screen.findByRole('navigation', { name: 'Prikaz' })).queryByRole('link', {
        name: /Prijava za časove/,
      }),
    ).not.toBeInTheDocument()
  })

  it('a student who waits for a teacher chooses among the offers', async () => {
    const enrolmentApi = createFakeEnrolmentApi({
      requests: [makeCompleted({ source: 'legacy', offersCount: 2 })],
      offers: { 'req-1': [ANA, MARKO] },
    })
    renderStudent('/ucenik', { enrolmentApi, roles: personas.student })
    await studentPage('Moji časovi')
    const button = await within(screen.getByRole('banner')).findByRole('link', {
      name: /^Prijava za časove/,
    })
    // one request can be chosen from now
    expect(button).toHaveTextContent('1')
    await userEvent.click(button)
    expect(await screen.findByRole('list', { name: 'Ponude nastavnika' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prihvati ponudu: Ana Anić' })).toBeInTheDocument()
  })
})
