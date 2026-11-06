import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
  it('offers all locations and the ones the teacher may use, and none of the others', async () => {
    await openSchedule()
    expect(optionNames(await screen.findByLabelText(FILTER))).toEqual([
      'Sve lokacije',
      'Glavna lokacija',
      'Zemun',
    ])
    expect(screen.getByLabelText(FILTER)).toHaveValue('')
  })

  it('shows everything at first', async () => {
    await openSchedule()
    for (const name of [AT_ZEMUN, AT_MAIN, BUSY_ZEMUN, BUSY_MAIN]) {
      expect(await block(name)).toBeInTheDocument()
    }
  })

  it('hides the own lessons and the colleagues’ blocks at the other locations', async () => {
    await openSchedule()
    await userEvent.selectOptions(await screen.findByLabelText(FILTER), 'Zemun')

    expect(await block(AT_ZEMUN)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: BUSY_ZEMUN })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: AT_MAIN })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: BUSY_MAIN })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Slobodan termin/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Na čekanju/ })).not.toBeInTheDocument()
  })

  it('shows the main location alone, and everything again on "Sve lokacije"', async () => {
    await openSchedule()
    const filter = await screen.findByLabelText(FILTER)
    await userEvent.selectOptions(filter, 'Glavna lokacija')
    expect(await block(AT_MAIN)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: BUSY_MAIN })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Slobodan termin/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: AT_ZEMUN })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: BUSY_ZEMUN })).not.toBeInTheDocument()

    await userEvent.selectOptions(filter, 'Sve lokacije')
    expect(await block(AT_ZEMUN)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: BUSY_MAIN })).toBeInTheDocument()
  })

  it('stays when the calendar moves to another week', async () => {
    await openSchedule()
    await userEvent.selectOptions(await screen.findByLabelText(FILTER), 'Zemun')
    const next = { start: '2026-11-08T23:00:00.000Z', end: '2026-11-15T23:00:00.000Z' }
    act(() => calendar().onRangeChange(next))
    expect(screen.getByLabelText(FILTER)).toHaveValue('l-zemun')
    act(() => calendar().onRangeChange(TEST_WEEK))
    expect(await block(AT_ZEMUN)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: AT_MAIN })).not.toBeInTheDocument()
  })

  it('leaves the list of bookings that wait for an answer alone', async () => {
    await openSchedule()
    await userEvent.selectOptions(await screen.findByLabelText(FILTER), 'Zemun')
    expect(screen.getByRole('heading', { name: 'Zahtevi na čekanju' })).toBeInTheDocument()
  })

  it('is not there for a teacher with one location', async () => {
    await openSchedule(['l-main'])
    expect(screen.queryByLabelText(FILTER)).not.toBeInTheDocument()
    // and nothing is hidden: a lesson at a location the teacher no longer has is still shown
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
    const lesson = await openLesson(['l-zemun'])
    expect(lesson.getByLabelText('Lokacija')).toHaveValue('l-zemun')
    expect(optionNames(lesson.getByLabelText('Lokacija'))).toEqual(['Zemun'])
  })

  it('start a free slot at the first location the teacher may use as well', async () => {
    const slot = await openSlot(['l-zemun'])
    expect(slot.getByLabelText('Lokacija')).toHaveValue('l-zemun')
  })

  it('keep the location of a lesson that was there before the teacher lost it', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi(school(['l-zemun'])) })
    await page('Moj raspored')
    await userEvent.click(await block(AT_MAIN))
    await userEvent.click(
      (await inDialog('Matematika')).getByRole('button', { name: 'Izmeni čas' }),
    )
    const form = await inDialog('Izmena časa')
    expect(form.getByLabelText('Lokacija')).toHaveValue('l-main')
    expect(optionNames(form.getByLabelText('Lokacija'))).toEqual(['Glavna lokacija', 'Zemun'])
  })

  it('leave a location the teacher never had out, also when a lesson is edited', async () => {
    renderTeacher(PATH, { api: createFakeTeacherApi(school(['l-main'])) })
    await page('Moj raspored')
    await userEvent.click(await block(AT_MAIN))
    await userEvent.click(
      (await inDialog('Matematika')).getByRole('button', { name: 'Izmeni čas' }),
    )
    const form = await inDialog('Izmena časa')
    expect(optionNames(form.getByLabelText('Lokacija'))).toEqual(['Glavna lokacija'])
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
    await userEvent.click(
      (await inDialog('Matematika')).getByRole('button', { name: 'Izmeni čas' }),
    )
    form = await inDialog('Izmena časa')
    await userEvent.selectOptions(form.getByLabelText('Lokacija'), 'Zemun')
    api.failNext('updateLesson', refusal())
    await userEvent.click(form.getByRole('button', { name: 'Sačuvaj' }))
    await waitFor(() => expect(form.getByRole('alert')).toHaveTextContent(text))
  })
})
