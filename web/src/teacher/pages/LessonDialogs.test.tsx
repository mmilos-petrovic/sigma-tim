import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { createFakeTeacherApi, seedTeacher } from '../../test/fakeTeacherApi'
import { setDate, setTime, timeOf } from '../../test/dateTime'
import { inDialog, page, renderTeacher } from '../../test/renderTeacher'

vi.mock('../calendar/WeekCalendar', async () => import('../../test/mockCalendar'))

const PATH = '/moj-raspored'
const block = (name: string | RegExp) => screen.findByRole('button', { name })

/** Opens a lesson from the calendar and returns its dialog. */
async function open(blockName: string | RegExp, dialogName: string) {
  await page('Moj raspored')
  await userEvent.click(await block(blockName))
  return inDialog(dialogName)
}

const TODAY = /^Ana Petrović – Učionica 2/ // 08:00-09:00 today: over, still open to changes
const TOMORROW = /^Ana Petrović, Luka Ilić – Učionica 1/ // Thursday 16:00-17:00, Ana and Luka
const LOCKED = /^Ana Petrović$/ // Monday, outcome recorded

describe('the buttons at the bottom of a lesson', () => {
  const buttonsOf = (dialog: Awaited<ReturnType<typeof open>>) =>
    dialog.getAllByRole('button').filter((button) => button.closest('.actions--end'))

  it('are Odustani and a blue Izmeni, with the red cancelling on the left of them', async () => {
    renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    const names = buttonsOf(dialog).map((button) => button.textContent)
    expect(names).toEqual(['Obriši čas', 'Odustani', 'Izmeni'])
    expect(dialog.queryByRole('button', { name: 'Zatvori' })).not.toBeInTheDocument()
    expect(dialog.queryByRole('button', { name: 'Izmeni čas' })).not.toBeInTheDocument()

    // blue: the main button, not the secondary one; red with white letters: the danger one
    const edit = dialog.getByRole('button', { name: 'Izmeni' })
    expect(edit).toHaveClass('button')
    expect(edit).not.toHaveClass('button--secondary')
    expect(dialog.getByRole('button', { name: 'Obriši čas' })).toHaveClass('button--danger')
    expect(dialog.getByRole('button', { name: 'Odustani' })).toHaveClass('button--secondary')
  })

  it('close the dialog with Odustani and open the form with Izmeni', async () => {
    renderTeacher(PATH)
    let dialog = await open(TOMORROW, 'Fizika')
    await userEvent.click(dialog.getByRole('button', { name: 'Odustani' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    dialog = await open(TOMORROW, 'Fizika')
    await userEvent.click(dialog.getByRole('button', { name: 'Izmeni' }))
    await inDialog('Izmena časa')
  })

  it('make the cancelling of a slot red too, and offer no edit for it', async () => {
    renderTeacher(PATH)
    const dialog = await open(/^Slobodan termin/, 'Slobodan termin')
    expect(dialog.getByRole('button', { name: 'Ukloni termin' })).toHaveClass('button--danger')
    expect(dialog.queryByRole('button', { name: 'Izmeni' })).not.toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Odustani' })).toBeInTheDocument()
  })

  it('say nothing about a change that was made, only about one that failed', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TODAY, 'Matematika')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Plaćeno za Ana Petrović' }))
    expect(teacherApi.setPaid).toHaveBeenCalledWith('les-today', 'st-ana', true)
    await waitFor(() =>
      expect(dialog.getByRole('checkbox', { name: 'Plaćeno za Ana Petrović' })).toBeEnabled(),
    )
    expect(dialog.queryByRole('status')).not.toBeInTheDocument()

    teacherApi.failNext('setPaid', new AdminError('network'))
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Plaćeno za Ana Petrović' }))
    expect(await dialog.findByRole('alert')).toBeInTheDocument()
  })
})

describe('looking at a lesson', () => {
  it('shows when and where, and each student with their note', async () => {
    renderTeacher(PATH)
    const dialog = await open(TODAY, 'Matematika')
    expect(dialog.getByText('sre, 4. novembar, 08:00–09:00')).toBeInTheDocument()
    expect(dialog.getByText('Glavna lokacija, Učionica 2')).toBeInTheDocument()
    expect(dialog.getByText('Ana Petrović')).toBeInTheDocument()
    expect(dialog.getByLabelText('Napomena za Ana Petrović')).toHaveValue('Radili razlomke')
  })

  it('tells the teacher who reads the note: the student and the parents', async () => {
    renderTeacher(PATH)
    const dialog = await open(TODAY, 'Matematika')
    expect(dialog.getByText('Napomenu vide učenik i njegovi roditelji.')).toBeInTheDocument()
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
    // the change is not announced: the button just waits for the next one
    await waitFor(() => expect(save).toBeDisabled())
    expect(dialog.queryByText(/Napomena je sačuvana/)).not.toBeInTheDocument()

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
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Održan' })).toBeDisabled())

    await userEvent.click(dialog.getByRole('button', { name: 'Nije održan' }))
    expect(teacherApi.setOutcome).toHaveBeenLastCalledWith('les-today', 'not_held')

    await userEvent.click(await dialog.findByRole('button', { name: 'Obriši ishod' }))
    expect(teacherApi.setOutcome).toHaveBeenLastCalledWith('les-today', null)
    await waitFor(() => expect(dialog.getByRole('button', { name: 'Održan' })).toBeEnabled())
    expect(dialog.queryByText(/Ishod je (upisan|obrisan)/)).not.toBeInTheDocument()
    expect(dialog.queryByRole('status')).not.toBeInTheDocument()
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
    expect(
      dialog.queryByText(/Dan ovog časa je prošao ili je upisan ishod/),
    ).not.toBeInTheDocument()
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši ishod' }))
    expect(teacherApi.setOutcome).toHaveBeenCalledWith('les-locked', null)
  })
})

describe('marking that a student has paid', () => {
  const paidBox = (dialog: ReturnType<typeof within>, name: string) =>
    dialog.getByRole('checkbox', { name: `Plaćeno za ${name}` })

  it('is a box for each student, empty to begin with', async () => {
    renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    expect(paidBox(dialog, 'Ana Petrović')).not.toBeChecked()
    expect(paidBox(dialog, 'Luka Ilić')).not.toBeChecked()
  })

  it('marks one student and leaves the other alone', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    await userEvent.click(paidBox(dialog, 'Luka Ilić'))
    expect(teacherApi.setPaid).toHaveBeenCalledWith('les-tomorrow', 'st-luka', true)
    await waitFor(() => expect(paidBox(dialog, 'Luka Ilić')).toBeChecked())
    expect(paidBox(dialog, 'Ana Petrović')).not.toBeChecked()
    expect(teacherApi.setPaid).toHaveBeenCalledTimes(1)
  })

  it('takes the mark back', async () => {
    const state = seedTeacher()
    for (const lesson of state.lessons) {
      if (lesson.id === 'les-tomorrow') lesson.participants[0].paid = true
    }
    const { teacherApi } = renderTeacher(PATH, { api: createFakeTeacherApi(state) })
    const dialog = await open(TOMORROW, 'Fizika')
    expect(paidBox(dialog, 'Ana Petrović')).toBeChecked()
    await userEvent.click(paidBox(dialog, 'Ana Petrović'))
    expect(teacherApi.setPaid).toHaveBeenCalledWith('les-tomorrow', 'st-ana', false)
    await waitFor(() => expect(paidBox(dialog, 'Ana Petrović')).not.toBeChecked())
  })

  it('can be set on a lesson that is over, and on one that is frozen', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const over = await open(TODAY, 'Matematika')
    await userEvent.click(paidBox(over, 'Ana Petrović'))
    expect(teacherApi.setPaid).toHaveBeenCalledWith('les-today', 'st-ana', true)
  })

  it('says what went wrong, and leaves the box as the database has it', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    teacherApi.failNext('setPaid', new AdminError('PT404', 'the student is not on this lesson'))
    await userEvent.click(paidBox(dialog, 'Luka Ilić'))
    expect(await dialog.findByRole('alert')).toHaveTextContent(
      'Čas ili učenik više ne postoji. Osvežite stranicu.',
    )
    expect(paidBox(dialog, 'Luka Ilić')).not.toBeChecked()
  })

  it('is not asked for a free slot, which has nobody on it', async () => {
    renderTeacher(PATH)
    const dialog = await open(/^Slobodan termin/, 'Slobodan termin')
    expect(dialog.queryByRole('checkbox')).not.toBeInTheDocument()
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

    expect(teacherApi.cancelLesson).toHaveBeenCalledWith('les-tomorrow', null)
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

  it('sends the reason the teacher gives, trimmed, for the people who are told', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši čas' }))
    const confirm = await inDialog('Brisanje časa')
    expect(
      confirm.getByText(/Razlog dobijaju učenici i roditelji u obaveštenju/),
    ).toBeInTheDocument()
    await userEvent.type(confirm.getByLabelText('Razlog (nije obavezan)'), '  Razboleo sam se ')
    await userEvent.click(confirm.getByRole('button', { name: 'Obriši' }))
    expect(teacherApi.cancelLesson).toHaveBeenCalledWith('les-tomorrow', 'Razboleo sam se')
  })

  it('sends no reason when only blanks were typed', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši čas' }))
    const confirm = await inDialog('Brisanje časa')
    await userEvent.type(confirm.getByLabelText('Razlog (nije obavezan)'), '   ')
    await userEvent.click(confirm.getByRole('button', { name: 'Obriši' }))
    expect(teacherApi.cancelLesson).toHaveBeenCalledWith('les-tomorrow', null)
  })

  it('asks for no reason when a free slot is removed: nobody is told', async () => {
    renderTeacher(PATH)
    const dialog = await open(/^Slobodan termin/, 'Slobodan termin')
    await userEvent.click(dialog.getByRole('button', { name: 'Ukloni termin' }))
    const confirm = await inDialog('Uklanjanje termina')
    expect(confirm.queryByLabelText('Razlog (nije obavezan)')).not.toBeInTheDocument()
  })

  it('explains it when the reason is refused as too long', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(TOMORROW, 'Fizika')
    await userEvent.click(dialog.getByRole('button', { name: 'Obriši čas' }))
    const confirm = await inDialog('Brisanje časa')
    teacherApi.failNext('cancelLesson', new AdminError('PT400', 'the reason is too long'))
    await userEvent.click(confirm.getByRole('button', { name: 'Obriši' }))
    expect(await confirm.findByRole('alert')).toHaveTextContent(
      'Razlog je predugačak (najviše 200 znakova).',
    )
  })

  it('removes a free slot', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(/^Slobodan termin/, 'Slobodan termin')
    await userEvent.click(dialog.getByRole('button', { name: 'Ukloni termin' }))
    await userEvent.click(
      (await inDialog('Uklanjanje termina')).getByRole('button', { name: 'Ukloni' }),
    )
    expect(teacherApi.cancelLesson).toHaveBeenCalledWith('slot-open', null)
    expect(await screen.findByRole('status')).toHaveTextContent('Termin je uklonjen.')
  })

  it('cancels a booked slot, which becomes free again instead of disappearing', async () => {
    const state = seedTeacher()
    const booked = {
      ...state.lessons.find((l) => l.id === 'slot-open')!,
      status: 'confirmed' as const,
      participants: [{ studentId: 'st-luka', note: null, paid: false }],
    }
    const lessons = state.lessons.map((l) => (l.id === 'slot-open' ? booked : l))
    const { teacherApi } = renderTeacher(PATH, { api: createFakeTeacherApi({ lessons }) })
    const dialog = await open(/^Luka Ilić$/, 'Matematika')
    await userEvent.click(dialog.getByRole('button', { name: 'Otkaži čas' }))
    const confirm = await inDialog('Otkazivanje časa')
    expect(confirm.getByText(/ponovo postaje slobodan/)).toBeInTheDocument()
    await userEvent.type(confirm.getByLabelText('Razlog (nije obavezan)'), 'Prezauzet sam')
    await userEvent.click(confirm.getByRole('button', { name: 'Otkaži čas' }))

    expect(teacherApi.cancelLesson).toHaveBeenCalledWith('slot-open', 'Prezauzet sam')
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Čas je otkazan, termin je ponovo slobodan.',
    )
    expect(await block(/^Slobodan termin$/)).toBeInTheDocument()
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

  it('declines it after asking for a reason, which is optional', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(/^Na čekanju/, 'Na čekanju')
    await userEvent.click(dialog.getByRole('button', { name: 'Odbij' }))
    const decline = await inDialog('Odbijanje zahteva')
    expect(
      decline.getByText(/Razlog dobijaju učenik i roditelji u obaveštenju/),
    ).toBeInTheDocument()
    await userEvent.type(decline.getByLabelText('Razlog (nije obavezan)'), ' Termin nije slobodan ')
    await userEvent.click(decline.getByRole('button', { name: 'Odbij zahtev' }))
    expect(teacherApi.declineBooking).toHaveBeenCalledWith(
      'booking-pending',
      'Termin nije slobodan',
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Zahtev je odbijen, termin je ponovo slobodan.',
    )
  })

  it('declines it without a reason when none is given', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(/^Na čekanju/, 'Na čekanju')
    await userEvent.click(dialog.getByRole('button', { name: 'Odbij' }))
    await userEvent.click(
      (await inDialog('Odbijanje zahteva')).getByRole('button', { name: 'Odbij zahtev' }),
    )
    expect(teacherApi.declineBooking).toHaveBeenCalledWith('booking-pending', null)
  })

  it('comes back to the booking when the teacher thinks better of declining it', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const dialog = await open(/^Na čekanju/, 'Na čekanju')
    await userEvent.click(dialog.getByRole('button', { name: 'Odbij' }))
    await userEvent.click(
      (await inDialog('Odbijanje zahteva')).getByRole('button', { name: 'Odustani' }),
    )
    expect(await inDialog('Na čekanju')).toBeTruthy()
    expect(teacherApi.declineBooking).not.toHaveBeenCalled()
  })
})

describe('editing a lesson', () => {
  const edit = async (name: string | RegExp = TOMORROW, title = 'Fizika') => {
    const dialog = await open(name, title)
    await userEvent.click(dialog.getByRole('button', { name: 'Izmeni' }))
    return inDialog('Izmena časa')
  }

  it('starts from the lesson as it is', async () => {
    renderTeacher(PATH)
    const form = await edit()
    expect(form.getByLabelText('Predmet')).toHaveValue('s-fiz')
    expect(form.getByLabelText('Učionica')).toHaveValue('r-1')
    expect(form.getByLabelText('Datum')).toHaveValue('05.11.2026')
    expect(timeOf(form, 'Početak')).toBe('16:00')
    expect(timeOf(form, 'Kraj')).toBe('17:00')
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
    setTime(form, 'Početak', '16:30')
    setTime(form, 'Kraj', '17:30')
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
    setDate(form, 'Datum', '2026-11-03')
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
    expect(form.queryByText(/Dan ovog časa je prošao ili je upisan ishod/)).not.toBeInTheDocument()
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
      participants: [{ studentId: 'st-luka', note: null, paid: false }],
    }
    const lessons = state.lessons.map((l) => (l.id === 'slot-open' ? booked : l))
    const { teacherApi } = renderTeacher(PATH, { api: createFakeTeacherApi({ lessons }) })
    const form = await edit(/^Luka Ilić$/, 'Matematika')
    expect(form.getByLabelText('Kraj')).toBeDisabled()
    setTime(form, 'Početak', '19:00')
    expect(timeOf(form, 'Kraj')).toBe('20:00')
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
    setDate(form, 'Datum', '2026-11-06')
    setTime(form, 'Početak', '15:00')
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

  it('wants a time ahead', async () => {
    const { teacherApi } = renderTeacher(PATH)
    const form = await openSlot()
    setDate(form, 'Datum', '2026-11-04')
    setTime(form, 'Početak', '10:00') // before now (11:00)
    await userEvent.click(form.getByRole('button', { name: 'Objavi' }))
    expect(form.getByRole('alert')).toHaveTextContent('Slobodan termin mora biti u budućnosti.')

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
