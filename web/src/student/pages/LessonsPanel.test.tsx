import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { at, createFakeStudentApi, lessonOf, seedStudent } from '../../test/fakeStudentApi'
import { inDialog, page, renderStudent } from '../../test/renderStudent'
import { formatDay, formatRange } from '../../teacher/format'

const PATH = '/ucenik'

afterEach(() => window.localStorage.clear())

const upcoming = () => screen.findByRole('list', { name: 'Predstojeći časovi' })
const past = () => screen.findByRole('list', { name: 'Prošli časovi' })
const texts = (list: HTMLElement) =>
  within(list)
    .getAllByRole('listitem')
    .map((li) => li.textContent)

/** The row of the lesson that starts and ends at these hours from the test clock. */
const row = (start: number, end: number) =>
  screen.findByRole('button', {
    name: new RegExp(`${formatDay(at(start))}.*${formatRange(at(start), at(end))}`),
  })

async function open(start: number, end: number) {
  const button = await row(start, end)
  if (button.getAttribute('aria-expanded') !== 'true') await userEvent.click(button)
  return button
}

describe('the list of lessons', () => {
  it('is the home of a student, with upcoming lessons first (nearest on top) and then past ones (newest on top)', async () => {
    renderStudent(PATH)
    await page('Moji časovi')

    const ahead = texts(await upcoming())
    expect(ahead).toHaveLength(2)
    expect(ahead[0]).toContain('Fizika') // in 6 hours, waiting for the teacher
    expect(ahead[1]).toContain('Matematika') // in 30 hours

    const behind = texts(await past())
    expect(behind).toHaveLength(4)
    expect(behind[0]).toContain('Održan') // 30 hours ago
    expect(behind[1]).toContain('Nije održan') // 80 hours ago
    expect(behind[3]).toContain('Nije potvrđen') // 200 hours ago, the teacher never answered
  })

  it('shows only the basics of a closed row: date, time, subject and place', async () => {
    renderStudent(PATH)
    const button = await row(30, 31)
    expect(button).toHaveTextContent('Matematika')
    expect(button).toHaveTextContent('Centar')
    expect(button).toHaveTextContent('Učionica 1')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Ponesite zbirku zadataka.')).not.toBeInTheDocument()
    expect(screen.queryByText(/Napomena nastavnika/)).not.toBeInTheDocument()
  })

  it('names the state of each lesson', async () => {
    renderStudent(PATH)
    const ahead = texts(await upcoming())
    expect(ahead[0]).toContain('Čeka potvrdu')
    expect(ahead[1]).toContain('Potvrđen')
    const behind = texts(await past())
    expect(behind[0]).toContain('Održan')
    expect(behind[1]).toContain('Nije održan')
    expect(behind[3]).toContain('Nije potvrđen')
  })

  it('tells nothing about an outcome the teacher has not entered', async () => {
    renderStudent(PATH)
    const behind = texts(await past())
    // the lesson 120 hours ago has no outcome: its row is just the facts
    expect(behind[2]).not.toMatch(/Održan|Nije održan|Nije potvrđen|ishod|unos|čeka/i)
    await open(-120, -119)
    expect(screen.queryByText(/ishod|unos/i)).not.toBeInTheDocument()
  })

  it('marks a lesson that was paid for, only once it is over, and never says one was not paid', async () => {
    const state = seedStudent()
    for (const lesson of state.lessons) {
      if (lesson.id === 'l-held' || lesson.id === 'l-next') lesson.paid = true // a past one, and one paid in advance
    }
    renderStudent(PATH, { api: createFakeStudentApi(state) })
    const ahead = texts(await upcoming())
    const behind = texts(await past())
    expect(behind[0]).toContain('Plaćen') // the held lesson, paid
    expect(behind[1]).not.toMatch(/Plaćen|Neplaćen/i) // not held, not paid: nothing to say
    expect(behind[2]).not.toMatch(/Plaćen|Neplaćen/i)
    expect(ahead[1]).not.toContain('Plaćen') // paid in advance, but not over
    expect(document.body.textContent).not.toMatch(/Neplaćen|Nije plaćen/i)
  })

  it('opens a row on a click to show the teacher, phone, address, room and note', async () => {
    renderStudent(PATH)
    const button = await open(30, 31)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const region = document.getElementById(
      button.getAttribute('aria-controls') ?? '',
    ) as HTMLElement
    expect(within(region).getByText('Ana Nikolić')).toBeInTheDocument()
    const phone = await within(region).findByRole('link', { name: '064 1110 000' })
    expect(phone).toHaveAttribute('href', 'tel:+381641110000')
    const map = within(region).getByRole('link', { name: /Knez Mihailova 1, Beograd/ })
    expect(map).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
    expect(map).toHaveAttribute('target', '_blank')
    expect(map).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(within(region).getByText('Ponesite zbirku zadataka.')).toBeInTheDocument()
    expect(within(region).getByRole('heading', { name: 'Napomena nastavnika' })).toBeInTheDocument()
  })

  it('closes it again on a second click', async () => {
    renderStudent(PATH)
    const button = await open(30, 31)
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
  })

  it('shows the note of a lesson that was not held too, and no note section when there is none', async () => {
    renderStudent(PATH)
    await open(-80, -79)
    expect(await screen.findByText('Čas je otkazan zbog bolesti nastavnika.')).toBeInTheDocument()
    await open(-120, -119)
    // only the first lesson has a note section
    expect(screen.getAllByRole('heading', { name: 'Napomena nastavnika' })).toHaveLength(1)
  })

  it('leaves out the phone line when the teacher has no number', async () => {
    renderStudent(PATH, { api: createFakeStudentApi({ phones: {} }) })
    await open(30, 31)
    expect(await screen.findByText('Ana Nikolić')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^\+/ })).not.toBeInTheDocument()
  })

  it('says who taught when the name is not shown by the database', async () => {
    const api = createFakeStudentApi({
      lessons: [lessonOf({ id: 'x', teacherName: null, start: at(30), end: at(31) })],
    })
    renderStudent(PATH, { api })
    await open(30, 31)
    expect(await screen.findByText('Nastavnik nije poznat')).toBeInTheDocument()
  })
})

describe('notes not yet read', () => {
  it('marks a lesson with a note the person has not opened, until it is opened', async () => {
    renderStudent(PATH)
    const button = await row(30, 31)
    expect(within(button).getByText('Nova napomena')).toBeInTheDocument()
    await userEvent.click(button)
    expect(within(button).queryByText('Nova napomena')).not.toBeInTheDocument()
  })

  it('does not mark a lesson without a note', async () => {
    renderStudent(PATH)
    const button = await row(-120, -119)
    expect(within(button).queryByText('Nova napomena')).not.toBeInTheDocument()
  })

  it('remembers what was read, on this device', async () => {
    const first = renderStudent(PATH)
    await userEvent.click(await row(30, 31))
    first.unmount()
    renderStudent(PATH)
    const button = await row(30, 31)
    expect(within(button).queryByText('Nova napomena')).not.toBeInTheDocument()
  })

  it('marks it again when the teacher edits the note', async () => {
    const first = renderStudent(PATH)
    await userEvent.click(await row(30, 31))
    first.unmount()
    const state = seedStudent()
    state.lessons[0] = { ...state.lessons[0], note: 'Ponesite zbirku i svesku.' }
    renderStudent(PATH, { api: createFakeStudentApi(state) })
    expect(within(await row(30, 31)).getByText('Nova napomena')).toBeInTheDocument()
  })
})

describe('older lessons', () => {
  const manyPast = () => {
    const state = seedStudent()
    state.lessons = Array.from({ length: 25 }, (_, i) =>
      lessonOf({
        id: `p${i}`,
        start: at(-24 * (i + 1)),
        end: at(-24 * (i + 1) + 1),
        outcome: 'held',
      }),
    )
    return createFakeStudentApi(state)
  }

  it('shows the latest twenty and adds the rest on request', async () => {
    renderStudent(PATH, { api: manyPast() })
    expect(within(await past()).getAllByRole('listitem')).toHaveLength(20)
    await userEvent.click(screen.getByRole('button', { name: 'Prikaži starije' }))
    await waitFor(() =>
      expect(
        within(screen.getByRole('list', { name: 'Prošli časovi' })).getAllByRole('listitem'),
      ).toHaveLength(25),
    )
    expect(screen.queryByRole('button', { name: 'Prikaži starije' })).not.toBeInTheDocument()
  })

  it('has no such button when everything is shown', async () => {
    renderStudent(PATH)
    await past()
    expect(screen.queryByRole('button', { name: 'Prikaži starije' })).not.toBeInTheDocument()
  })
})

describe('empty and failing lists', () => {
  it('says there is nothing to show', async () => {
    renderStudent(PATH, { api: createFakeStudentApi({ lessons: [] }) })
    expect(await screen.findByText('Nema zakazanih časova.')).toBeInTheDocument()
    expect(screen.getByText('Još nema prošlih časova.')).toBeInTheDocument()
  })

  it('points to the free slots when there are no lessons ahead', async () => {
    renderStudent(PATH, { api: createFakeStudentApi({ lessons: [] }) })
    const link = await screen.findByRole('link', { name: 'Pogledajte slobodne termine.' })
    expect(link).toHaveAttribute('href', '/ucenik/termini')
  })

  it('does not point to free slots for a student without a teacher', async () => {
    const api = createFakeStudentApi({
      records: [{ id: 'st-x', name: 'Sava Test', teacherId: null, teacherName: null }],
      lessons: [],
    })
    renderStudent(PATH, { api })
    await screen.findByText('Nema zakazanih časova.')
    expect(screen.queryByRole('link', { name: /slobodne termine/ })).not.toBeInTheDocument()
  })

  it('explains a failure and offers another try', async () => {
    const api = createFakeStudentApi()
    api.failNext('listUpcoming', new AdminError('network'))
    renderStudent(PATH, { api })
    expect(await screen.findByText(/Nema veze sa serverom/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await upcoming()).toBeInTheDocument()
  })
})

describe('cancelling', () => {
  it('asks first, says what happens and then removes the lesson', async () => {
    const api = createFakeStudentApi()
    renderStudent(PATH, { api })
    await open(30, 31)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži čas' }))
    const dlg = await inDialog('Otkaži čas')
    expect(dlg.getByText(/Ako na času ima još učenika, za njih čas ostaje/)).toBeInTheDocument()
    expect(dlg.queryByText(/manje od 12 sati/)).not.toBeInTheDocument()
    await userEvent.click(dlg.getByRole('button', { name: 'Otkaži čas' }))

    expect(await screen.findByText('Čas je otkazan.')).toBeInTheDocument()
    expect(api.calls.cancelLesson).toHaveBeenCalledWith('l-next', null)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(texts(await upcoming())).toHaveLength(1)
  })

  it('offers an optional reason, which goes to the teacher with the cancellation', async () => {
    const api = createFakeStudentApi()
    renderStudent(PATH, { api })
    await open(30, 31)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži čas' }))
    const dlg = await inDialog('Otkaži čas')
    expect(dlg.getByText(/Razlog dobija nastavnik u obaveštenju/)).toBeInTheDocument()
    await userEvent.type(dlg.getByLabelText('Razlog (nije obavezan)'), '  Bolestan sam ')
    await userEvent.click(dlg.getByRole('button', { name: 'Otkaži čas' }))
    expect(api.calls.cancelLesson).toHaveBeenCalledWith('l-next', 'Bolestan sam')
  })

  it('explains it when the reason is refused as too long', async () => {
    const api = createFakeStudentApi()
    renderStudent(PATH, { api })
    await open(30, 31)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži čas' }))
    api.failNext('cancelLesson', new AdminError('PT400', 'the reason is too long'))
    await userEvent.click(
      (await inDialog('Otkaži čas')).getByRole('button', { name: 'Otkaži čas' }),
    )
    expect(
      await screen.findByText('Razlog je predugačak (najviše 200 znakova).'),
    ).toBeInTheDocument()
  })

  it('changes nothing when the person backs out', async () => {
    const api = createFakeStudentApi()
    renderStudent(PATH, { api })
    await open(30, 31)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži čas' }))
    await userEvent.click((await inDialog('Otkaži čas')).getByRole('button', { name: 'Odustani' }))
    expect(api.calls.cancelLesson).not.toHaveBeenCalled()
    expect(texts(await upcoming())).toHaveLength(2)
  })

  it('says a booked slot becomes free again and puts it back among the free slots', async () => {
    const api = createFakeStudentApi()
    renderStudent(PATH, { api })
    await open(6, 7)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži rezervaciju' }))
    const dlg = await inDialog('Otkaži rezervaciju')
    expect(dlg.getByText(/Termin će ponovo postati slobodan/)).toBeInTheDocument()
    await userEvent.click(dlg.getByRole('button', { name: 'Otkaži rezervaciju' }))
    expect(await screen.findByText('Rezervacija je otkazana.')).toBeInTheDocument()
    expect(api.state.slots.some((s) => s.id === 'l-waiting')).toBe(true)
  })

  it('warns inside the last 12 hours, with the teacher’s number, and still allows it', async () => {
    const api = createFakeStudentApi()
    renderStudent(PATH, { api })
    await open(6, 7)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži rezervaciju' }))
    const dlg = await inDialog('Otkaži rezervaciju')
    expect(dlg.getByText(/Termin počinje za manje od 12 sati/)).toBeInTheDocument()
    expect(await dlg.findByRole('link', { name: '064 1110 000' })).toBeInTheDocument()
    await userEvent.click(dlg.getByRole('button', { name: 'Otkaži rezervaciju' }))
    expect(api.calls.cancelLesson).toHaveBeenCalledWith('l-waiting', null)
  })

  it('warns without a number when the teacher has none', async () => {
    renderStudent(PATH, { api: createFakeStudentApi({ phones: {} }) })
    await open(6, 7)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži rezervaciju' }))
    const dlg = await inDialog('Otkaži rezervaciju')
    expect(dlg.getByText(/Termin počinje za manje od 12 sati/)).toBeInTheDocument()
    expect(dlg.queryByRole('link')).not.toBeInTheDocument()
  })

  it('offers no cancelling once a lesson has started or is over', async () => {
    const state = seedStudent()
    state.lessons.push(lessonOf({ id: 'l-now', start: at(-0.5), end: at(0.5) }))
    renderStudent(PATH, { api: createFakeStudentApi(state) })
    await open(-0.5, 0.5)
    await open(-30, -29)
    expect(screen.queryByRole('button', { name: /^Otkaži/ })).not.toBeInTheDocument()
  })

  it('explains a lesson that started in the meantime', async () => {
    const api = createFakeStudentApi()
    renderStudent(PATH, { api })
    await open(30, 31)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži čas' }))
    api.failNext('cancelLesson', new AdminError('PT409', 'lesson already started'))
    await userEvent.click(
      (await inDialog('Otkaži čas')).getByRole('button', { name: 'Otkaži čas' }),
    )
    expect(await screen.findByText('Čas je već počeo i ne može da se otkaže.')).toBeInTheDocument()
  })

  it('explains a lesson the teacher already removed and refreshes the list', async () => {
    const api = createFakeStudentApi()
    renderStudent(PATH, { api })
    await open(30, 31)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži čas' }))
    api.state.lessons = api.state.lessons.filter((l) => l.id !== 'l-next')
    await userEvent.click(
      (await inDialog('Otkaži čas')).getByRole('button', { name: 'Otkaži čas' }),
    )
    expect(await screen.findByText(/Čas više ne postoji/)).toBeInTheDocument()
    await userEvent.click((await inDialog('Otkaži čas')).getByRole('button', { name: 'Odustani' }))
    await waitFor(async () => expect(texts(await upcoming())).toHaveLength(1))
  })
})

describe('bookings that disappear', () => {
  const stored = JSON.stringify({
    'l-declined': { start: at(8), subject: 'Hemija' },
  })

  const render = () => {
    window.localStorage.setItem('sigma.watched.p-student.st-marko', stored)
    return renderStudent(PATH)
  }

  it('tells the person that a booking that waited for the teacher is gone', async () => {
    render()
    expect(
      await screen.findByText(/Nastavnik je odbio ili je uklonio termin: Hemija/),
    ).toBeInTheDocument()
  })

  it('keeps telling until the person dismisses it, and then forgets it', async () => {
    const first = render()
    await screen.findByText(/Nastavnik je odbio ili je uklonio termin/)
    first.unmount()
    renderStudent(PATH)
    await screen.findByText(/Nastavnik je odbio ili je uklonio termin/)
    await userEvent.click(screen.getByRole('button', { name: 'U redu' }))
    expect(screen.queryByText(/Nastavnik je odbio/)).not.toBeInTheDocument()
    expect(window.localStorage.getItem('sigma.watched.p-student.st-marko')).toBe(
      '{"l-waiting":{"start":"' + at(6) + '","subject":"Fizika"}}',
    )
  })

  it('does not report a booking the person cancelled themselves', async () => {
    renderStudent(PATH)
    await open(6, 7)
    await userEvent.click(await screen.findByRole('button', { name: 'Otkaži rezervaciju' }))
    await userEvent.click(
      (await inDialog('Otkaži rezervaciju')).getByRole('button', { name: 'Otkaži rezervaciju' }),
    )
    await screen.findByText('Rezervacija je otkazana.')
    expect(screen.queryByText(/Nastavnik je odbio/)).not.toBeInTheDocument()
  })

  it('does not report a booking the teacher confirmed', async () => {
    const first = renderStudent(PATH)
    await upcoming()
    first.unmount()
    const state = seedStudent()
    state.lessons = state.lessons.map((l) =>
      l.id === 'l-waiting' ? { ...l, status: 'confirmed' } : l,
    )
    renderStudent(PATH, { api: createFakeStudentApi(state) })
    await upcoming()
    expect(screen.queryByText(/Nastavnik je odbio/)).not.toBeInTheDocument()
  })
})
