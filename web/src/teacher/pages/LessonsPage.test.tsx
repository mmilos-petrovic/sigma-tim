import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { createFakeTeacherApi, seedTeacher, TEST_NOW } from '../../test/fakeTeacherApi'
import { inDialog, page, renderTeacher } from '../../test/renderTeacher'
import type { LessonRow } from '../teacherApi'

vi.mock('../calendar/WeekCalendar', async () => import('../../test/mockCalendar'))

const PATH = '/moj-raspored/casovi'
const upcoming = () => screen.findByRole('list', { name: 'Predstojeći časovi' })
const past = () => screen.findByRole('list', { name: 'Prošli časovi' })
const rows = (list: HTMLElement) => within(list).getAllByRole('listitem')
const texts = (list: HTMLElement) => rows(list).map((row) => row.textContent ?? '')

const at = (hours: number) => new Date(TEST_NOW.getTime() + hours * 3_600_000).toISOString()

/** `count` lessons of Ana, one an hour apart, ending before the seeded ones start, the newest first by number. */
function history(count: number, studentId = 'st-ana'): LessonRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `old-${i}`,
    subjectId: 's-mat',
    locationId: 'l-main',
    roomId: null,
    start: at(-100 - i * 2),
    end: at(-99 - i * 2),
    status: 'confirmed' as const,
    origin: 'teacher' as const,
    outcome: 'held' as const,
    participants: [{ studentId, note: null, paid: true }],
  }))
}

describe('the teacher’s list of lessons', () => {
  it('is a link of its own, right under the students', async () => {
    renderTeacher('/moj-raspored')
    await page('Moj raspored')
    const nav = screen.getByRole('navigation', { name: 'Glavna navigacija' })
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)
    expect(links.indexOf('Časovi')).toBe(links.indexOf('Učenici') + 1)
    expect(within(nav).getByRole('link', { name: 'Časovi' })).toHaveAttribute(
      'href',
      '/moj-raspored/casovi',
    )
  })

  it('shows the lessons still to come first, the soonest on top, and leaves free slots out', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    const ahead = texts(await upcoming())
    expect(ahead).toHaveLength(2)
    expect(ahead[0]).toContain('Luka Ilić') // the late booking, 11:00 UTC tomorrow
    expect(ahead[1]).toContain('Ana Petrović, Luka Ilić') // tomorrow 15:00 UTC
    expect(document.body.textContent).not.toContain('Slobodan termin')
  })

  it('shows the lessons that are over after them, the newest on top', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    const behind = texts(await past())
    expect(behind).toHaveLength(2)
    expect(behind[0]).toContain('Matematika') // today, over
    expect(behind[1]).toContain('Matematika') // Monday
    expect(behind[0]).toContain('sre, 4. novembar')
    expect(behind[1]).toContain('pon, 2. novembar')
  })

  describe('what is the same for every lesson of the teacher', () => {
    const rowsOf = async (state: ReturnType<typeof seedTeacher>) => {
      renderTeacher(PATH, { api: createFakeTeacherApi(state) })
      await page('Časovi')
      return texts(await past())
    }

    it('is on each row while the teacher has more than one subject and one location', async () => {
      const behind = await rowsOf(seedTeacher())
      expect(behind[0]).toContain('Matematika')
      expect(behind[0]).toContain('Glavna lokacija')
    })

    it('leaves the subject out when the teacher has only one', async () => {
      const state = seedTeacher()
      state.reference.subjects = [{ id: 's-mat', name: 'Matematika' }]
      const behind = await rowsOf(state)
      expect(behind[0]).not.toContain('Matematika')
      expect(behind[0]).toContain('Glavna lokacija')
    })

    it('leaves the location out when the teacher may use only one', async () => {
      const state = seedTeacher()
      state.reference.ownLocationIds = ['l-main']
      const behind = await rowsOf(state)
      expect(behind[0]).not.toContain('Glavna lokacija')
      expect(behind[0]).toContain('Matematika')
      // the room is not the same for every lesson: it stays
      expect(behind.join(' ')).toMatch(/Učionica \d/)
    })

    it('leaves both out, and keeps the day, the time, the students and the room', async () => {
      const state = seedTeacher()
      state.reference.subjects = [{ id: 's-mat', name: 'Matematika' }]
      state.reference.ownLocationIds = ['l-main']
      const behind = await rowsOf(state)
      expect(behind[0]).not.toMatch(/Matematika|Glavna lokacija|·/)
      expect(behind[0]).toContain('sre, 4. novembar')
      expect(behind[0]).toContain('Ana Petrović')
      expect(behind[0]).toMatch(/Učionica \d/)
    })
  })

  it('writes on each row the day, the time, the students, the subject and the place', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    const tomorrow = rows(await upcoming())[1]
    expect(tomorrow).toHaveTextContent('čet, 5. novembar')
    expect(tomorrow).toHaveTextContent('16:00–17:00')
    expect(tomorrow).toHaveTextContent('Ana Petrović, Luka Ilić')
    expect(tomorrow).toHaveTextContent('Fizika')
    expect(tomorrow).toHaveTextContent('Glavna lokacija')
    expect(tomorrow).toHaveTextContent('Učionica 1')
  })

  it('marks a booking that waits, a lesson that is over without an outcome, and what was held', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    expect(rows(await upcoming())[0]).toHaveTextContent('Čeka vaš odgovor')
    const behind = rows(await past())
    expect(behind[0]).toHaveTextContent('Ishod nije upisan')
    expect(behind[1]).toHaveTextContent('Održan')
  })

  it('says which lessons were not paid, and nothing for those still to come', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    for (const row of rows(await past())) expect(row).toHaveTextContent('Nije plaćeno')
    for (const row of rows(await upcoming())) expect(row.textContent).not.toMatch(/plać/i)
  })

  it('says that a lesson was paid, also in advance, and how many of a group', async () => {
    const state = seedTeacher()
    for (const lesson of state.lessons) {
      if (lesson.id === 'les-tomorrow') lesson.participants[0].paid = true
      if (lesson.id === 'les-locked') lesson.participants[0].paid = true
    }
    renderTeacher(PATH, { api: createFakeTeacherApi(state) })
    await page('Časovi')
    expect(rows(await upcoming())[1]).toHaveTextContent('Plaćeno 1 od 2')
    expect(rows(await past())[1]).toHaveTextContent('Plaćeno')
    expect(rows(await past())[1].textContent).not.toMatch(/Nije plaćeno|od/)
  })

  it('says there is nothing yet for a teacher with no lessons', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi({ lessons: [] }) })
    await page('Časovi')
    expect(await screen.findByText('Još nemate časova.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('explains a failure and offers another try', async () => {
    const api = createFakeTeacherApi()
    api.failNext('listUpcoming', new AdminError('network'))
    renderTeacher(PATH, { api })
    expect(await screen.findByText(/Nema veze sa serverom/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await upcoming()).toBeInTheDocument()
  })
})

describe('working on a lesson from the list', () => {
  it('opens the same dialog as the calendar does, with the outcome, payment and notes', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    await userEvent.click(rows(await upcoming())[1].querySelector('button')!)
    const dialog = await inDialog('Fizika')
    expect(dialog.getByRole('checkbox', { name: 'Plaćeno za Ana Petrović' })).toBeInTheDocument()
    expect(dialog.getByLabelText('Napomena za Luka Ilić')).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Izmeni čas' })).toBeInTheDocument()
  })

  it('records an outcome, and the row says so', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await page('Časovi')
    await userEvent.click(rows(await past())[0].querySelector('button')!)
    const dialog = await inDialog('Matematika')
    await userEvent.click(dialog.getByRole('button', { name: 'Održan' }))
    expect(teacherApi.setOutcome).toHaveBeenCalledWith('les-today', 'held')
    await userEvent.click(dialog.getByRole('button', { name: 'Zatvori' }))
    await waitFor(async () => expect(rows(await past())[0]).toHaveTextContent('Održan'))
  })

  it('marks a payment, and the row says so after the dialog is closed', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await page('Časovi')
    await userEvent.click(rows(await past())[0].querySelector('button')!)
    const dialog = await inDialog('Matematika')
    await userEvent.click(dialog.getByRole('checkbox', { name: 'Plaćeno za Ana Petrović' }))
    expect(teacherApi.setPaid).toHaveBeenCalledWith('les-today', 'st-ana', true)
    await userEvent.click(dialog.getByRole('button', { name: 'Zatvori' }))
    await waitFor(async () => expect(rows(await past())[0]).toHaveTextContent('Plaćeno'))
    expect(rows(await past())[0].textContent).not.toContain('Nije plaćeno')
  })

  it('changes the lesson from there, and shows the result in the list', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await page('Časovi')
    await userEvent.click(rows(await upcoming())[1].querySelector('button')!)
    await userEvent.click((await inDialog('Fizika')).getByRole('button', { name: 'Izmeni čas' }))
    const form = await inDialog('Izmena časa')
    await userEvent.selectOptions(form.getByLabelText('Učionica'), 'Učionica 2')
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    expect(teacherApi.updateLesson).toHaveBeenCalledWith('les-tomorrow', { roomId: 'r-2' })
    expect(await screen.findByRole('status')).toHaveTextContent('Čas je izmenjen.')
    expect(rows(await upcoming())[1]).toHaveTextContent('Učionica 2')
  })

  it('deletes a lesson, which then leaves the list', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    await userEvent.click(rows(await upcoming())[1].querySelector('button')!)
    await userEvent.click((await inDialog('Fizika')).getByRole('button', { name: 'Obriši čas' }))
    await userEvent.click((await inDialog('Brisanje časa')).getByRole('button', { name: 'Obriši' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Čas je obrisan.')
    await waitFor(async () => expect(rows(await upcoming())).toHaveLength(1))
  })

  it('declines a booking from there, with a reason', async () => {
    const { teacherApi } = renderTeacher(PATH)
    await page('Časovi')
    await userEvent.click(rows(await upcoming())[0].querySelector('button')!)
    await userEvent.click((await inDialog('Na čekanju')).getByRole('button', { name: 'Odbij' }))
    const decline = await inDialog('Odbijanje zahteva')
    await userEvent.type(decline.getByLabelText('Razlog (nije obavezan)'), 'Nisam u gradu')
    await userEvent.click(decline.getByRole('button', { name: 'Odbij zahtev' }))
    expect(teacherApi.declineBooking).toHaveBeenCalledWith('booking-pending', 'Nisam u gradu')
    await waitFor(async () => expect(rows(await upcoming())).toHaveLength(1))
  })
})

describe('searching by student', () => {
  it('keeps the lessons of the student who was typed, in both lists', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    await userEvent.type(await screen.findByLabelText('Pretraga po učeniku'), 'luka')
    await waitFor(async () => expect(rows(await upcoming())).toHaveLength(2))
    expect(screen.queryByRole('list', { name: 'Prošli časovi' })).not.toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Pretraga po učeniku'))
    await userEvent.type(screen.getByLabelText('Pretraga po učeniku'), 'ana')
    await waitFor(async () => expect(rows(await upcoming())).toHaveLength(1))
    expect(rows(await past())).toHaveLength(2)
  })

  it('does not mind case or diacritics', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    await userEvent.type(await screen.findByLabelText('Pretraga po učeniku'), 'PETROVIC')
    await waitFor(async () => expect(rows(await past())).toHaveLength(2))
  })

  it('says so when nobody matches', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    await userEvent.type(await screen.findByLabelText('Pretraga po učeniku'), 'zzz')
    expect(await screen.findByText('Nema časova koji odgovaraju.')).toBeInTheDocument()
  })

  it('looks through all the past lessons, not only the ones that are shown', async () => {
    const state = seedTeacher()
    state.lessons = [
      ...state.lessons,
      ...history(25, 'st-ana'),
      ...history(1, 'st-luka').map((l) => ({
        ...l,
        id: 'very-old-luka',
        start: at(-5000),
        end: at(-4999),
      })),
    ]
    renderTeacher(PATH, { api: createFakeTeacherApi(state) })
    await page('Časovi')
    expect(await screen.findByRole('button', { name: 'Prikaži starije' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Pretraga po učeniku'), 'luka')
    await waitFor(async () => expect(rows(await past())).toHaveLength(1))
    expect(screen.queryByRole('button', { name: 'Prikaži starije' })).not.toBeInTheDocument()
  })
})

describe('only the lessons that were not paid for', () => {
  const onlyUnpaid = () => screen.findByRole('checkbox', { name: 'Samo nenaplaćeni' })

  it('keeps the lessons that took place, or may have, and somebody has not paid; the coming ones go', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    await userEvent.click(await onlyUnpaid())
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'Predstojeći časovi' })).not.toBeInTheDocument(),
    )
    expect(rows(await past())).toHaveLength(2)
  })

  it('lets a lesson go once it is paid for', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    await userEvent.click(await onlyUnpaid())
    await userEvent.click(rows(await past())[0].querySelector('button')!)
    await userEvent.click(
      (await inDialog('Matematika')).getByRole('checkbox', { name: 'Plaćeno za Ana Petrović' }),
    )
    await userEvent.click((await inDialog('Matematika')).getByRole('button', { name: 'Zatvori' }))
    await waitFor(async () => expect(rows(await past())).toHaveLength(1))
  })

  it('does not keep a lesson that was not held', async () => {
    const state = seedTeacher()
    for (const lesson of state.lessons) if (lesson.id === 'les-locked') lesson.outcome = 'not_held'
    renderTeacher(PATH, { api: createFakeTeacherApi(state) })
    await page('Časovi')
    await userEvent.click(await onlyUnpaid())
    await waitFor(async () => expect(rows(await past())).toHaveLength(1))
    expect(rows(await past())[0]).toHaveTextContent('Matematika')
  })

  it('goes together with the search, and says so when nothing is left', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    await userEvent.click(await onlyUnpaid())
    await userEvent.type(screen.getByLabelText('Pretraga po učeniku'), 'luka')
    expect(await screen.findByText('Nema časova koji odgovaraju.')).toBeInTheDocument()
  })

  it('looks through all the past lessons too', async () => {
    const state = seedTeacher()
    const unpaid = history(1, 'st-luka').map((l) => ({
      ...l,
      id: 'very-old-unpaid',
      start: at(-5000),
      end: at(-4999),
      participants: [{ studentId: 'st-luka', note: null, paid: false }],
    }))
    state.lessons = [...state.lessons, ...history(25, 'st-ana'), ...unpaid]
    renderTeacher(PATH, { api: createFakeTeacherApi(state) })
    await page('Časovi')
    await userEvent.click(await onlyUnpaid())
    await waitFor(async () => expect(rows(await past())).toHaveLength(3))
  })
})

describe('older lessons', () => {
  const manyOld = () => {
    const state = seedTeacher()
    state.lessons = [...state.lessons, ...history(25)]
    return createFakeTeacherApi(state)
  }

  it('shows the 20 newest at first, and 20 more on each "Prikaži starije"', async () => {
    renderTeacher(PATH, { api: manyOld() })
    await page('Časovi')
    expect(rows(await past())).toHaveLength(20)
    await userEvent.click(screen.getByRole('button', { name: 'Prikaži starije' }))
    await waitFor(async () => expect(rows(await past())).toHaveLength(27)) // 2 seeded + 25
    expect(screen.queryByRole('button', { name: 'Prikaži starije' })).not.toBeInTheDocument()
  })

  it('has no such button when everything is shown', async () => {
    renderTeacher(PATH)
    await page('Časovi')
    await past()
    expect(screen.queryByRole('button', { name: 'Prikaži starije' })).not.toBeInTheDocument()
  })

  it('offers no "Prikaži starije" while searching, even when there is more than a search reads', async () => {
    const state = seedTeacher()
    state.lessons = [...state.lessons, ...history(1005)]
    renderTeacher(PATH, { api: createFakeTeacherApi(state) })
    await page('Časovi')
    expect(await screen.findByRole('button', { name: 'Prikaži starije' })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Pretraga po učeniku'), 'Ana')
    await waitFor(async () => expect(rows(await past())).toHaveLength(1000))
    expect(screen.queryByRole('button', { name: 'Prikaži starije' })).not.toBeInTheDocument()
  }, 30_000)

  it('keeps what is on screen while the older lessons load', async () => {
    const api = manyOld()
    renderTeacher(PATH, { api })
    await page('Časovi')
    await past()
    const release = api.hold('listPast')
    await userEvent.click(screen.getByRole('button', { name: 'Prikaži starije' }))
    expect(rows(await past())).toHaveLength(20)
    release()
    await waitFor(async () => expect(rows(await past())).toHaveLength(27))
  })
})
