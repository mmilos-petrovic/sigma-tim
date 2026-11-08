import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import {
  at,
  createFakeStudentApi,
  JANA,
  MARKO,
  seedStudent,
  slotOf,
} from '../../test/fakeStudentApi'
import { inDialog, page, renderStudent } from '../../test/renderStudent'
import { formatDay, formatRange } from '../../teacher/format'

const SLOTS = '/ucenik/termini'

afterEach(() => window.localStorage.clear())

const book = (start: number, end: number) =>
  screen.findByRole('button', {
    name: new RegExp(`Zauzmi.*${formatDay(at(start))}.*${formatRange(at(start), at(end))}`),
  })

/** The booking button of a slot if it is on screen now. */
const slotButton = (start: number, end: number) =>
  screen.queryByRole('button', {
    name: new RegExp(`Zauzmi.*${formatDay(at(start))}.*${formatRange(at(start), at(end))}`),
  })

describe('the free slots', () => {
  it('are a second tab with the number of slots, for the student’s own teacher only', async () => {
    renderStudent('/ucenik')
    const tab = await screen.findByRole('link', { name: /^Slobodni termini/ })
    expect(tab).toHaveAttribute('href', SLOTS)
    // sl-1 and sl-2; the slot of another teacher is not counted
    await waitFor(() => expect(tab).toHaveTextContent('2'))
    expect(screen.getByRole('link', { name: 'Časovi' })).toHaveAttribute('href', '/ucenik')
  })

  it('are listed by day, the first free slot first', async () => {
    const state = seedStudent()
    state.slots = [
      slotOf({ id: 'later', start: at(73), end: at(74) }),
      slotOf({ id: 'first', start: at(49), end: at(50) }),
      slotOf({ id: 'same-day', start: at(51), end: at(52) }),
    ]
    renderStudent(SLOTS, { api: createFakeStudentApi(state) })
    await page('Moji časovi')
    const days = await screen.findAllByRole('heading', { level: 2 })
    expect(days.map((h) => h.textContent)).toEqual([formatDay(at(49)), formatDay(at(73))])
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent(formatRange(at(49), at(50)))
    expect(items[1]).toHaveTextContent(formatRange(at(51), at(52)))
    expect(items[2]).toHaveTextContent(formatRange(at(73), at(74)))
  })

  it('show time, subject, place, room and length', async () => {
    renderStudent(SLOTS)
    const item = (await screen.findAllByRole('listitem'))[1]
    expect(item).toHaveTextContent(formatRange(at(72), at(73)))
    expect(item).toHaveTextContent('Fizika')
    expect(item).toHaveTextContent('Centar')
    expect(item).toHaveTextContent('Učionica 2')
    expect(item).toHaveTextContent('60 min')
  })

  it('say when there are none', async () => {
    renderStudent(SLOTS, { api: createFakeStudentApi({ slots: [] }) })
    expect(
      await screen.findByText('Nastavnik trenutno nema slobodnih termina.'),
    ).toBeInTheDocument()
  })

  it('are not there for a student without a teacher, who is sent back to the lessons', async () => {
    const api = createFakeStudentApi({
      records: [{ id: 'st-x', name: 'Sava Test', teacherId: null, teacherName: null }],
      lessons: [],
    })
    renderStudent(SLOTS, { api })
    await screen.findByText('Nema zakazanih časova.')
    expect(screen.queryByRole('link', { name: /Slobodni termini/ })).not.toBeInTheDocument()
    expect(api.calls.listSlots).not.toHaveBeenCalled()
  })

  it('explain a failure and offer another try', async () => {
    const api = createFakeStudentApi()
    api.failNext('listSlots', new AdminError('network'))
    renderStudent(SLOTS, { api })
    expect(await screen.findByText(/Nema veze sa serverom/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await book(48, 49)).toBeInTheDocument()
  })
})

describe('booking a slot', () => {
  it('asks first, then books it at once when it is more than 12 hours away', async () => {
    const api = createFakeStudentApi()
    renderStudent(SLOTS, { api })
    await userEvent.click(await book(48, 49))
    const dlg = await inDialog('Zauzmi termin')
    expect(dlg.getByText(/Matematika/)).toBeInTheDocument()
    expect(dlg.queryByText(/manje od 12 sati/)).not.toBeInTheDocument()
    await userEvent.click(dlg.getByRole('button', { name: 'Zauzmi termin' }))

    expect(api.calls.claimSlot).toHaveBeenCalledWith('sl-1', 'st-marko')
    expect(
      await screen.findByText('Termin je zauzet. Vidite ga u spisku časova.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // the slot is no longer free, and the tab count follows
    expect(slotButton(48, 49)).toBeNull()
    await waitFor(() =>
      expect(screen.getByRole('link', { name: /^Slobodni termini/ })).toHaveTextContent('1'),
    )
  })

  it('makes the booked slot a lesson with the state “Potvrđen”', async () => {
    renderStudent(SLOTS)
    await userEvent.click(await book(48, 49))
    await userEvent.click(
      (await inDialog('Zauzmi termin')).getByRole('button', { name: 'Zauzmi termin' }),
    )
    await screen.findByText('Termin je zauzet. Vidite ga u spisku časova.')
    await userEvent.click(screen.getByRole('link', { name: 'Časovi' }))
    const list = await screen.findByRole('list', { name: 'Predstojeći časovi' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(3)
  })

  it('warns about a late booking before it is made, with the teacher’s number', async () => {
    const state = seedStudent()
    state.slots = [slotOf({ id: 'soon', start: at(5), end: at(6) })]
    const api = createFakeStudentApi(state)
    renderStudent(SLOTS, { api })
    await userEvent.click(await book(5, 6))
    const dlg = await inDialog('Zauzmi termin')
    expect(
      dlg.getByText(/Termin počinje za manje od 12 sati. Nastavnik mora da ga potvrdi./),
    ).toBeInTheDocument()
    expect(await dlg.findByRole('link', { name: '+381641110000' })).toHaveAttribute(
      'href',
      'tel:+381641110000',
    )
  })

  it('tells afterwards that the teacher still has to confirm, with the number to call', async () => {
    const state = seedStudent()
    state.slots = [slotOf({ id: 'soon', start: at(5), end: at(6) })]
    renderStudent(SLOTS, { api: createFakeStudentApi(state) })
    await userEvent.click(await book(5, 6))
    await userEvent.click(
      (await inDialog('Zauzmi termin')).getByRole('button', { name: 'Zauzmi termin' }),
    )
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Zahtev je poslat. Nastavnik mora da potvrdi termin.')
    expect(notice).toHaveTextContent('Pozovite nastavnika:')
    expect(within(notice).getByRole('link', { name: '+381641110000' })).toBeInTheDocument()
  })

  it('leaves the number out of the late-booking messages when the teacher has none', async () => {
    const state = seedStudent()
    state.slots = [slotOf({ id: 'soon', start: at(5), end: at(6) })]
    state.phones = {}
    renderStudent(SLOTS, { api: createFakeStudentApi(state) })
    await userEvent.click(await book(5, 6))
    const dlg = await inDialog('Zauzmi termin')
    expect(dlg.getByText(/Nastavnik mora da ga potvrdi/)).toBeInTheDocument()
    expect(dlg.queryByText(/Pozovite nastavnika/)).not.toBeInTheDocument()
    await userEvent.click(dlg.getByRole('button', { name: 'Zauzmi termin' }))
    const notice = await screen.findByRole('status')
    expect(notice).toHaveTextContent('Zahtev je poslat.')
    expect(notice).not.toHaveTextContent('Pozovite nastavnika')
  })

  it('treats exactly 12 hours as not late', async () => {
    const state = seedStudent()
    state.slots = [slotOf({ id: 'edge', start: at(12), end: at(13) })]
    renderStudent(SLOTS, { api: createFakeStudentApi(state) })
    await userEvent.click(await book(12, 13))
    expect(
      (await inDialog('Zauzmi termin')).queryByText(/manje od 12 sati/),
    ).not.toBeInTheDocument()
  })

  it('changes nothing when the person backs out', async () => {
    const api = createFakeStudentApi()
    renderStudent(SLOTS, { api })
    await userEvent.click(await book(48, 49))
    await userEvent.click(
      (await inDialog('Zauzmi termin')).getByRole('button', { name: 'Odustani' }),
    )
    expect(api.calls.claimSlot).not.toHaveBeenCalled()
  })

  it('does not book twice on a double click', async () => {
    const api = createFakeStudentApi()
    renderStudent(SLOTS, { api })
    await userEvent.click(await book(48, 49))
    const submit = (await inDialog('Zauzmi termin')).getByRole('button', { name: 'Zauzmi termin' })
    await userEvent.dblClick(submit)
    await screen.findByText('Termin je zauzet. Vidite ga u spisku časova.')
    expect(api.calls.claimSlot).toHaveBeenCalledTimes(1)
  })

  it('says so when somebody else was faster, and takes the slot off the list', async () => {
    const api = createFakeStudentApi()
    renderStudent(SLOTS, { api })
    await userEvent.click(await book(48, 49))
    api.state.takenElsewhere.add('sl-1')
    await userEvent.click(
      (await inDialog('Zauzmi termin')).getByRole('button', { name: 'Zauzmi termin' }),
    )
    expect(await screen.findByText('Termin je upravo zauzet. Izaberite drugi.')).toBeInTheDocument()
    await userEvent.click(
      (await inDialog('Zauzmi termin')).getByRole('button', { name: 'Odustani' }),
    )
    await waitFor(() => expect(slotButton(48, 49)).toBeNull())
    // the other slot is still there
    expect(await book(72, 73)).toBeInTheDocument()
  })

  it('says so when the teacher removed the slot', async () => {
    const api = createFakeStudentApi()
    renderStudent(SLOTS, { api })
    await userEvent.click(await book(48, 49))
    api.state.slots = api.state.slots.filter((s) => s.id !== 'sl-1')
    await userEvent.click(
      (await inDialog('Zauzmi termin')).getByRole('button', { name: 'Zauzmi termin' }),
    )
    expect(await screen.findByText('Termin više ne postoji. Izaberite drugi.')).toBeInTheDocument()
  })

  it('says so when the slot has started in the meantime', async () => {
    const api = createFakeStudentApi()
    renderStudent(SLOTS, { api })
    await userEvent.click(await book(48, 49))
    api.failNext('claimSlot', new AdminError('PT409', 'lesson already started'))
    await userEvent.click(
      (await inDialog('Zauzmi termin')).getByRole('button', { name: 'Zauzmi termin' }),
    )
    expect(await screen.findByText('Termin je već počeo. Izaberite drugi.')).toBeInTheDocument()
  })

  it('explains a connection failure and keeps the dialog open for another try', async () => {
    const api = createFakeStudentApi()
    renderStudent(SLOTS, { api })
    await userEvent.click(await book(48, 49))
    api.failNext('claimSlot', new AdminError('network'))
    const dlg = await inDialog('Zauzmi termin')
    await userEvent.click(dlg.getByRole('button', { name: 'Zauzmi termin' }))
    expect(await screen.findByText(/Nema veze sa serverom/)).toBeInTheDocument()
    await userEvent.click(
      (await inDialog('Zauzmi termin')).getByRole('button', { name: 'Zauzmi termin' }),
    )
    expect(
      await screen.findByText('Termin je zauzet. Vidite ga u spisku časova.'),
    ).toBeInTheDocument()
  })
})

describe('a parent', () => {
  const twoChildren = () => {
    const state = seedStudent()
    state.records = [MARKO, JANA]
    state.slots = [
      slotOf({ id: 'ana-slot', teacherId: 't-ana', start: at(48), end: at(49) }),
      slotOf({
        id: 'petar-slot',
        teacherId: 't-petar',
        start: at(50),
        end: at(51),
        subject: 'Hemija',
      }),
    ]
    state.phones = { 't-ana': '+381641110000', 't-petar': '+381642220000' }
    return createFakeStudentApi(state)
  }

  it('books for the child they are looking at', async () => {
    const api = twoChildren()
    renderStudent('/roditelj/termini', { api })
    await userEvent.selectOptions(await screen.findByLabelText('Dete'), 'st-marko')
    await userEvent.click(await book(48, 49))
    const dlg = await inDialog('Zauzmi termin')
    expect(dlg.getByText(/Marko Marković/)).toBeInTheDocument()
    await userEvent.click(dlg.getByRole('button', { name: 'Zauzmi termin' }))
    expect(api.calls.claimSlot).toHaveBeenCalledWith('ana-slot', 'st-marko')
  })

  it('sees the free slots of the other child’s teacher after choosing that child', async () => {
    const api = twoChildren()
    renderStudent('/roditelj/termini', { api })
    await screen.findByRole('button', { name: /Zauzmi.*/ })
    await userEvent.selectOptions(screen.getByLabelText('Dete'), 'st-jana')
    const button = await book(50, 51)
    await userEvent.click(button)
    const dlg = await inDialog('Zauzmi termin')
    expect(dlg.getByText(/Jana Marković/)).toBeInTheDocument()
    expect(dlg.getByText(/Hemija/)).toBeInTheDocument()
    await userEvent.click(dlg.getByRole('button', { name: 'Zauzmi termin' }))
    expect(api.calls.claimSlot).toHaveBeenCalledWith('petar-slot', 'st-jana')
  })
})
