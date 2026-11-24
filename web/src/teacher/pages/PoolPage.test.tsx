import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import {
  createFakeEnrolmentApi,
  makePoolRow,
  type FakeEnrolmentState,
} from '../../test/fakeEnrolmentApi'
import { createFakeTeacherApi } from '../../test/fakeTeacherApi'
import { page, renderTeacher } from '../../test/renderTeacher'
import type { MyCv } from '../teacherApi'
import { waitingText } from '../waiting'

const PATH = '/moj-raspored/neraspodeljeni'

const CV: MyCv = {
  slug: 'petar-petrovic',
  about: 'Predajem matematiku.',
  showPublic: false,
  showMembers: false,
  experience: [],
  education: [],
  skills: [],
  photoPath: null,
}

const POOL = [
  makePoolRow({
    requestId: 'req-luka',
    firstName: 'Luka',
    lastName: 'Lukić',
    email: 'luka@example.test',
    phone: '+381641234567',
    school: 'Gimnazija',
    grade: '3',
    cityPart: 'Centar',
    situation: 'Slab iz matematike',
    daysWaiting: 0,
  }),
  makePoolRow({
    requestId: 'req-mina',
    role: 'parent',
    subjectId: 'sub-fiz',
    subjectName: 'Fizika',
    firstName: 'Mina',
    lastName: 'Ilić',
    email: 'majka@example.test',
    phone: '+381651112222',
    school: 'OŠ Vuk Karadžić',
    grade: '7',
    daysWaiting: 21,
  }),
  makePoolRow({
    requestId: 'req-old',
    source: 'legacy',
    firstName: 'Neda',
    lastName: 'Marković',
    daysWaiting: 5,
  }),
]

const open = async (
  state: Partial<FakeEnrolmentState> = {},
  teacher = createFakeTeacherApi({ cv: CV }),
) => {
  const enrolmentApi = createFakeEnrolmentApi({ pool: POOL, ...state })
  const view = renderTeacher(PATH, { api: teacher, enrolmentApi })
  await page('Neraspoređeni učenici')
  // the list is read after the page is up
  if (enrolmentApi.state.pool.length > 0) await screen.findAllByRole('article')
  return { ...view, enrolmentApi }
}
const card = (name: string) => within(screen.getByRole('article', { name }))

describe('waitingText', () => {
  it.each([
    [0, 'od danas'],
    [1, '1 dan'],
    [2, '2 dana'],
    [5, '5 dana'],
    [11, '11 dana'],
    [21, '21 dan'],
    [22, '22 dana'],
    [111, '111 dana'],
  ])('%i days', (days, text) => {
    expect(waitingText(days)).toBe(text)
  })
})

describe('the students who look for a teacher', () => {
  it('shows everything a teacher needs to call them, in the order the database gave', async () => {
    await open()
    const articles = await screen.findAllByRole('article')
    expect(articles.map((a) => a.getAttribute('aria-label'))).toEqual([
      'Luka Lukić',
      'Mina Ilić',
      'Neda Marković',
    ])

    const luka = card('Luka Lukić')
    expect(luka.getByText(/Matematika · Učenik · čeka od danas/)).toBeInTheDocument()
    expect(luka.getByRole('link', { name: '064 1234 567' })).toHaveAttribute(
      'href',
      'tel:+381641234567',
    )
    expect(luka.getByRole('link', { name: 'luka@example.test' })).toHaveAttribute(
      'href',
      'mailto:luka@example.test',
    )
    expect(luka.getByText('Gimnazija, 3 razred')).toBeInTheDocument()
    expect(luka.getByText('Centar')).toBeInTheDocument()
    expect(luka.getByText('Slab iz matematike')).toBeInTheDocument()
  })

  it('says whether a parent or the student wrote, and for how long they wait', async () => {
    await open()
    expect(card('Mina Ilić').getByText(/Fizika · Roditelj · čeka 21 dan/)).toBeInTheDocument()
    expect(card('Mina Ilić').queryByText('Deo grada')).not.toBeInTheDocument()
  })

  it('says where a student who is not a sign-up came from', async () => {
    await open()
    expect(card('Neda Marković').getByText(/Ostao bez nastavnika/)).toBeInTheDocument()
    expect(card('Luka Lukić').queryByText(/Ostao bez nastavnika|Dodao nastavnik/)).toBeNull()
  })

  it('says so when nobody looks for a teacher', async () => {
    await open({ pool: [] })
    expect(
      await screen.findByText('Trenutno nema učenika koji traže nastavnika.'),
    ).toBeInTheDocument()
  })

  it('does not let a teacher take a student: the only way is to offer', async () => {
    await open()
    expect(screen.queryByRole('button', { name: /Uzmi|Preuzmi|Zatraži/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Ponudi se:/ })).toHaveLength(3)
  })
})

describe('offering', () => {
  it('offers with one click, and the button turns into a way to withdraw', async () => {
    const { enrolmentApi } = await open()
    await userEvent.click(screen.getByRole('button', { name: 'Ponudi se: Luka Lukić' }))
    expect(enrolmentApi.offer).toHaveBeenCalledWith('req-luka')
    expect(await card('Luka Lukić').findByText('Ponudili ste se.')).toBeInTheDocument()
    // the card says it; there is no message above the list
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    // the others stay open for an offer
    expect(screen.getByRole('button', { name: 'Ponudi se: Mina Ilić' })).toBeEnabled()

    await userEvent.click(screen.getByRole('button', { name: 'Povuci ponudu: Luka Lukić' }))
    expect(enrolmentApi.withdrawOffer).toHaveBeenCalledWith('req-luka')
    expect(await screen.findByRole('button', { name: 'Ponudi se: Luka Lukić' })).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('wants the text of the CV first, and says where to write it', async () => {
    const { enrolmentApi } = await open({}, createFakeTeacherApi({ cv: { ...CV, about: '  ' } }))
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent('napišite opis u svom CV-u')
    expect(within(note).getByRole('link', { name: 'Otvori Moj CV' })).toHaveAttribute(
      'href',
      '/moj-raspored/moj-cv',
    )
    for (const button of screen.getAllByRole('button', { name: /^Ponudi se:/ })) {
      expect(button).toBeDisabled()
    }
    expect(enrolmentApi.offer).not.toHaveBeenCalled()
  })

  it('wants the CV also when there is none at all', async () => {
    await open({}, createFakeTeacherApi())
    expect(await screen.findByRole('note')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ponudi se: Luka Lukić' })).toBeDisabled()
  })

  it('does not nag a teacher who has written it', async () => {
    await open()
    await screen.findByRole('article', { name: 'Luka Lukić' })
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('explains it when the database refuses the offer anyway, and shows the list as it is', async () => {
    const { enrolmentApi } = await open({ teacherHasCv: false })
    await userEvent.click(screen.getByRole('button', { name: 'Ponudi se: Luka Lukić' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Prvo napišite opis u svom CV-u (odeljak „O meni“)',
    )
    expect(enrolmentApi.state.pool[0]?.offered).toBe(false)
  })

  it('explains it when the request is gone', async () => {
    const { enrolmentApi } = await open()
    enrolmentApi.offer.mockRejectedValueOnce(new AdminError('PT404', 'request not found'))
    await userEvent.click(screen.getByRole('button', { name: 'Ponudi se: Mina Ilić' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Prijava više nije dostupna.')
  })

  it('explains it when a teacher was chosen before the offer could be withdrawn', async () => {
    const { enrolmentApi } = await open({
      pool: [
        makePoolRow({ requestId: 'req-luka', firstName: 'Luka', lastName: 'Lukić', offered: true }),
      ],
    })
    enrolmentApi.withdrawOffer.mockRejectedValueOnce(
      new AdminError('PT409', 'a teacher was already chosen'),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Povuci ponudu: Luka Lukić' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nastavnik je već izabran.')
  })

  it('cannot be sent twice', async () => {
    const { enrolmentApi } = await open()
    const button = screen.getByRole('button', { name: 'Ponudi se: Luka Lukić' })
    await userEvent.dblClick(button)
    expect(enrolmentApi.offer).toHaveBeenCalledTimes(1)
  })
})

describe('parents who chose this teacher', () => {
  const chosen = {
    requestId: 'req-mina',
    subjectName: 'Fizika',
    firstName: 'Mina',
    lastName: 'Ilić',
    email: 'majka@example.test',
    phone: '+381651112222',
    school: 'OŠ Vuk Karadžić',
    grade: '7',
    chosenAt: '2026-11-14T10:00:00Z',
  }

  it('are listed with how to reach them, until the email of the child is given', async () => {
    await open({ chosen: [chosen] })
    const section = within(
      await screen.findByRole('region', { name: 'Čekaju email adresu deteta' }),
    )
    expect(section.getByText('Mina Ilić')).toBeInTheDocument()
    expect(section.getByRole('link', { name: '065 1112 222' })).toBeInTheDocument()
    expect(section.getByText(/majka@example\.test/)).toBeInTheDocument()
  })

  it('are not mentioned when there are none', async () => {
    await open()
    await screen.findByRole('article', { name: 'Luka Lukić' })
    expect(screen.queryByText('Čekaju email adresu deteta')).not.toBeInTheDocument()
  })

  it("complete the enrolment with the child's email", async () => {
    const { enrolmentApi } = await open({ chosen: [chosen] })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Upiši email deteta: Mina Ilić' }),
    )
    const form = within(await screen.findByRole('dialog', { name: 'Email adresa deteta' }))
    await userEvent.type(
      form.getByLabelText('Email adresa deteta (Google nalog)'),
      '  Mina.Ilic@Example.test ',
    )
    await userEvent.click(form.getByRole('button', { name: 'Završi upis' }))
    expect(enrolmentApi.completeChosen).toHaveBeenCalledWith('req-mina', 'mina.ilic@example.test')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Mina Ilić je među vašim učenicima.',
    )
    expect(screen.queryByText('Čekaju email adresu deteta')).not.toBeInTheDocument()
  })

  it('asks for the email, and explains what the database refuses', async () => {
    const { enrolmentApi } = await open({ chosen: [chosen] })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Upiši email deteta: Mina Ilić' }),
    )
    const form = within(await screen.findByRole('dialog', { name: 'Email adresa deteta' }))
    await userEvent.click(form.getByRole('button', { name: 'Završi upis' }))
    expect(form.getByRole('alert')).toHaveTextContent('Upišite email adresu deteta.')
    expect(enrolmentApi.completeChosen).not.toHaveBeenCalled()

    enrolmentApi.completeChosen.mockRejectedValueOnce(
      new AdminError('PT400', 'the child needs an email of their own'),
    )
    await userEvent.type(
      form.getByLabelText('Email adresa deteta (Google nalog)'),
      'majka@example.test',
    )
    await userEvent.click(form.getByRole('button', { name: 'Završi upis' }))
    expect(await form.findByRole('alert')).toHaveTextContent(
      'Dete mora da ima svoju email adresu, različitu od roditeljeve.',
    )
  })
})

describe('the menu', () => {
  it('has the link to the students, with how many look for a teacher', async () => {
    renderTeacher('/moj-raspored/ucenici', {
      enrolmentApi: createFakeEnrolmentApi({ pool: POOL }),
    })
    await page('Učenici')
    expect(await screen.findByRole('link', { name: 'Neraspoređeni učenici (3)' })).toHaveAttribute(
      'href',
      '/moj-raspored/neraspodeljeni',
    )
  })

  it('has no number when nobody looks for a teacher', async () => {
    renderTeacher('/moj-raspored/ucenici')
    await page('Učenici')
    expect(await screen.findByRole('link', { name: 'Neraspoređeni učenici' })).toBeInTheDocument()
  })
})
