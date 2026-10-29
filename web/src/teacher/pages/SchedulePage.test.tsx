import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { createFakeTeacherApi, seedTeacher } from '../../test/fakeTeacherApi'
import { calendar, TEST_WEEK } from '../../test/mockCalendar'
import { inDialog, page, renderTeacher } from '../../test/renderTeacher'
import type { StudentRow } from '../teacherApi'

vi.mock('../calendar/WeekCalendar', async () => import('../../test/mockCalendar'))

const PATH = '/moj-raspored'
const block = (name: string | RegExp) => screen.findByRole('button', { name })
const setField = (field: HTMLElement, value: string) =>
  fireEvent.change(field, { target: { value } })

/** Opens the "Novi čas" form from the toolbar. */
async function openNewLesson() {
  await page('Moj raspored')
  await userEvent.click(await screen.findByRole('button', { name: 'Novi čas' }))
  return inDialog('Novi čas')
}

describe('the weekly schedule', () => {
  it('shows own lessons, slots and bookings, and colleagues as busy time', async () => {
    renderTeacher(PATH)
    await page('Moj raspored')

    expect(await block('Fizika – Ana Petrović, Luka Ilić · Učionica 1')).toHaveAttribute(
      'data-variant',
      'own',
    )
    expect(await block('Matematika – Ana Petrović · Učionica 2')).toBeInTheDocument()
    expect(await block('Slobodan termin – Matematika')).toHaveAttribute('data-variant', 'slot')
    expect(await block(/^Na čekanju/)).toHaveAttribute('data-variant', 'pending')
    expect(await block('Zauzeto – Marko Jovanović · Učionica 1')).toHaveAttribute(
      'data-variant',
      'busy',
    )
  })

  it('never shows what colleagues teach or to whom: only that they are busy', async () => {
    renderTeacher(PATH)
    const busy = await block(/^Zauzeto/)
    expect(busy).toHaveTextContent('Marko Jovanović')
    expect(busy).not.toHaveTextContent(/Matematika|Fizika|Hemija/)
  })

  it('leaves out an expired free slot, and marks frozen lessons', async () => {
    renderTeacher(PATH)
    await block(/^Fizika/)
    expect(screen.getAllByRole('button', { name: /^Slobodan termin/ })).toHaveLength(1)
    expect(await block(/^Matematika – Ana Petrović$/)).toHaveAttribute('data-variant', 'own locked')
  })

  it('asks for the week that is on screen, for this teacher only', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await block(/^Fizika/)
    expect(teacherApi.listLessons).toHaveBeenCalledWith(TEST_WEEK, 'p-teacher')
    expect(teacherApi.listBusy).toHaveBeenCalledWith(TEST_WEEK, 'p-teacher')
  })

  it('moves to another week when the calendar says so', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await block(/^Fizika/)
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
    expect(await block(/^Fizika/)).toBeInTheDocument()
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
    await block(/^Fizika/)
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
    expect(await block(/^Matematika – Luka Ilić/)).toHaveAttribute('data-variant', 'own')
  })

  it('declines a booking, which frees the slot again', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await userEvent.click((await entry()).getByRole('button', { name: 'Odbij' }))
    expect(teacherApi.declineBooking).toHaveBeenCalledWith('booking-pending')
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
    setField(form.getByLabelText('Datum'), '2026-11-06')
    setField(form.getByLabelText('Početak'), '09:00')
    setField(form.getByLabelText('Kraj'), '10:15')
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
    expect(await block('Matematika – Luka Ilić · Učionica 2')).toBeInTheDocument()
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
    await userEvent.selectOptions(form.getByLabelText('Lokacija'), 'Zemun')
    expect(
      within(form.getByLabelText('Učionica'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Bez učionice'])
  })

  it('starts from the first full hour ahead, today, for one hour', async () => {
    renderTeacher(PATH)
    const form = await openNewLesson()
    expect(form.getByLabelText('Datum')).toHaveValue('2026-11-04')
    expect(form.getByLabelText('Početak')).toHaveValue('12:00')
    expect(form.getByLabelText('Kraj')).toHaveValue('13:00')
  })

  it('is prefilled from the stretch of time selected on the calendar', async () => {
    renderTeacher(PATH)
    await block(/^Fizika/)
    act(() =>
      calendar().onCreate({ start: '2026-11-06T09:00:00+01:00', end: '2026-11-06T10:15:00+01:00' }),
    )
    const form = await inDialog('Novi čas')
    expect(form.getByLabelText('Datum')).toHaveValue('2026-11-06')
    expect(form.getByLabelText('Početak')).toHaveValue('09:00')
    expect(form.getByLabelText('Kraj')).toHaveValue('10:15')
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
    expect(form.getByText('Najviše 4 učenika.')).toBeInTheDocument()
    await userEvent.click(form.getByRole('checkbox', { name: 'UčenikA Test' })) // one leaves, room again
    expect(form.getByRole('checkbox', { name: 'UčenikE Test' })).toBeEnabled()
    expect(teacherApi.scheduleLesson).not.toHaveBeenCalled()
  })

  it('checks the times before asking the backend', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openNewLesson()
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))

    setField(form.getByLabelText('Kraj'), '11:30') // before the start (12:00)
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(form.getByRole('alert')).toHaveTextContent('Kraj časa mora biti posle početka.')

    setField(form.getByLabelText('Kraj'), '13:10')
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(form.getByRole('alert')).toHaveTextContent('Vreme mora biti na svakih 15 minuta.')

    setField(form.getByLabelText('Kraj'), '13:00')
    setField(form.getByLabelText('Datum'), '2026-11-03') // yesterday
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(form.getByRole('alert')).toHaveTextContent('Čas ne može da počne na dan koji je prošao.')

    setField(form.getByLabelText('Datum'), '')
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(form.getByRole('alert')).toHaveTextContent('Unesite datum i vreme časa.')
    expect(teacherApi.scheduleLesson).not.toHaveBeenCalled()
  })

  it('allows a lesson earlier today, to record it afterwards', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openNewLesson()
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    setField(form.getByLabelText('Početak'), '07:00')
    setField(form.getByLabelText('Kraj'), '07:45')
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(teacherApi.scheduleLesson).toHaveBeenCalledWith(
      expect.objectContaining({ start: '2026-11-04T06:00:00.000Z' }),
    )
  })

  describe('a clash is a warning, never a block', () => {
    async function fillClash() {
      const form = await openNewLesson()
      await userEvent.selectOptions(form.getByLabelText('Učionica'), 'Učionica 1')
      setField(form.getByLabelText('Datum'), '2026-11-05')
      setField(form.getByLabelText('Početak'), '16:00')
      setField(form.getByLabelText('Kraj'), '17:00')
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

      setField(form.getByLabelText('Početak'), '14:00')
      setField(form.getByLabelText('Kraj'), '15:00') // no longer overlaps anything
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
    await block(/^Matematika – Ana Petrović · Učionica 2/)
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
    await block(/^Fizika/)
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
    await block(/^Fizika/)
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
    await block(/^Matematika – Ana Petrović · Učionica 2/)
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
