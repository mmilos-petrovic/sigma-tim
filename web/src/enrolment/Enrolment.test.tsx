import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../admin/adminApi'
import { createFakeEnrolmentApi, makeRequest } from '../test/fakeEnrolmentApi'
import { makeRoles, personas } from '../test/fixtures'
import { createFakeAuthApi } from '../test/fakeAuthApi'
import { renderPublic, stranger, visitor, where } from '../test/renderPublic'
import { peekPendingEnrolment, savePendingEnrolment } from './pending'

const heading = (name: string, level = 1) => screen.findByRole('heading', { name, level })

describe('coming back from Google after the form', () => {
  it('makes the request with the subject and the role that were chosen, and shows it', async () => {
    savePendingEnrolment({ subjectId: 'sub-fiz', role: 'parent' })
    const { enrolment } = renderPublic('/prijava', { auth: stranger() })
    expect(await heading('Prijava za časove')).toBeInTheDocument()
    expect(enrolment.startEnrolment).toHaveBeenCalledWith('sub-fiz', 'parent')
    expect(where()).toBe('/upis')
    expect(screen.getByRole('region', { name: 'Prijava za Fizika' })).toBeInTheDocument()
    // used up: another visit to the sign-in page does not make a second request
    expect(peekPendingEnrolment()).toBeNull()
  })

  it('asks for the profile first, in the words the owner chose', async () => {
    savePendingEnrolment({ subjectId: 'sub-mat', role: 'student' })
    renderPublic('/prijava', { auth: stranger() })
    expect(await screen.findByText('Popuni profil da bi te videli nastavnici.')).toBeInTheDocument()
  })

  it('does not sign a member of the school up, and forgets the choice', async () => {
    savePendingEnrolment({ subjectId: 'sub-mat', role: 'student' })
    const { enrolment } = renderPublic('/prijava', { roles: personas.teacher })
    expect(await heading('Moj raspored')).toBeInTheDocument()
    expect(enrolment.startEnrolment).not.toHaveBeenCalled()
    expect(peekPendingEnrolment()).toBeNull()
  })

  it('does not sign anybody up who has not chosen anything', async () => {
    const { enrolment } = renderPublic('/prijava', { auth: stranger() })
    expect(await heading('Još niste član škole')).toBeInTheDocument()
    expect(enrolment.startEnrolment).not.toHaveBeenCalled()
  })

  it('ignores a choice that is not one', async () => {
    window.sessionStorage.setItem('sigma.enrolment', '{"subjectId":"","role":"teacher"}')
    const { enrolment } = renderPublic('/prijava', { auth: stranger() })
    expect(await heading('Još niste član škole')).toBeInTheDocument()
    expect(enrolment.startEnrolment).not.toHaveBeenCalled()
  })

  it('explains a refusal, and tries again on request', async () => {
    savePendingEnrolment({ subjectId: 'sub-mat', role: 'student' })
    const enrolment = createFakeEnrolmentApi()
    enrolment.startEnrolment.mockRejectedValueOnce(new AdminError('PT403', 'enrolment is off'))
    renderPublic('/prijava', { auth: stranger(), enrolment })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prijava za časove trenutno nije dostupna. Pozovite nas na 064 4994 235.',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await heading('Prijava za časove')).toBeInTheDocument()
    expect(enrolment.startEnrolment).toHaveBeenCalledTimes(2)
  })

  it('says that nobody teaches the subject any more', async () => {
    savePendingEnrolment({ subjectId: 'sub-mat', role: 'student' })
    const enrolment = createFakeEnrolmentApi()
    enrolment.startEnrolment.mockRejectedValue(
      new AdminError('PT400', 'nobody teaches this subject'),
    )
    renderPublic('/prijava', { auth: stranger(), enrolment })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Za izabrani predmet trenutno nema nastavnika. Izaberite drugi.',
    )
  })

  it('lets the person give up, which forgets the choice', async () => {
    savePendingEnrolment({ subjectId: 'sub-mat', role: 'student' })
    const enrolment = createFakeEnrolmentApi()
    enrolment.startEnrolment.mockRejectedValue(new AdminError('PT403', 'off'))
    renderPublic('/prijava', { auth: stranger(), enrolment })
    await userEvent.click(await screen.findByRole('link', { name: 'Na početnu' }))
    expect(where()).toBe('/')
    expect(peekPendingEnrolment()).toBeNull()
  })
})

describe('somebody who signed up and signs in again', () => {
  it('finds the request, not the "not a member" page', async () => {
    const enrolment = createFakeEnrolmentApi({ requests: [makeRequest()] })
    renderPublic('/prijava', { auth: stranger(), enrolment })
    expect(await heading('Prijava za časove')).toBeInTheDocument()
    expect(where()).toBe('/upis')
  })

  it('is sent to the sign-in page when the session is gone', async () => {
    renderPublic('/upis', { auth: visitor() })
    expect(await heading('Prijava')).toBeInTheDocument()
    expect(where()).toBe('/prijava')
  })

  it('is sent to the usual place when nobody signed this account up', async () => {
    renderPublic('/upis', { auth: stranger() })
    expect(await heading('Još niste član škole')).toBeInTheDocument()
  })

  it('is sent to their own screens when they are a member without a request', async () => {
    renderPublic('/upis', { roles: personas.student })
    expect(await heading('Moji časovi')).toBeInTheDocument()
  })

  it('is asked to try again when the request cannot be read', async () => {
    const enrolment = createFakeEnrolmentApi({ requests: [makeRequest()] })
    enrolment.myRequests.mockRejectedValueOnce(new AdminError('network', 'offline'))
    renderPublic('/upis', { auth: stranger(), enrolment })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await heading('Prijava za časove')).toBeInTheDocument()
  })
})

describe('the profile', () => {
  const open = async (
    request = makeRequest(),
    auth = createFakeAuthApi({
      roles: makeRoles({ firstName: 'Luka', lastName: 'Lukić' }),
    }),
  ) => {
    // a Google account the school does not know has a profile and no role, which `my_roles` still reports
    auth.roles = makeRoles({ firstName: 'Luka', lastName: 'Lukić' })
    const enrolment = createFakeEnrolmentApi({ requests: [request] })
    const view = renderPublic('/upis', { auth, enrolment })
    await screen.findByText('Popuni profil da bi te videli nastavnici.')
    return { ...view, enrolment }
  }
  const fill = async (label: string, text: string) => {
    const field = screen.getByLabelText(label)
    await userEvent.clear(field)
    await userEvent.type(field, text)
  }
  const fillAll = async () => {
    await fill('Telefon za kontakt', '064 123 4567')
    await fill('Škola', 'Gimnazija')
    await fill('Razred', '3. razred')
  }
  const save = () => userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))

  it('starts with the name of the Google account for a student, and with nothing for a parent', async () => {
    await open()
    expect(screen.getByLabelText('Ime učenika')).toHaveValue('Luka')
    expect(screen.getByLabelText('Prezime učenika')).toHaveValue('Lukić')
  })

  it("leaves the child's name empty for a parent", async () => {
    await open(makeRequest({ role: 'parent' }))
    expect(screen.getByLabelText('Ime učenika')).toHaveValue('')
    expect(screen.getByLabelText('Prezime učenika')).toHaveValue('')
  })

  it('asks for what is missing, one thing at a time, and sends nothing', async () => {
    const { enrolment } = await open()
    await userEvent.clear(screen.getByLabelText('Ime učenika'))
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent('Upišite ime i prezime učenika.')
    await userEvent.type(screen.getByLabelText('Ime učenika'), 'Luka')

    await save()
    expect(screen.getByRole('alert')).toHaveTextContent('Unesite broj telefona.')
    await fill('Telefon za kontakt', '12')
    await save()
    expect(screen.getByRole('alert')).toHaveTextContent('Broj telefona nije ispravan')
    await fill('Telefon za kontakt', '064 123 4567')

    await save()
    expect(screen.getByRole('alert')).toHaveTextContent('Upišite školu.')
    await fill('Škola', 'Gimnazija')
    await save()
    expect(screen.getByRole('alert')).toHaveTextContent('Upišite razred.')
    await fill('Razred', '3. razred')
    await save()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Prihvatite politiku privatnosti da biste nastavili.',
    )
    expect(enrolment.completeProfile).not.toHaveBeenCalled()
  })

  it('sends the profile with the phone in the international form, and then shows the request', async () => {
    const { enrolment } = await open()
    await fillAll()
    await fill('Deo grada (nije obavezno)', '  Centar ')
    await fill('Kako ide u školi i šta želiš da savladaš (nije obavezno)', 'Treba mi pomoć')
    await userEvent.click(screen.getByRole('checkbox', { name: /Prihvatam politiku privatnosti/ }))
    await save()
    expect(enrolment.completeProfile).toHaveBeenCalledWith('req-1', {
      firstName: 'Luka',
      lastName: 'Lukić',
      phone: '+381641234567',
      school: 'Gimnazija',
      grade: '3. razred',
      cityPart: 'Centar',
      situation: 'Treba mi pomoć',
      consent: true,
    })
    expect(await screen.findByText(/Tvoj zahtev je primljen/)).toBeInTheDocument()
    expect(screen.getByText(/Luka Lukić · Gimnazija, 3\. razred/)).toBeInTheDocument()
  })

  it('links the privacy policy next to the consent', async () => {
    await open()
    expect(screen.getByRole('link', { name: 'politiku privatnosti' })).toHaveAttribute(
      'href',
      '/politika-privatnosti',
    )
  })

  it('explains what the database refused', async () => {
    const { enrolment } = await open()
    enrolment.completeProfile.mockRejectedValueOnce(
      new AdminError('PT409', 'a teacher was already chosen'),
    )
    await fillAll()
    await userEvent.click(screen.getByRole('checkbox', { name: /Prihvatam/ }))
    await save()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nastavnik je već izabran, pa se profil više ne menja.',
    )
    // the form stays, with what was typed
    expect(screen.getByLabelText('Škola')).toHaveValue('Gimnazija')
  })

  it('can be changed later, without asking for the consent again', async () => {
    const done = makeRequest({
      profileCompleted: true,
      studentFirstName: 'Luka',
      studentLastName: 'Lukić',
      contactPhone: '+381641234567',
      school: 'Gimnazija',
      grade: '3. razred',
    })
    const enrolment = createFakeEnrolmentApi({ requests: [done] })
    renderPublic('/upis', { auth: stranger(), enrolment })
    await userEvent.click(await screen.findByRole('button', { name: 'Izmeni profil' }))
    // the number is shown the way it is written at home
    expect(screen.getByLabelText('Telefon za kontakt')).toHaveValue('064 1234 567')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    await fill('Razred', '4. razred')
    await save()
    expect(enrolment.completeProfile).toHaveBeenCalledWith(
      'req-1',
      expect.objectContaining({ grade: '4. razred', consent: true }),
    )
    expect(await screen.findByText(/Gimnazija, 4\. razred/)).toBeInTheDocument()
  })

  it('says the same to a request that waits for the administrator, and never that sign-ups are closed', async () => {
    const waiting = makeRequest({
      profileCompleted: true,
      waitingForApproval: true,
      studentFirstName: 'Luka',
      studentLastName: 'Lukić',
      school: 'Gimnazija',
      grade: '3. razred',
    })
    renderPublic('/upis', {
      auth: stranger(),
      enrolment: createFakeEnrolmentApi({ requests: [waiting] }),
    })
    const card = within(await screen.findByRole('region', { name: 'Prijava za Matematika' }))
    expect(card.getByText(/Tvoj zahtev je primljen/)).toBeInTheDocument()
    expect(screen.queryByText(/zatvoren|odobren/i)).not.toBeInTheDocument()
  })

  it('shows one card for each request', async () => {
    const enrolment = createFakeEnrolmentApi({
      requests: [
        makeRequest(),
        makeRequest({ id: 'req-2', subjectId: 'sub-fiz', subjectName: 'Fizika', role: 'parent' }),
      ],
    })
    renderPublic('/upis', { auth: stranger(), enrolment })
    expect(await screen.findByRole('region', { name: 'Prijava za Matematika' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Prijava za Fizika' })).toBeInTheDocument()
  })

  it('does not ask a request with a chosen teacher for anything', async () => {
    const enrolment = createFakeEnrolmentApi({
      requests: [makeRequest({ status: 'chosen', profileCompleted: true })],
    })
    renderPublic('/upis', { auth: stranger(), enrolment })
    expect(await screen.findByText(/Nastavnik je izabran\./)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Izmeni profil' })).not.toBeInTheDocument()
  })

  it('is not indexed by search engines', async () => {
    await open()
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })
})
