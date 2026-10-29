import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { createFakeTeacherApi, seedTeacher } from '../../test/fakeTeacherApi'
import { inDialog, page, renderTeacher } from '../../test/renderTeacher'

vi.mock('../calendar/WeekCalendar', async () => import('../../test/mockCalendar'))

const PATH = '/moj-raspored'
const block = (name: string | RegExp) => screen.findByRole('button', { name })
const setField = (field: HTMLElement, value: string) =>
  fireEvent.change(field, { target: { value } })

/** Opens a lesson from the calendar and returns its dialog. */
async function open(blockName: string | RegExp, dialogName: string) {
  await page('Moj raspored')
  await userEvent.click(await block(blockName))
  return inDialog(dialogName)
}

const TODAY = /^Matematika – Ana Petrović · Učionica 2/ // 08:00-09:00 today: over, still open to changes
const TOMORROW = /^Fizika/ // Thursday 16:00-17:00, Ana and Luka
const LOCKED = /^Matematika – Ana Petrović$/ // Monday, outcome recorded

describe('looking at a lesson', () => {
  it('shows when and where, and each student with their note', async () => {
    renderTeacher(PATH)
    const dialog = await open(TODAY, 'Matematika')
    expect(dialog.getByText('sre, 4. novembar, 08:00–09:00')).toBeInTheDocument()
    expect(dialog.getByText('Glavna lokacija, Učionica 2')).toBeInTheDocument()
    expect(dialog.getByText('Ana Petrović')).toBeInTheDocument()
    expect(dialog.getByLabelText('Napomena za Ana Petrović')).toHaveValue('Radili razlomke')
  })

  it('saves a note for one student, and clears it when emptied', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TODAY, 'Matematika')
    const save = dialog.getByRole('button', { name: 'Sačuvaj napomenu za Ana Petrović' })
    expect(save).toBeDisabled() // nothing changed yet

    await userEvent.clear(dialog.getByLabelText('Napomena za Ana Petrović'))
    await userEvent.type(dialog.getByLabelText('Napomena za Ana Petrović'), '  Domaći: strana 40 ')
    await userEvent.click(save)
    expect(teacherApi.setNote).toHaveBeenCalledWith('les-today', 'st-ana', 'Domaći: strana 40')
    expect(await dialog.findByText('Napomena je sačuvana.')).toBeInTheDocument()

    await userEvent.clear(dialog.getByLabelText('Napomena za Ana Petrović'))
    await userEvent.click(save)
    expect(teacherApi.setNote).toHaveBeenLastCalledWith('les-today', 'st-ana', null)
  })

  it('keeps the note and says why when it cannot be saved', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TODAY, 'Matematika')
    teacherApi.failNext('setNote', new AdminError('23514', 'too long'))
    await userEvent.type(dialog.getByLabelText('Napomena za Ana Petrović'), '!')
    await userEvent.click(dialog.getByRole('button', { name: 'Sačuvaj napomenu za Ana Petrović' }))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Napomena je predugačka (najviše 2000 znakova).',
    )
    expect(dialog.getByLabelText('Napomena za Ana Petrović')).toHaveValue('Radili razlomke!')
  })

  it('notes are for students: a free slot has none', async () => {
    renderTeacher(PATH)
    const dialog = await open(/^Slobodan termin/, 'Slobodan termin')
    expect(dialog.queryByRole('heading', { name: 'Učenici' })).not.toBeInTheDocument()
    expect(dialog.getByText('Matematika')).toBeInTheDocument()
  })
})

describe('recording what happened', () => {
  it('records "held" after the lesson, then can change or clear it', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TODAY, 'Matematika')
    await userEvent.click(dialog.getByRole('button', { name: 'Održan' }))
    expect(teacherApi.setOutcome).toHaveBeenCalledWith('les-today', 'held')
    expect(await dialog.findByText('Ishod je upisan.')).toBeInTheDocument()
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Održan' })).toBeDisabled())

    await userEvent.click(dialog.getByRole('button', { name: 'Nije održan' }))
    expect(teacherApi.setOutcome).toHaveBeenLastCalledWith('les-today', 'not_held')

    await userEvent.click(await dialog.findByRole('button', { name: 'Obriši ishod' }))
    expect(teacherApi.setOutcome).toHaveBeenLastCalledWith('les-today', null)
    expect(await dialog.findByText('Ishod je obrisan.')).toBeInTheDocument()
  })

  it('does not offer an outcome before the lesson is over', async () => {
    renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    expect(dialog.getByText('Ishod se upisuje posle završetka časa.')).toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: 'Održan' })).not.toBeInTheDocument()
  })

  it('still lets the outcome of a frozen lesson be changed', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(LOCKED, 'Matematika')
    expect(dialog.getByText(/Dan ovog časa je prošao ili je upisan ishod/)).toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši ishod' }))
    expect(teacherApi.setOutcome).toHaveBeenCalledWith('les-locked', null)
  })
})

describe('deleting, cancelling and removing', () => {
  it('deletes a lesson after explaining what happens, and it leaves the calendar', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši čas' }))
    const confirm = await inDialog('Brisanje časa')
    expect(confirm.getByText(/dobijaju obaveštenje/)).toBeInTheDocument()
    await userEvent.click(confirm.getByRole('button', { name: 'Obriši' }))

    expect(teacherApi.cancelLesson).toHaveBeenCalledWith('les-tomorrow')
    expect(await screen.findByRole('status')).toHaveTextContent('Čas je obrisan.')
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: TOMORROW })).not.toBeInTheDocument(),
    )
  })

  it('comes back to the lesson when the teacher thinks better of it', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši čas' }))
    await userEvent.click(
      (await inDialog('Brisanje časa')).getByRole('button', { name: 'Odustani' }),
    )
    expect(await inDialog('Fizika')).toBeTruthy()
    expect(teacherApi.cancelLesson).not.toHaveBeenCalled()
  })

  it('cannot delete a lesson that has begun', async () => {
    renderTeacher(PATH)
    const dialog = await open(TODAY, 'Matematika')
    expect(dialog.queryByRole('button', { name: /Obriši čas|Otkaži čas/ })).not.toBeInTheDocument()
  })

  it('explains it when the database refuses (the lesson began meanwhile)', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši čas' }))
    const confirm = await inDialog('Brisanje časa')
    teacherApi.failNext('cancelLesson', new AdminError('PT409', 'lesson already started'))
    await userEvent.click(confirm.getByRole('button', { name: 'Obriši' }))
    expect(await confirm.findByRole('alert')).toHaveTextContent(
      'Čas je već počeo i ne može da se otkaže.',
    )
  })

  it('removes a free slot', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(/^Slobodan termin/, 'Slobodan termin')
    await userEvent.click(dialog.getByRole('button', { name: 'Ukloni termin' }))
    await userEvent.click(
      (await inDialog('Uklanjanje termina')).getByRole('button', { name: 'Ukloni' }),
    )
    expect(teacherApi.cancelLesson).toHaveBeenCalledWith('slot-open')
    expect(await screen.findByRole('status')).toHaveTextContent('Termin je uklonjen.')
  })

  it('cancels a booked slot, which becomes free again instead of disappearing', async () => {
    const state = seedTeacher()
    const booked = {
      ...state.lessons.find((l) => l.id === 'slot-open')!,
      status: 'confirmed' as const,
      participants: [{ studentId: 'st-luka', note: null }],
    }
    const lessons = state.lessons.map((l) => (l.id === 'slot-open' ? booked : l))
    const { teacherApi } = renderTeacher(PATH, { api: createFakeTeacherApi({ lessons }) })
    const dialog = await open(/^Matematika – Luka Ilić/, 'Matematika')
    await userEvent.click(dialog.getByRole('button', { name: 'Otkaži čas' }))
    const confirm = await inDialog('Otkazivanje časa')
    expect(confirm.getByText(/ponovo postaje slobodan/)).toBeInTheDocument()
    await userEvent.click(confirm.getByRole('button', { name: 'Otkaži čas' }))

    expect(teacherApi.cancelLesson).toHaveBeenCalledWith('slot-open')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Čas je otkazan, termin je ponovo slobodan.',
    )
    expect(await block(/^Slobodan termin – Matematika/)).toBeInTheDocument()
  })
})

describe('answering a booking from its dialog', () => {
  it('confirms it, with nothing to edit or delete before that', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(/^Na čekanju/, 'Na čekanju')
    expect(dialog.queryByRole('button', { name: /Obriši|Otkaži|Izmeni/ })).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Potvrdi' }))
    expect(teacherApi.confirmBooking).toHaveBeenCalledWith('booking-pending')
    expect(await dialog.findByText('Zahtev je potvrđen.')).toBeInTheDocument()
  })
})

describe('editing a lesson', () => {
  const edit = async (name: string | RegExp = TOMORROW, title = 'Fizika') => {
    const dialog = await open(name, title)
    await userEvent.click(dialog.getByRole('button', { name: 'Izmeni čas' }))
    return inDialog('Izmena časa')
  }

  it('starts from the lesson as it is', async () => {
    renderTeacher(PATH)
    const form = await edit()
    expect(form.getByLabelText('Predmet')).toHaveValue('s-fiz')
    expect(form.getByLabelText('Učionica')).toHaveValue('r-1')
    expect(form.getByLabelText('Datum')).toHaveValue('2026-11-05')
    expect(form.getByLabelText('Početak')).toHaveValue('16:00')
    expect(form.getByLabelText('Kraj')).toHaveValue('17:00')
    expect(form.getByRole('checkbox', { name: 'Ana Petrović' })).toBeChecked()
    expect(form.getByRole('checkbox', { name: 'Luka Ilić' })).toBeChecked()
  })

  it('sends only what changed', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await edit()
    await userEvent.selectOptions(form.getByLabelText('Učionica'), 'Učionica 2')
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))

    expect(teacherApi.updateLesson).toHaveBeenCalledWith('les-tomorrow', { roomId: 'r-2' })
    expect(teacherApi.setLessonStudents).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Čas je izmenjen.')
  })

  it('can drop the room', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await edit()
    await userEvent.selectOptions(form.getByLabelText('Učionica'), 'Bez učionice')
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    expect(teacherApi.updateLesson).toHaveBeenCalledWith('les-tomorrow', { roomId: null })
  })

  it('changes who attends without touching the time', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await edit()
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    expect(teacherApi.setLessonStudents).toHaveBeenCalledWith('les-tomorrow', ['st-ana'])
    expect(teacherApi.updateLesson).not.toHaveBeenCalled()
  })

  it('warns about a clash with another lesson, not with itself', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await edit()
    // 16:30-17:30 overlaps the colleague in the same room, and the lesson itself must not count
    setField(form.getByLabelText('Početak'), '16:30')
    setField(form.getByLabelText('Kraj'), '17:30')
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))

    const warning = await form.findByRole('group', { name: 'Upozorenje o preklapanju' })
    expect(warning).toHaveTextContent('nastavnik Marko Jovanović')
    expect(warning).not.toHaveTextContent('Već imate čas')
    expect(teacherApi.findConflicts).toHaveBeenCalledWith(
      expect.objectContaining({ excludeLessonId: 'les-tomorrow' }),
    )
    expect(teacherApi.updateLesson).not.toHaveBeenCalled()

    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj i pored upozorenja' }))
    await waitFor(() =>
      expect(teacherApi.updateLesson).toHaveBeenCalledWith('les-tomorrow', {
        start: '2026-11-05T15:30:00.000Z',
        end: '2026-11-05T16:30:00.000Z',
      }),
    )
  })

  it('does not move a lesson onto a day that has passed, but may leave an old one where it is', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await edit()
    setField(form.getByLabelText('Datum'), '2026-11-03')
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    expect(form.getByRole('alert')).toHaveTextContent(
      'Čas ne može da se pomeri na dan koji je prošao.',
    )
    expect(teacherApi.updateLesson).not.toHaveBeenCalled()
  })

  it('does nothing and closes when nothing changed', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await edit()
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    expect(teacherApi.updateLesson).not.toHaveBeenCalled()
    expect(teacherApi.setLessonStudents).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('wants at least one student left', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await edit()
    await userEvent.click(form.getByRole('checkbox', { name: 'Ana Petrović' }))
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    expect(form.getByRole('alert')).toHaveTextContent('Izaberite bar jednog učenika.')
    expect(teacherApi.setLessonStudents).not.toHaveBeenCalled()
  })

  it('freezes subject, place and time of an old lesson but not its students', async () => {
    const { teacherApi } = renderTeacher(PATH)
    // Monday, 'held': locked twice over; the outcome has to be cleared first to change anything else
    const form = await edit(LOCKED, 'Matematika')
    expect(form.getByText(/Dan ovog časa je prošao ili je upisan ishod/)).toBeInTheDocument()
    for (const label of ['Predmet', 'Lokacija', 'Učionica', 'Datum', 'Početak', 'Kraj']) {
      expect(form.getByLabelText(label)).toBeDisabled()
    }
    expect(form.getByRole('checkbox', { name: 'Luka Ilić' })).toBeEnabled()
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    expect(teacherApi.setLessonStudents).toHaveBeenCalledWith('les-locked', ['st-ana', 'st-luka'])
    expect(teacherApi.updateLesson).not.toHaveBeenCalled()
  })

  it("explains the database's refusals, in the right words for the step that failed", async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await edit()
    await userEvent.selectOptions(form.getByLabelText('Učionica'), 'Učionica 2')
    teacherApi.failNext('updateLesson', new AdminError('PT409', 'the day of this lesson is over'))
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    expect(await form.findByRole('alert')).toHaveTextContent('Dan ovog časa je prošao')

    teacherApi.failNext(
      'updateLesson',
      new AdminError('PT409', 'a lesson with a recorded outcome cannot be changed'),
    )
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(form.getByRole('alert')).toHaveTextContent('Prvo obrišite ishod.'))

    // the students step has its own texts
    await userEvent.selectOptions(form.getByLabelText('Učionica'), 'Učionica 1') // back to the original
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    teacherApi.failNext('setLessonStudents', new AdminError('PT409', 'only a confirmed lesson'))
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() =>
      expect(form.getByRole('alert')).toHaveTextContent(
        'Učenike možete da menjate samo kod potvrđenog časa.',
      ),
    )
  })

  it('keeps the length of a booked free slot and moves only its start', async () => {
    const state = seedTeacher()
    const booked = {
      ...state.lessons.find((l) => l.id === 'slot-open')!,
      status: 'confirmed' as const,
      participants: [{ studentId: 'st-luka', note: null }],
    }
    const lessons = state.lessons.map((l) => (l.id === 'slot-open' ? booked : l))
    const { teacherApi } = renderTeacher(PATH, { api: createFakeTeacherApi({ lessons }) })
    const form = await edit(/^Matematika – Luka Ilić/, 'Matematika')
    expect(form.getByLabelText('Kraj')).toBeDisabled()
    setField(form.getByLabelText('Početak'), '19:00')
    expect(form.getByLabelText('Kraj')).toHaveValue('20:00')
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    expect(teacherApi.updateLesson).toHaveBeenCalledWith('slot-open', {
      start: '2026-11-05T18:00:00.000Z',
      end: '2026-11-05T19:00:00.000Z',
    })
  })
})

describe('publishing a free slot', () => {
  const openSlot = async () => {
    await page('Moj raspored')
    await userEvent.click(await screen.findByRole('button', { name: 'Objavi slobodan termin' }))
    return inDialog('Novi slobodan termin')
  }

  it('publishes it for 45 or 60 minutes and shows it on the calendar', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openSlot()
    expect(form.getByRole('radio', { name: '60 minuta' })).toBeChecked()
    setField(form.getByLabelText('Datum'), '2026-11-06')
    setField(form.getByLabelText('Početak'), '15:00')
    await userEvent.click(form.getByRole('radio', { name: '45 minuta' }))
    await userEvent.selectOptions(form.getByLabelText('Učionica'), 'Učionica 2')
    await userEvent.click(form.getByRole('button', { name: 'Objavi' }))

    expect(teacherApi.publishSlot).toHaveBeenCalledWith({
      teacherId: 'p-teacher',
      subjectId: 's-mat',
      locationId: 'l-main',
      roomId: 'r-2',
      start: '2026-11-06T14:00:00.000Z',
      minutes: 45,
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Slobodan termin je objavljen.')
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: /^Slobodan termin/ })).toHaveLength(2),
    )
  })

  it('offers only the two lengths a slot may have', async () => {
    renderTeacher(PATH)
    const form = await openSlot()
    expect(
      form
        .getAllByRole('radio')
        .map((radio) => (radio as HTMLInputElement).labels?.[0].textContent),
    ).toEqual(['45 minuta', '60 minuta'])
  })

  it('wants a time ahead, on the quarter hour', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openSlot()
    setField(form.getByLabelText('Datum'), '2026-11-04')
    setField(form.getByLabelText('Početak'), '10:00') // before now (11:00)
    await userEvent.click(form.getByRole('button', { name: 'Objavi' }))
    expect(form.getByRole('alert')).toHaveTextContent('Slobodan termin mora biti u budućnosti.')

    setField(form.getByLabelText('Početak'), '14:10')
    await userEvent.click(form.getByRole('button', { name: 'Objavi' }))
    expect(form.getByRole('alert')).toHaveTextContent('Vreme mora biti na svakih 15 minuta.')
    expect(teacherApi.publishSlot).not.toHaveBeenCalled()
  })

  it("explains the database's refusal", async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openSlot()
    teacherApi.failNext('publishSlot', new AdminError('42501', 'row-level security'))
    await userEvent.click(form.getByRole('button', { name: 'Objavi' }))
    expect(await form.findByRole('alert')).toHaveTextContent(
      'Slobodan termin mora biti u budućnosti.',
    )
  })
})

describe('the schedule page, within the app', () => {
  it("is the teacher's home, next to the list of students", async () => {
    renderTeacher(PATH)
    expect(await page('Moj raspored')).toBeInTheDocument()
    const nav = within(screen.getByRole('navigation', { name: 'Glavna navigacija' }))
    expect(nav.getByRole('link', { name: 'Raspored' })).toHaveAttribute('aria-current', 'page')
    expect(nav.getByRole('link', { name: 'Učenici' })).toBeInTheDocument()
  })
})
