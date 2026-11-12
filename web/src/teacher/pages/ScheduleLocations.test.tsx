import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { createFakeTeacherApi, seedTeacher } from '../../test/fakeTeacherApi'
import { calendar, TEST_WEEK } from '../../test/mockCalendar'
import { inDialog, page, renderTeacher } from '../../test/renderTeacher'

vi.mock('../calendar/WeekCalendar', async () => import('../../test/mockCalendar'))

const PATH = '/moj-raspored'
const block = (name: string | RegExp) => screen.findByRole('button', { name })
const FILTER = 'Prikaz po lokaciji'
const optionNames = (select: HTMLElement) =>
  within(select)
    .getAllByRole('option')
    .map((o) => o.textContent)

/**
 * The school has three locations and the teacher may use `own` of them. One lesson (tomorrow's, Ana and Luka) is at
 * Zemun, the others at the main location; a colleague is busy at both.
 */
function school(own = ['l-main', 'l-zemun']) {
  const state = seedTeacher()
  state.reference.locations.push({ id: 'l-novi', name: 'Novi Beograd', rooms: [] })
  state.reference.ownLocationIds = own
  state.lessons = state.lessons.map((l) =>
    l.id === 'les-tomorrow' ? { ...l, locationId: 'l-zemun', roomId: null } : l,
  )
  state.busy = [
    ...state.busy,
    {
      ...state.busy[0],
      locationId: 'l-zemun',
      roomId: null,
      start: '2026-11-05T09:00:00Z',
      end: '2026-11-05T10:00:00Z',
    },
  ]
  return state
}

const AT_ZEMUN = 'Ana Petrović, Luka Ilić' // tomorrow's lesson
const AT_MAIN = 'Ana Petrović – Učionica 2' // today's lesson
const BUSY_ZEMUN = 'Marko Jovanović'
const BUSY_MAIN = 'Marko Jovanović – Učionica 1'

async function openSchedule(own?: string[]) {
  const view = renderTeacher(PATH, { api: createFakeTeacherApi(school(own)) })
  await page('Moj raspored')
  await block(BUSY_MAIN)
  return view
}

describe('the location filter', () => {
  afterEach(() => window.localStorage.clear())

  it('offers the locations the teacher may use, and none of the others, with no "all"', async () => {
    await openSchedule()
    expect(optionNames(await screen.findByLabelText(FILTER))).toEqual(['Glavna lokacija', 'Zemun'])
  })

  it('starts at the first location by name, and shows the colleagues there only', async () => {
    await openSchedule()
    expect(await screen.findByLabelText(FILTER)).toHaveValue('l-main')
    expect(await block(BUSY_MAIN)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: BUSY_ZEMUN })).not.toBeInTheDocument()
  })

  it('always shows the own lessons, slots and bookings, whatever the location chosen', async () => {
    await openSchedule()
    for (const place of ['Glavna lokacija', 'Zemun']) {
      await userEvent.selectOptions(await screen.findByLabelText(FILTER), place)
      expect(await block(AT_ZEMUN)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: AT_MAIN })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Slobodan termin/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /^Na čekanju/ })).toBeInTheDocument()
    }
  })

  it('shows the colleagues of the chosen location and hides those of the other one', async () => {
    await openSchedule()
    await userEvent.selectOptions(await screen.findByLabelText(FILTER), 'Zemun')
    expect(await block(BUSY_ZEMUN)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: BUSY_MAIN })).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText(FILTER), 'Glavna lokacija')
    expect(await block(BUSY_MAIN)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: BUSY_ZEMUN })).not.toBeInTheDocument()
  })

  it('says that only the colleagues are chosen here', async () => {
    await openSchedule()
    expect(await screen.findByText(/Svoje časove vidite uvek/)).toBeInTheDocument()
  })

  it('stays when the calendar moves to another week', async () => {
    await openSchedule()
    await userEvent.selectOptions(await screen.findByLabelText(FILTER), 'Zemun')
    const next = { start: '2026-11-08T23:00:00.000Z', end: '2026-11-15T23:00:00.000Z' }
    act(() => calendar().onRangeChange(next))
    expect(screen.getByLabelText(FILTER)).toHaveValue('l-zemun')
    act(() => calendar().onRangeChange(TEST_WEEK))
    expect(await block(BUSY_ZEMUN)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: BUSY_MAIN })).not.toBeInTheDocument()
  })

  it('is remembered by the browser for the next visit', async () => {
    const first = await openSchedule()
    await userEvent.selectOptions(await screen.findByLabelText(FILTER), 'Zemun')
    first.unmount()

    renderTeacher(PATH, { api: createFakeTeacherApi(school()) })
    await page('Moj raspored')
    expect(await screen.findByLabelText(FILTER)).toHaveValue('l-zemun')
    expect(await block(BUSY_ZEMUN)).toBeInTheDocument()
  })

  it('starts from the first location again when the remembered one is no longer the teacher’s', async () => {
    window.localStorage.setItem('sigma.scheduleLocation.p-teacher', 'l-novi')
    await openSchedule()
    expect(await screen.findByLabelText(FILTER)).toHaveValue('l-main')
  })

  it('leaves the list of bookings that wait for an answer alone', async () => {
    await openSchedule()
    await userEvent.selectOptions(await screen.findByLabelText(FILTER), 'Zemun')
    expect(screen.getByRole('heading', { name: 'Zahtevi na čekanju' })).toBeInTheDocument()
  })

  it('is not there for a teacher with one location, who sees the colleagues of that location only', async () => {
    await openSchedule(['l-main'])
    expect(screen.queryByLabelText(FILTER)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: BUSY_MAIN })).toBeInTheDocument()
    // a colleague at a location that is not the teacher's is not shown, but the own lesson there is
    expect(screen.queryByRole('button', { name: BUSY_ZEMUN })).not.toBeInTheDocument()
    expect(await block(AT_ZEMUN)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: AT_MAIN })).toBeInTheDocument()
  })
})

describe('a teacher with no location', () => {
  it('cannot schedule anything, and is told to ask the administrator', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi(school([])) })
    await page('Moj raspored')
    expect(await screen.findByText(/Nemate nijednu lokaciju.*administrator/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novi čas' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Objavi slobodan termin' })).toBeDisabled()
    expect(screen.queryByLabelText(FILTER)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Marko Jovanović/ })).not.toBeInTheDocument()
  })

  it('is not told so when there are locations', async () => {
    await openSchedule()
    expect(screen.queryByText(/Nemate nijednu lokaciju/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Novi čas' })).toBeEnabled()
  })
})

describe('the forms', () => {
  const openLesson = async (own?: string[]) => {
    renderTeacher(PATH, { api: createFakeTeacherApi(school(own)) })
    await page('Moj raspored')
    await userEvent.click(await screen.findByRole('button', { name: 'Novi čas' }))
    return inDialog('Novi čas')
  }
  const openSlot = async (own?: string[]) => {
    renderTeacher(PATH, { api: createFakeTeacherApi(school(own)) })
    await page('Moj raspored')
    await userEvent.click(await screen.findByRole('button', { name: 'Objavi slobodan termin' }))
    return inDialog('Novi slobodan termin')
  }

  it('offer a lesson only the locations the teacher may use', async () => {
    const form = await openLesson()
    expect(optionNames(form.getByLabelText('Lokacija'))).toEqual(['Glavna lokacija', 'Zemun'])
  })

  it('offer a free slot only the locations the teacher may use', async () => {
    const form = await openSlot()
    expect(optionNames(form.getByLabelText('Lokacija'))).toEqual(['Glavna lokacija', 'Zemun'])
  })

  it('start from the first location the teacher may use, not the first of the school', async () => {
    const lesson = await openLesson(['l-zemun', 'l-novi'])
    expect(lesson.getByLabelText('Lokacija')).toHaveValue('l-zemun')
    expect(optionNames(lesson.getByLabelText('Lokacija'))).toEqual(['Zemun', 'Novi Beograd'])
  })

  it('start a free slot at the first location the teacher may use as well', async () => {
    const slot = await openSlot(['l-zemun', 'l-novi'])
    expect(slot.getByLabelText('Lokacija')).toHaveValue('l-zemun')
  })

  it('do not ask for the location when the teacher may use only one, and use it', async () => {
    const api = createFakeTeacherApi(school(['l-zemun']))
    renderTeacher(PATH, { api })
    await page('Moj raspored')
    await userEvent.click(await screen.findByRole('button', { name: 'Novi čas' }))
    const lesson = await inDialog('Novi čas')
    expect(lesson.queryByLabelText('Lokacija')).not.toBeInTheDocument()
    await userEvent.click(lesson.getByRole('checkbox', { name: 'Luka Ilić' }))
    await userEvent.click(lesson.getByRole('button', { name: 'Zakaži' }))
    await waitFor(() =>
      expect(api.scheduleLesson).toHaveBeenCalledWith(
        expect.objectContaining({ locationId: 'l-zemun' }),
      ),
    )
  })

  it('keep the location of a lesson that was there before the teacher lost it', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi(school(['l-zemun'])) })
    await page('Moj raspored')
    await userEvent.click(await block(AT_MAIN))
    await userEvent.click((await inDialog('Matematika')).getByRole('button', { name: 'Izmeni' }))
    const form = await inDialog('Izmena časa')
    expect(form.getByLabelText('Lokacija')).toHaveValue('l-main')
    expect(optionNames(form.getByLabelText('Lokacija'))).toEqual(['Glavna lokacija', 'Zemun'])
  })

  it('leave a location the teacher never had out, also when a lesson is edited', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi(school(['l-main', 'l-novi'])) })
    await page('Moj raspored')
    await userEvent.click(await block(AT_MAIN))
    await userEvent.click((await inDialog('Matematika')).getByRole('button', { name: 'Izmeni' }))
    const form = await inDialog('Izmena časa')
    expect(optionNames(form.getByLabelText('Lokacija'))).toEqual([
      'Glavna lokacija',
      'Novi Beograd',
    ])
  })

  it("explain the database's refusal of a location, in each of the three places", async () => {
    const api = createFakeTeacherApi(school())
    renderTeacher(PATH, { api })
    await page('Moj raspored')
    const refusal = () =>
      new AdminError('PT400', 'the teacher may not hold lessons at this location')
    const text = 'Na toj lokaciji ne možete da držite časove. Izaberite drugu lokaciju.'

    await userEvent.click(await screen.findByRole('button', { name: 'Novi čas' }))
    let form = await inDialog('Novi čas')
    await userEvent.click(form.getByRole('checkbox', { name: 'Luka Ilić' }))
    api.failNext('scheduleLesson', refusal())
    await userEvent.click(form.getByRole('button', { name: 'Zakaži' }))
    expect(await form.findByRole('alert')).toHaveTextContent(text)
    await userEvent.click(form.getByRole('button', { name: 'Odustani' }))

    await userEvent.click(screen.getByRole('button', { name: 'Objavi slobodan termin' }))
    form = await inDialog('Novi slobodan termin')
    api.failNext('publishSlot', refusal())
    await userEvent.click(form.getByRole('button', { name: 'Objavi' }))
    expect(await form.findByRole('alert')).toHaveTextContent(text)
    await userEvent.click(form.getByRole('button', { name: 'Odustani' }))

    await userEvent.click(await block(AT_MAIN))
    await userEvent.click((await inDialog('Matematika')).getByRole('button', { name: 'Izmeni' }))
    form = await inDialog('Izmena časa')
    await userEvent.selectOptions(form.getByLabelText('Lokacija'), 'Zemun')
    api.failNext('updateLesson', refusal())
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(form.getByRole('alert')).toHaveTextContent(text))
  })
})
