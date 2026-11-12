import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { createFakeTeacherApi, seedTeacher } from '../../test/fakeTeacherApi'
import { calendar, TEST_WEEK } from '../../test/mockCalendar'
import { setDate, setTime, timeOf } from '../../test/dateTime'
import { inDialog, page, renderTeacher } from '../../test/renderTeacher'
import type { StudentRow } from '../teacherApi'

vi.mock('../calendar/WeekCalendar', async () => import('../../test/mockCalendar'))

const PATH = '/moj-raspored'
const block = (name: string | RegExp) => screen.findByRole('button', { name })

/** Opens the "Novi čas" form from the toolbar. */
async function openNewLesson() {
  await page('Moj raspored')
  await userEvent.click(await screen.findByRole('button', { name: 'Novi čas' }))
  return inDialog('Novi čas')
}

describe('the two actions of the page', () => {
  it('are plus signs on the right of the title, with the words only as names', async () => {
    renderTeacher(PATH)
    await page('Moj raspored')
    for (const name of ['Novi čas', 'Objavi slobodan termin']) {
      const button = await screen.findByRole('button', { name })
      expect(button).toHaveTextContent('')
      expect(button).toHaveAttribute('title', name)
      expect(button.querySelector('svg')).not.toBeNull()
      // in the row of the title, which is the first thing in the page header
      expect(button.closest('.page-header')).toContainElement(
        screen.getByRole('heading', { name: 'Moj raspored', level: 1 }),
      )
      expect(button.closest('.page-header__actions')).not.toBeNull()
    }
  })

  it('fill the round button of a lesson with the colour of the teacher, with a white plus, and leave the one of a slot plain', async () => {
    const state = seedTeacher()
    state.reference.color = 'purple'
    renderTeacher(PATH, { api: createFakeTeacherApi(state) })
    await page('Moj raspored')
    const lesson = await screen.findByRole('button', { name: 'Novi čas' })
    expect(lesson).toHaveStyle({ backgroundColor: '#6b3fa0', color: '#ffffff' })
    const slot = screen.getByRole('button', { name: 'Objavi slobodan termin' })
    expect(slot).not.toHaveAttribute('style')
    // both are round
    expect(lesson).toHaveClass('icon-button--round')
    expect(slot).toHaveClass('icon-button--round')
  })

  it('fill the button of a lesson with the blue of the lessons until a colour is chosen', async () => {
    renderTeacher(PATH)
    await page('Moj raspored')
    expect(await screen.findByRole('button', { name: 'Novi čas' })).toHaveStyle({
      backgroundColor: '#1f4fd8',
    })
  })

  it('open the forms', async () => {
    renderTeacher(PATH)
    await page('Moj raspored')
    await userEvent.click(await screen.findByRole('button', { name: 'Novi čas' }))
    await inDialog('Novi čas')
    await userEvent.click(screen.getByRole('button', { name: 'Odustani' }))
    await userEvent.click(screen.getByRole('button', { name: 'Objavi slobodan termin' }))
    await inDialog('Novi slobodan termin')
  })

  it('tell who sees a free slot, in few words', async () => {
    renderTeacher(PATH)
    await page('Moj raspored')
    await userEvent.click(await screen.findByRole('button', { name: 'Objavi slobodan termin' }))
    const form = await inDialog('Novi slobodan termin')
    expect(form.getByText('Vide ga samo vaši učenici i njihovi roditelji.')).toBeInTheDocument()
    expect(form.queryByText(/mogu da ga zauzmu/)).not.toBeInTheDocument()
  })
})

describe('the reminder about a missing phone number', () => {
  it('asks a teacher who has no number to give one, and links to where', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi({ myPhone: null }) })
    await page('Moj raspored')
    const note = await screen.findByRole('note')
    expect(note).toHaveTextContent('Nemate upisan broj telefona.')
    expect(within(note).getByRole('link', { name: 'Podešavanja' })).toHaveAttribute(
      'href',
      '/moj-raspored/podesavanja',
    )
  })

  it('keeps a teacher without a number from scheduling or publishing anything until it is given', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi({ myPhone: null }) })
    await page('Moj raspored')
    expect(await screen.findByRole('note')).toHaveTextContent(
      'Dok ga ne upišete, ne možete da zakazujete časove ni da objavljujete termine.',
    )
    expect(screen.getByRole('button', { name: 'Novi čas' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Objavi slobodan termin' })).toBeDisabled()

    // a stretch selected on the calendar is no way round it
    act(() =>
      calendar().onCreate({ start: '2026-11-06T09:00:00+01:00', end: '2026-11-06T10:15:00+01:00' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('leaves the buttons on for a teacher who has a number', async () => {
    renderTeacher(PATH)
    await page('Moj raspored')
    await block('Ana Petrović, Luka Ilić – Učionica 1')
    expect(screen.getByRole('button', { name: 'Novi čas' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Objavi slobodan termin' })).toBeEnabled()
  })

  it('does not block a teacher whose number cannot be read', async () => {
    const api = createFakeTeacherApi()
    api.failNext('myPhone', new AdminError('network'))
    renderTeacher(PATH, { api })
    await block('Ana Petrović, Luka Ilić – Učionica 1')
    expect(screen.getByRole('button', { name: 'Novi čas' })).toBeEnabled()
  })

  it('is not there for a teacher who has one', async () => {
    renderTeacher(PATH)
    await page('Moj raspored')
    await block('Ana Petrović, Luka Ilić – Učionica 1')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('does not stop the schedule when the number cannot be read, and does not nag about it', async () => {
    const api = createFakeTeacherApi()
    api.failNext('myPhone', new AdminError('network'))
    renderTeacher(PATH, { api })
    expect(await block('Ana Petrović, Luka Ilić – Učionica 1')).toBeInTheDocument()
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })

  it('goes away once the number is given', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi({ myPhone: null }) })
    await userEvent.click(
      within(await screen.findByRole('note')).getByRole('link', { name: 'Podešavanja' }),
    )
    await page('Podešavanja')
    await userEvent.type(await screen.findByLabelText('Broj telefona'), '+381645550001')
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj broj' }))
    await screen.findByText('Broj telefona je sačuvan.')
    await userEvent.click(screen.getByRole('link', { name: 'Raspored' }))
    await page('Moj raspored')
    await block('Ana Petrović, Luka Ilić – Učionica 1')
    expect(screen.queryByRole('note')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novi čas' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Objavi slobodan termin' })).toBeEnabled()
  })
})

describe('the weekly schedule', () => {
  it('shows own lessons, slots and bookings, and colleagues as busy time', async () => {
    renderTeacher(PATH)
    await page('Moj raspored')

    expect(await block('Ana Petrović, Luka Ilić – Učionica 1')).toHaveAttribute(
      'data-variant',
      'own',
    )
    expect(await block('Ana Petrović – Učionica 2')).toBeInTheDocument()
    expect(await block('Slobodan termin')).toHaveAttribute('data-variant', 'slot')
    expect(await block('Na čekanju – Luka Ilić')).toHaveAttribute('data-variant', 'pending')
    expect(await block('Marko Jovanović – Učionica 1')).toHaveAttribute('data-variant', 'busy')
  })

  it('writes no subject and no "Zauzeto" on any block', async () => {
    renderTeacher(PATH)
    await block('Marko Jovanović – Učionica 1')
    const cards = within(screen.getByRole('region', { name: 'Kalendar' })).getAllByRole('button')
    expect(cards.length).toBeGreaterThan(4)
    for (const card of cards) {
      expect(card).not.toHaveTextContent(/Zauzeto|Matematika|Fizika|Hemija/)
    }
  })

  it('never shows what colleagues teach or to whom: only who is busy and where', async () => {
    renderTeacher(PATH)
    const busy = await block('Marko Jovanović – Učionica 1')
    expect(busy).toHaveTextContent('Marko Jovanović')
    expect(busy).not.toHaveTextContent(/Matematika|Fizika|Hemija/)
  })

  it('leaves out an expired free slot, and marks frozen lessons', async () => {
    renderTeacher(PATH)
    await block('Ana Petrović, Luka Ilić – Učionica 1')
    expect(screen.getAllByRole('button', { name: /^Slobodan termin/ })).toHaveLength(1)
    expect(await block(/^Ana Petrović$/)).toHaveAttribute('data-variant', 'own locked')
  })

  it('asks for the week that is on screen, for this teacher only', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await block(/^Ana Petrović, Luka Ilić/)
    expect(teacherApi.listLessons).toHaveBeenCalledWith(TEST_WEEK, 'p-teacher')
    expect(teacherApi.listBusy).toHaveBeenCalledWith(TEST_WEEK, 'p-teacher')
  })

  it('moves to another week when the calendar says so', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await block(/^Ana Petrović, Luka Ilić – Učionica 1/)
    const next = { start: '2026-11-08T23:00:00.000Z', end: '2026-11-15T23:00:00.000Z' }
    act(() => calendar().onRangeChange(next))
    await waitFor(() => expect(teacherApi.listLessons).toHaveBeenCalledWith(next, 'p-teacher'))
  })

  it('shows an error with a retry when the lessons cannot be loaded', async () => {
    const api = createFakeTeacherApi()
    api.failNext('reference', new AdminError('network'))
    renderTeacher(PATH, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom.')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await block(/^Ana Petrović, Luka Ilić – Učionica 1/)).toBeInTheDocument()
  })
})

describe('bookings that wait for an answer', () => {
  const entry = async () => within(await screen.findByRole('listitem', { name: /Luka Ilić/ }))

  it('lists them above the calendar with who, what and when', async () => {
    renderTeacher(PATH)
    expect(
      await screen.findByRole('heading', { name: 'Zahtevi na čekanju', level: 2 }),
    ).toBeVisible()
    const luka = await entry()
    expect(luka.getByText(/Luka Ilić/)).toBeInTheDocument()
    expect(luka.getByText(/Matematika/)).toBeInTheDocument()
    expect(luka.getByText(/čet, 5. novembar/)).toBeInTheDocument()
    expect(luka.getByText(/12:00–13:00/)).toBeInTheDocument()
  })

  it('has no section when nothing waits', async () => {
    const state = seedTeacher()
    renderTeacher(PATH, {
      api: createFakeTeacherApi({ lessons: state.lessons.filter((l) => l.status !== 'pending') }),
    })
    await block(/^Ana Petrović, Luka Ilić – Učionica 1/)
    expect(screen.queryByRole('heading', { name: 'Zahtevi na čekanju' })).not.toBeInTheDocument()
  })

  it('confirms a booking, which becomes an ordinary lesson', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await userEvent.click((await entry()).getByRole('button', { name: 'Potvrdi' }))
    expect(teacherApi.confirmBooking).toHaveBeenCalledWith('booking-pending')
    expect(await screen.findByRole('status')).toHaveTextContent('Zahtev je potvrđen.')
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Zahtevi na čekanju' })).not.toBeInTheDocument(),
    )
    expect(await block(/^Luka Ilić$/)).toHaveAttribute('data-variant', 'own')
  })

  it('declines a booking, which frees the slot again', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await userEvent.click((await entry()).getByRole('button', { name: 'Odbij' }))
    const decline = await inDialog('Odbijanje zahteva')
    await userEvent.type(decline.getByLabelText('Razlog (nije obavezan)'), 'Nisam u gradu')
    await userEvent.click(decline.getByRole('button', { name: 'Odbij zahtev' }))
    expect(teacherApi.declineBooking).toHaveBeenCalledWith('booking-pending', 'Nisam u gradu')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Zahtev je odbijen, termin je ponovo slobodan.',
    )
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Slobodan termin/ })).toHaveLength(2),
    )
  })

  it('explains it when the booking is no longer waiting', async () => {
    const { teacherApi } = renderTeacher(PATH)
    teacherApi.failNext(
      'confirmBooking',
      new AdminError('PT409', 'only a pending booking can be confirmed'),
    )
    await userEvent.click((await entry()).getByRole('button', { name: 'Potvrdi' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Zahtev više nije na čekanju.')
  })

  it('explains that a booking whose lesson has begun can only be confirmed', async () => {
    const { teacherApi } = renderTeacher(PATH)
    teacherApi.failNext('declineBooking', new AdminError('PT409', 'lesson already started'))
    await userEvent.click((await entry()).getByRole('button', { name: 'Odbij' }))
    await userEvent.click(
      (await inDialog('Odbijanje zahteva')).getByRole('button', { name: 'Odbij zahtev' }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Čas je već počeo, pa se zahtev više ne može odbiti. Potvrdite ga.',
    )
  })
})

describe('scheduling a lesson', () => {
  it('schedules it for the chosen students and shows it on the calendar', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openNewLesson()

    await userEvent.selectOptions(form.getByLabelText('Predmet'), 'Matematika')
    await userEvent.selectOptions(form.getByLabelText('Lokacija'), 'Glavna lokacija')
    await userEvent.selectOptions(form.getByLabelText('Učionica'), 'Učionica 2')
    setDate(form, 'Datum', '2026-11-06')
    setTime(form, 'Početak', '09:00')
    setTime(form, 'Kraj', '10:15')
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))

    expect(teacherApi.scheduleLesson).toHaveBeenCalledWith({
      subjectId: 's-mat',
      locationId: 'l-main',
      roomId: 'r-2',
      start: '2026-11-06T08:00:00.000Z', // 09:00 in Belgrade
      end: '2026-11-06T09:15:00.000Z',
      studentIds: ['st-luka'],
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Čas je zakazan.')
    expect(await block('Luka Ilić – Učionica 2')).toBeInTheDocument()
  })

  it('offers only the subjects the teacher teaches, the rooms of the chosen location, and no room', async () => {
    renderTeacher(PATH)
    const form = await openNewLesson()
    expect(
      within(form.getByLabelText('Predmet'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Matematika', 'Fizika'])
    expect(
      within(form.getByLabelText('Učionica'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Bez učionice', 'Učionica 1', 'Učionica 2'])
    // a location without rooms has nothing to choose
    await userEvent.selectOptions(form.getByLabelText('Lokacija'), 'Zemun')
    expect(form.queryByLabelText('Učionica')).not.toBeInTheDocument()
  })

  it('leaves out the subject, the location and the room when each has only one choice', async () => {
    const state = seedTeacher()
    state.reference.subjects = [{ id: 's-fiz', name: 'Fizika' }]
    state.reference.locations = [
      { id: 'l-main', name: 'Glavna lokacija', rooms: [{ id: 'r-2', name: 'Učionica 2' }] },
    ]
    state.reference.ownLocationIds = ['l-main']
    const teacherApi = createFakeTeacherApi(state)
    renderTeacher(PATH, { api: teacherApi })
    const form = await openNewLesson()
    expect(form.queryByLabelText('Predmet')).not.toBeInTheDocument()
    expect(form.queryByLabelText('Lokacija')).not.toBeInTheDocument()
    expect(form.queryByLabelText('Učionica')).not.toBeInTheDocument()

    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    await waitFor(() =>
      expect(teacherApi.scheduleLesson).toHaveBeenCalledWith(
        expect.objectContaining({ subjectId: 's-fiz', locationId: 'l-main', roomId: 'r-2' }),
      ),
    )
  })

  it('keeps asking for the subject and the room while there is a choice', async () => {
    renderTeacher(PATH)
    const form = await openNewLesson()
    expect(form.getByLabelText('Predmet')).toBeInTheDocument()
    expect(form.getByLabelText('Učionica')).toHaveValue('') // two rooms: none is chosen for the teacher
  })

  it('starts from the first full hour ahead, today, for one hour', async () => {
    renderTeacher(PATH)
    const form = await openNewLesson()
    expect(form.getByLabelText('Datum')).toHaveValue('04.11.2026')
    expect(timeOf(form, 'Početak')).toBe('12:00')
    expect(timeOf(form, 'Kraj')).toBe('13:00')
  })

  it('is prefilled from the stretch of time selected on the calendar', async () => {
    renderTeacher(PATH)
    await block(/^Ana Petrović, Luka Ilić – Učionica 1/)
    act(() =>
      calendar().onCreate({ start: '2026-11-06T09:00:00+01:00', end: '2026-11-06T10:15:00+01:00' }),
    )
    const form = await inDialog('Novi čas')
    expect(form.getByLabelText('Datum')).toHaveValue('06.11.2026')
    expect(timeOf(form, 'Početak')).toBe('09:00')
    expect(timeOf(form, 'Kraj')).toBe('10:15')
  })

  it('wants at least one student, and at most four', async () => {
    const students: StudentRow[] = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
      ...seedTeacher().students[1],
      id: `st-${id}`,
      profileId: `pr-${id}`,
      email: `${id}@example.test`,
      firstName: `Učenik${id.toUpperCase()}`,
      lastName: 'Test',
    }))
    const { teacherApi } = renderTeacher(PATH, { api: createFakeTeacherApi({ students }) })
    const form = await openNewLesson()

    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(form.getByRole('alert')).toHaveTextContent('Izaberite bar jednog učenika.')

    for (const id of ['A', 'B', 'C', 'D']) {
      await userEvent.click(form.getByRole('checkbox', { name: `Učenik${id} Test` }))
    }
    expect(form.getByRole('checkbox', { name: 'UčenikE Test' })).toBeDisabled()
    expect(form.queryByText(/Najviše/)).not.toBeInTheDocument() // the limit is not announced, only enforced
    await userEvent.click(form.getByRole('checkbox', { name: 'UčenikA Test' })) // one leaves, room again
    expect(form.getByRole('checkbox', { name: 'UčenikE Test' })).toBeEnabled()
    expect(teacherApi.scheduleLesson).not.toHaveBeenCalled()
  })

  it('checks the times before asking the backend', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openNewLesson()
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))

    setTime(form, 'Kraj', '11:30') // before the start (12:00)
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(form.getByRole('alert')).toHaveTextContent('Kraj časa mora biti posle početka.')

    setTime(form, 'Kraj', '13:00')
    setDate(form, 'Datum', '2026-11-03') // yesterday
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(form.getByRole('alert')).toHaveTextContent('Čas ne može da počne na dan koji je prošao.')

    fireEvent.change(form.getByLabelText('Datum'), { target: { value: '' } })
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(form.getByRole('alert')).toHaveTextContent('Unesite datum i vreme časa.')
    expect(teacherApi.scheduleLesson).not.toHaveBeenCalled()
  })

  it('allows a lesson earlier today, to record it afterwards', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openNewLesson()
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    setTime(form, 'Početak', '07:00')
    setTime(form, 'Kraj', '07:45')
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(teacherApi.scheduleLesson).toHaveBeenCalledWith(
      expect.objectContaining({ start: '2026-11-04T06:00:00.000Z' }),
    )
  })

  describe('a clash is a warning, never a block', () => {
    async function fillClash() {
      const form = await openNewLesson()
      await userEvent.selectOptions(form.getByLabelText('Učionica'), 'Učionica 1')
      setDate(form, 'Datum', '2026-11-05')
      setTime(form, 'Početak', '16:00')
      setTime(form, 'Kraj', '17:00')
      await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
      return form
    }

    it('warns about both overlaps first, and saves only after the second click', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await fillClash()
      await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))

      const warning = await form.findByRole('group', { name: 'Upozorenje o preklapanju' })
      expect(warning).toHaveTextContent(
        'Već imate čas u to vreme (16:00–17:00) u istoj učionici (Učionica 1).',
      )
      expect(warning).toHaveTextContent(
        'Učionica (Učionica 1) je u to vreme (16:30–17:30) zauzeta: nastavnik Marko Jovanović.',
      )
      expect(teacherApi.scheduleLesson).not.toHaveBeenCalled()

      await userEvent.click(form.getByRole('button', { name: 'Sačuvaj i pored upozorenja' }))
      await waitFor(() => expect(teacherApi.scheduleLesson).toHaveBeenCalledTimes(1))
      expect(await screen.findByRole('status')).toHaveTextContent('Čas je zakazan.')
    })

    it('asks again if something changed after the warning', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await fillClash()
      await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
      await form.findByRole('group', { name: 'Upozorenje o preklapanju' })

      setTime(form, 'Početak', '14:00')
      setTime(form, 'Kraj', '15:00') // no longer overlaps anything
      expect(
        form.queryByRole('group', { name: 'Upozorenje o preklapanju' }),
      ).not.toBeInTheDocument()
      await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
      await waitFor(() => expect(teacherApi.scheduleLesson).toHaveBeenCalledTimes(1))
      expect(teacherApi.findConflicts).toHaveBeenCalledTimes(2)
    })

    it('says nothing when there is no overlap', async () => {
      const { teacherApi } = renderTeacher(PATH)
      const form = await openNewLesson()
      await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
      await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
      await waitFor(() => expect(teacherApi.scheduleLesson).toHaveBeenCalledTimes(1))
    })
  })

  it("explains the database's refusals and keeps what was typed", async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openNewLesson()
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    teacherApi.failNext(
      'scheduleLesson',
      new AdminError('PT400', 'the teacher does not teach this subject'),
    )
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(await form.findByRole('alert')).toHaveTextContent('Ne predajete taj predmet.')
    expect(form.getByRole('checkbox', { name: 'Luka Ilić' })).toBeChecked()
  })
})

describe('moving a lesson by dragging it', () => {
  const move = (id: string, start: string, end: string) =>
    calendar().onChangeTime(id, { start, end })

  it('saves the new time as it is on the Belgrade clock', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await block(/^Ana Petrović – Učionica 2/)
    await act(async () => {
      await move('les-today', '2026-11-04T09:00:00+01:00', '2026-11-04T10:00:00+01:00')
    })
    expect(teacherApi.updateLesson).toHaveBeenCalledWith('les-today', {
      start: '2026-11-04T08:00:00.000Z',
      end: '2026-11-04T09:00:00.000Z',
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Čas je pomeren.')
  })

  it('warns about a clash before saving, and puts the lesson back if the teacher declines', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await block(/^Ana Petrović, Luka Ilić – Učionica 1/)
    let result: Promise<void> = Promise.resolve()
    act(() => {
      result = move('les-tomorrow', '2026-11-05T17:00:00+01:00', '2026-11-05T18:00:00+01:00')
    })
    // the rejection is expected: it is what makes the calendar put the block back
    const rejected = expect(result).rejects.toBeDefined()
    const dialog = await inDialog('Preklapanje')
    expect(dialog.getByText(/zauzeta: nastavnik Marko Jovanović/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Ne pomeraj' }))
    await act(async () => {
      await rejected
    })
    expect(teacherApi.updateLesson).not.toHaveBeenCalled()
  })

  it('saves anyway when the teacher accepts the warning', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await block(/^Ana Petrović, Luka Ilić – Učionica 1/)
    let result: Promise<void> = Promise.resolve()
    act(() => {
      result = move('les-tomorrow', '2026-11-05T17:00:00+01:00', '2026-11-05T18:00:00+01:00')
    })
    const dialog = await inDialog('Preklapanje')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj i pored upozorenja' }))
    await act(async () => {
      await result
    })
    expect(teacherApi.updateLesson).toHaveBeenCalledWith('les-tomorrow', {
      start: '2026-11-05T16:00:00.000Z',
      end: '2026-11-05T17:00:00.000Z',
    })
  })

  it('shows why a move failed and lets the calendar put the block back', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await block(/^Ana Petrović – Učionica 2/)
    teacherApi.failNext('updateLesson', new AdminError('PT409', 'the day of this lesson is over'))
    await act(async () => {
      await expect(
        move('les-today', '2026-11-04T09:00:00+01:00', '2026-11-04T10:00:00+01:00'),
      ).rejects.toBeDefined()
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Dan ovog časa je prošao: predmet, mesto i vreme se više ne menjaju.',
    )
  })

  it('does not treat a booked free slot as a clash for itself', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await block(/^Slobodan termin/)
    await act(async () => {
      await move('slot-open', '2026-11-05T19:00:00+01:00', '2026-11-05T20:00:00+01:00')
    })
    expect(teacherApi.updateLesson).toHaveBeenCalledWith('slot-open', expect.any(Object))
    expect(screen.queryByRole('dialog', { name: 'Preklapanje' })).not.toBeInTheDocument()
  })
})
