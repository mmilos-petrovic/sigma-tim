import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import {
  createFakeEnrolmentApi,
  makeAdminRow,
  type FakeEnrolmentState,
} from '../../test/fakeEnrolmentApi'
import { page, renderAdmin } from '../../test/renderAdmin'
import { AdminError } from '../adminApi'

const PATH = '/administracija/prijave'

const ROWS = [
  makeAdminRow({
    requestId: 'r-wait',
    state: 'needs_approval',
    firstName: 'Petar',
    lastName: 'Petrović',
    email: 'petar@example.test',
    offers: [],
  }),
  makeAdminRow({
    requestId: 'r-open',
    state: 'open',
    firstName: 'Luka',
    lastName: 'Lukić',
    email: 'luka@example.test',
    grade: '3',
    cityPart: 'Centar',
    situation: 'Slab iz matematike',
    offers: [{ teacherId: 't-ana', name: 'Ana Nikolić', offeredAt: '2026-11-14T10:00:00Z' }],
  }),
  makeAdminRow({
    requestId: 'r-stuck',
    state: 'open',
    firstName: 'Neda',
    lastName: 'Marković',
    email: 'neda@example.test',
  }),
  makeAdminRow({
    requestId: 'r-choice',
    state: 'open',
    firstName: 'Mina',
    lastName: 'Ilić',
    email: 'mina@example.test',
    offers: [
      { teacherId: 't-ana', name: 'Ana Nikolić', offeredAt: '2026-11-14T10:00:00Z' },
      { teacherId: 't-marko', name: 'Marko Jovanović', offeredAt: '2026-11-14T11:00:00Z' },
    ],
  }),
  makeAdminRow({
    requestId: 'r-parent',
    role: 'parent',
    state: 'open',
    firstName: 'Vuk',
    lastName: 'Vasić',
    email: 'roditelj@example.test',
  }),
  makeAdminRow({
    requestId: 'r-incomplete',
    state: 'incomplete',
    firstName: null,
    lastName: null,
    phone: null,
    school: null,
    grade: null,
    email: 'tek.stigao@example.test',
    listedAt: null,
  }),
  makeAdminRow({
    requestId: 'r-done',
    state: 'assigned',
    firstName: 'Sara',
    lastName: 'Savić',
    email: 'sara@example.test',
  }),
  makeAdminRow({
    requestId: 'r-legacy',
    source: 'legacy',
    state: 'open',
    firstName: 'Jovan',
    lastName: 'Jović',
    email: 'jovan@example.test',
  }),
  makeAdminRow({
    requestId: 'r-no',
    state: 'rejected',
    firstName: 'Zoran',
    lastName: 'Zorić',
    email: 'zoran@example.test',
  }),
]

const open = async (state: Partial<FakeEnrolmentState> = {}) => {
  const enrolmentApi = createFakeEnrolmentApi({ all: ROWS, ...state })
  const view = renderAdmin(PATH, { enrolmentApi })
  await page('Prijave za časove')
  if (enrolmentApi.state.all.length > 0) await screen.findAllByRole('article')
  return { ...view, enrolmentApi }
}
const card = (name: string) => within(screen.getByRole('article', { name }))
const names = () => screen.getAllByRole('article').map((a) => a.getAttribute('aria-label'))

describe('the list of sign-ups', () => {
  it('starts with what is not finished, newest first as the database gave them', async () => {
    await open()
    expect(names()).toEqual([
      'Petar Petrović',
      'Luka Lukić',
      'Neda Marković',
      'Mina Ilić',
      'Vuk Vasić',
      'tek.stigao@example.test',
      'Jovan Jović',
    ])
  })

  it('names a person who has not filled in the profile by the email', async () => {
    await open()
    const card_ = card('tek.stigao@example.test')
    expect(card_.getByRole('list', { name: 'Stanje' })).toHaveTextContent('Profil nije popunjen')
    expect(card_.queryByText('Telefon')).not.toBeInTheDocument()
    // nothing to assign yet
    expect(card_.queryByRole('button', { name: /Dodeli nastavnika/ })).not.toBeInTheDocument()
  })

  it('shows what the person typed and who offered', async () => {
    await open()
    const luka = card('Luka Lukić')
    expect(luka.getByRole('list', { name: 'Stanje' })).toHaveTextContent('Čeka nastavnika')
    expect(luka.getByRole('link', { name: '064 1234 567' })).toBeInTheDocument()
    expect(luka.getByText('Gimnazija, 3 razred')).toBeInTheDocument()
    expect(luka.getByText('Centar')).toBeInTheDocument()
    expect(luka.getByText('Slab iz matematike')).toBeInTheDocument()
    expect(luka.getByText('Ana Nikolić')).toBeInTheDocument()
    expect(card('Mina Ilić').getByText('Ana Nikolić, Marko Jovanović')).toBeInTheDocument()
    expect(card('Petar Petrović').getByText('Još nema')).toBeInTheDocument()
  })

  it('says whether a parent or the student wrote, and where a student came from', async () => {
    await open()
    expect(card('Vuk Vasić').getByText(/Roditelj/)).toBeInTheDocument()
    expect(card('Jovan Jović').getByText(/ostao bez nastavnika/)).toBeInTheDocument()
    expect(card('Luka Lukić').getByText(/Matematika · Učenik/)).toBeInTheDocument()
  })

  it('has a view for each state, with how many there are', async () => {
    await open()
    const view = screen.getByLabelText('Prikaz')
    const options = within(view)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(options).toContain('Čeka odobrenje (1)')
    await userEvent.selectOptions(view, 'Nastavnik je dodeljen (1)')
    expect(names()).toEqual(['Sara Savić'])
    await userEvent.selectOptions(view, 'Odbijeno (1)')
    expect(names()).toEqual(['Zoran Zorić'])
    await userEvent.selectOptions(view, 'Sve')
    expect(names()).toHaveLength(9)
  })

  it('says so when a view is empty', async () => {
    await open({ all: [] })
    expect(await screen.findByText('Nema prijava u ovom prikazu.')).toBeInTheDocument()
  })

  it('offers no action on a request that is over', async () => {
    await open()
    await userEvent.selectOptions(screen.getByLabelText('Prikaz'), 'Sve')
    expect(card('Sara Savić').queryByRole('button')).not.toBeInTheDocument()
    expect(card('Zoran Zorić').queryByRole('button')).not.toBeInTheDocument()
  })
})

describe('approving and rejecting', () => {
  it('approves a sign-up past the daily cap, which is the only one that asks for it', async () => {
    const { enrolmentApi } = await open()
    expect(card('Luka Lukić').queryByRole('button', { name: /^Odobri/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Odobri: Petar Petrović' }))
    expect(enrolmentApi.approve).toHaveBeenCalledWith('r-wait')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Prijava je odobrena: nastavnici je sada vide.',
    )
    expect(
      card('Petar Petrović').queryByRole('button', { name: /^Odobri/ }),
    ).not.toBeInTheDocument()
    expect(card('Petar Petrović').getByRole('list', { name: 'Stanje' })).toHaveTextContent(
      'Čeka nastavnika',
    )
  })

  it('rejects a sign-up', async () => {
    const { enrolmentApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Odbij: Luka Lukić' }))
    expect(enrolmentApi.reject).toHaveBeenCalledWith('r-open')
    expect(await screen.findByRole('status')).toHaveTextContent('Prijava je odbijena.')
    expect(names()).not.toContain('Luka Lukić')
  })

  it('does not offer to reject a student a teacher added, or one who was left behind', async () => {
    await open()
    expect(card('Jovan Jović').queryByRole('button', { name: /^Odbij/ })).not.toBeInTheDocument()
    expect(card('Jovan Jović').getByRole('button', { name: /^Dodeli/ })).toBeInTheDocument()
  })

  it('explains it when the request was handled meanwhile', async () => {
    const { enrolmentApi } = await open()
    enrolmentApi.approve.mockRejectedValueOnce(new AdminError('PT404', 'request not found'))
    await userEvent.click(screen.getByRole('button', { name: 'Odobri: Petar Petrović' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prijava više ne postoji ili je već obrađena.',
    )
    enrolmentApi.reject.mockRejectedValueOnce(new AdminError('PT404', 'request not found'))
    await userEvent.click(screen.getByRole('button', { name: 'Odbij: Luka Lukić' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('učenik već ima svoj zapis')
  })
})

describe('assigning a teacher', () => {
  const dialog = async () =>
    within(await screen.findByRole('dialog', { name: 'Dodela nastavnika' }))

  it('puts the teachers who offered first, and tells them apart', async () => {
    await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodeli nastavnika: Luka Lukić' }))
    const form = await dialog()
    const options = within(form.getByLabelText('Nastavnik'))
      .getAllByRole('option')
      .map((o) => o.textContent)
    // the teachers of the fake school: Ana (offered), then the others by name; a deactivated one is not there
    expect(options[0]).toBe('Izaberi nastavnika')
    expect(options[1]).toBe('Ana Nikolić (ponudio)')
    expect(options.slice(2).every((text) => !text?.includes('ponudio'))).toBe(true)
    expect(options.join(' ')).not.toContain('Petar Marić')
  })

  it('assigns at once, also a teacher who did not offer, and says who is the teacher now', async () => {
    const { enrolmentApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodeli nastavnika: Luka Lukić' }))
    const form = await dialog()
    await userEvent.selectOptions(form.getByLabelText('Nastavnik'), 'Ana Nikolić (ponudio)')
    await userEvent.click(form.getByRole('button', { name: 'Dodeli' }))
    expect(enrolmentApi.assign).toHaveBeenCalledWith('r-open', 't-ana', null)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Ana Nikolić je dodeljen: Luka Lukić je njegov učenik.',
    )
    expect(names()).not.toContain('Luka Lukić')
  })

  it('needs a teacher to be chosen', async () => {
    const { enrolmentApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodeli nastavnika: Luka Lukić' }))
    const form = await dialog()
    await userEvent.click(form.getByRole('button', { name: 'Dodeli' }))
    expect(form.getByRole('alert')).toHaveTextContent('Izaberite nastavnika.')
    expect(enrolmentApi.assign).not.toHaveBeenCalled()
  })

  it("asks a parent's request for the email of the child, which may wait for the teacher", async () => {
    const { enrolmentApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodeli nastavnika: Vuk Vasić' }))
    let form = await dialog()
    await userEvent.selectOptions(
      form.getByLabelText('Nastavnik'),
      form.getByRole('option', { name: /Ana/ }),
    )
    await userEvent.click(form.getByRole('button', { name: 'Dodeli' }))
    expect(enrolmentApi.assign).toHaveBeenCalledWith('r-parent', 't-ana', null)
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Treba da upiše email adresu deteta.',
    )

    // with the email of the child the student is made at once
    await userEvent.click(screen.getByRole('button', { name: 'Dodeli nastavnika: Mina Ilić' }))
    form = await dialog()
    expect(form.queryByLabelText('Email adresa deteta (nije obavezno)')).not.toBeInTheDocument()
  })

  it('sends the email of the child when the administrator knows it', async () => {
    const { enrolmentApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Dodeli nastavnika: Vuk Vasić' }))
    const form = await dialog()
    await userEvent.selectOptions(
      form.getByLabelText('Nastavnik'),
      form.getByRole('option', { name: /Ana/ }),
    )
    await userEvent.type(
      form.getByLabelText('Email adresa deteta (nije obavezno)'),
      ' Vuk@Example.test ',
    )
    await userEvent.click(form.getByRole('button', { name: 'Dodeli' }))
    expect(enrolmentApi.assign).toHaveBeenCalledWith('r-parent', 't-ana', 'vuk@example.test')
  })

  it('explains what the database refuses and keeps the dialog', async () => {
    const { enrolmentApi } = await open()
    enrolmentApi.assign.mockRejectedValueOnce(
      new AdminError('PT409', 'the student already has a teacher'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Dodeli nastavnika: Luka Lukić' }))
    const form = await dialog()
    await userEvent.selectOptions(
      form.getByLabelText('Nastavnik'),
      form.getByRole('option', { name: /Ana/ }),
    )
    await userEvent.click(form.getByRole('button', { name: 'Dodeli' }))
    expect(await form.findByRole('alert')).toHaveTextContent('Učenik već ima nastavnika.')
  })
})

describe('the settings', () => {
  const panel = async () => within(await screen.findByRole('form', { name: 'Podešavanja prijave' }))

  it('shows how things are set, and what a switched-off form means', async () => {
    await open({
      settings: { formEnabled: false, dailyCap: 7 },
    })
    const form = await panel()
    expect(form.getByRole('checkbox')).not.toBeChecked()
    expect(form.getByText(/početna strana prikazuje samo broj telefona/)).toBeInTheDocument()
    expect(form.getByLabelText(/^Prijava u jednom danu/)).toHaveValue(7)
  })

  it('switches the form on and saves the numbers', async () => {
    const { enrolmentApi } = await open({
      settings: { formEnabled: false, dailyCap: 10 },
    })
    const form = await panel()
    await userEvent.click(form.getByRole('checkbox'))
    const cap = form.getByLabelText(/^Prijava u jednom danu/)
    await userEvent.clear(cap)
    await userEvent.type(cap, '25')
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj podešavanja' }))
    expect(enrolmentApi.saveSettings).toHaveBeenCalledWith({
      formEnabled: true,
      dailyCap: 25,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Podešavanja su sačuvana.')
    expect(enrolmentApi.state.settings.formEnabled).toBe(true)
  })

  it.each([
    ['0', 'a number below the limit'],
    ['1001', 'a number above the limit'],
    ['2.5', 'a number that is not whole'],
    ['', 'nothing'],
  ])('does not send %s (%s)', async (value) => {
    const { enrolmentApi } = await open()
    const form = await panel()
    const cap = form.getByLabelText(/^Prijava u jednom danu/)
    await userEvent.clear(cap)
    if (value) await userEvent.type(cap, value)
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj podešavanja' }))
    expect(await form.findByRole('alert')).toHaveTextContent(
      'Brojevi moraju biti celi i u dozvoljenim granicama.',
    )
    expect(enrolmentApi.saveSettings).not.toHaveBeenCalled()
  })

  it('explains it when the database refuses', async () => {
    const { enrolmentApi } = await open()
    enrolmentApi.saveSettings.mockRejectedValueOnce(new AdminError('PT400', 'invalid settings'))
    const form = await panel()
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj podešavanja' }))
    expect(await form.findByRole('alert')).toHaveTextContent(
      'Neka vrednost je van dozvoljenih granica.',
    )
  })

  it('says that nobody sees a message when the cap is reached', async () => {
    await open()
    const form = await panel()
    expect(form.getByText(/niko ne dobija poruku da su prijave zatvorene/)).toBeInTheDocument()
  })
})
