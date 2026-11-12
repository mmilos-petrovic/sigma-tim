import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import { INVALID_PHONE } from '../../lib/phone'
import { createFakeTeacherApi, seedTeacher } from '../../test/fakeTeacherApi'
import { page, renderTeacher } from '../../test/renderTeacher'
import { COLOR_KEYS, COLORS } from '../colors'

const PATH = '/moj-raspored/podesavanja'
const radio = (name: string) => screen.findByRole('radio', { name })

async function open(api = createFakeTeacherApi()) {
  const view = renderTeacher(PATH, { api })
  await page('Podešavanja')
  await radio('Bez izbora (podrazumevana boja)')
  return view
}

describe('the settings page', () => {
  it('is reached from the menu of the teacher', async () => {
    renderTeacher('/moj-raspored')
    await page('Moj raspored')
    await userEvent.click(screen.getByRole('link', { name: 'Podešavanja' }))
    expect(await page('Podešavanja')).toBeInTheDocument()
  })

  it('offers the twelve colours by name, and no choice', async () => {
    await open()
    const group = screen.getByRole('group', { name: 'Boja u kalendaru' })
    const names = within(group)
      .getAllByRole('radio')
      .map((r) => r.closest('label')?.textContent)
    expect(names).toEqual([
      'Bez izbora (podrazumevana boja)',
      ...COLOR_KEYS.map((k) => COLORS[k].label),
    ])
  })

  it('shows each colour as it will look', async () => {
    await open()
    const label = (await radio('Tirkizna')).closest('label')!
    expect(label.querySelector('.swatch')).toHaveStyle({ backgroundColor: COLORS.teal.hex })
  })

  it('does not explain who sees the colour', async () => {
    await open()
    await radio('Tirkizna')
    expect(screen.queryByText(/Kolege vide ovu boju/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Dva nastavnika mogu imati istu boju/)).not.toBeInTheDocument()
  })

  it('starts from the colour the teacher has now', async () => {
    const state = seedTeacher()
    state.reference.color = 'wine'
    await open(createFakeTeacherApi({ reference: state.reference }))
    expect(await radio('Bordo')).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Bez izbora (podrazumevana boja)' })).not.toBeChecked()
  })

  it('starts with "no choice" when the teacher never chose', async () => {
    await open()
    expect(await radio('Bez izbora (podrazumevana boja)')).toBeChecked()
  })
})

describe("the teacher's own phone number", () => {
  const field = () => screen.findByLabelText('Broj telefona')
  const save = () => screen.getByRole('button', { name: 'Sačuvaj broj' })

  it('shows the number the teacher has, without a sentence about what it is for', async () => {
    await open()
    expect(await field()).toHaveValue('064 1110 099')
    expect(screen.queryByText(/obaveštenja i poziv u vezi sa časovima/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Upišite broj na primer ovako/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Nemate upisan broj telefona/)).not.toBeInTheDocument()
  })

  it('says so when there is none yet, and saves the first one', async () => {
    const { teacherApi } = await open(createFakeTeacherApi({ myPhone: null }))
    expect(await field()).toHaveValue('')
    expect(screen.getByText(/Nemate upisan broj telefona/)).toBeInTheDocument()
    await userEvent.type(await field(), '00 381 64 555 0001')
    await userEvent.click(save())

    expect(teacherApi.setPhone).toHaveBeenCalledWith('p-teacher', '+381645550001')
    expect(await screen.findByText('Broj telefona je sačuvan.')).toBeInTheDocument()
    expect(teacherApi.state.myPhone).toBe('+381645550001')
    await waitFor(() =>
      expect(screen.queryByText(/Nemate upisan broj telefona/)).not.toBeInTheDocument(),
    )
  })

  it('changes the number, written however the teacher likes', async () => {
    const { teacherApi } = await open()
    await userEvent.clear(await field())
    await userEvent.type(await field(), '+1 (415) 555-2671')
    await userEvent.click(save())
    expect(teacherApi.setPhone).toHaveBeenCalledWith('p-teacher', '+14155552671')
    expect(await screen.findByText('Broj telefona je sačuvan.')).toBeInTheDocument()
  })

  it('has nothing to save until the number changes', async () => {
    await open()
    await field()
    expect(save()).toBeDisabled()
    await userEvent.type(await field(), '1')
    expect(save()).toBeEnabled()
  })

  it('requires a number: it cannot be emptied', async () => {
    const { teacherApi } = await open()
    await userEvent.clear(await field())
    await userEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Unesite broj telefona.')
    expect(teacherApi.setPhone).not.toHaveBeenCalled()
  })

  it('takes a number typed the way it is written at home and saves it in the international form', async () => {
    const { teacherApi } = await open(createFakeTeacherApi({ myPhone: null }))
    await userEvent.type(await field(), '064 555 0001')
    await userEvent.click(save())

    expect(teacherApi.setPhone).toHaveBeenCalledWith('p-teacher', '+381645550001')
    expect(await screen.findByText('Broj telefona je sačuvan.')).toBeInTheDocument()
    expect(await field()).toHaveValue('064 555 0001') // what was typed stays as typed
  })

  it('wants a country when the number does not start with 0, + or 00', async () => {
    const { teacherApi } = await open()
    await userEvent.clear(await field())
    await userEvent.type(await field(), '381 64 555 0001')
    await userEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent(INVALID_PHONE)
    expect(teacherApi.setPhone).not.toHaveBeenCalled()
  })

  it('explains a failure and keeps what was typed', async () => {
    const api = createFakeTeacherApi()
    api.failNext('setPhone', new AdminError('network'))
    await open(api)
    await userEvent.clear(await field())
    await userEvent.type(await field(), '+381645550001')
    await userEvent.click(save())
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom.')
    expect(await field()).toHaveValue('+381645550001')
    expect(screen.queryByText('Broj telefona je sačuvan.')).not.toBeInTheDocument()
  })

  it('does not save twice while the first request runs', async () => {
    const api = createFakeTeacherApi()
    await open(api)
    const release = api.hold('setPhone')
    await userEvent.clear(await field())
    await userEvent.type(await field(), '+381645550001')
    await userEvent.click(save())
    expect(save()).toBeDisabled()
    release()
    expect(await screen.findByText('Broj telefona je sačuvan.')).toBeInTheDocument()
    expect(api.calls.setPhone).toHaveBeenCalledTimes(1)
  })

  it('does not stop the colours from loading when the number cannot be read, and the other way round', async () => {
    const api = createFakeTeacherApi()
    api.failNext('myPhone', new AdminError('network'))
    renderTeacher(PATH, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom.')
    expect(await radio('Bez izbora (podrazumevana boja)')).toBeInTheDocument()
  })
})

describe('choosing a colour', () => {
  it('saves the colour for this teacher and says so', async () => {
    const { teacherApi } = await open()
    await userEvent.click(await radio('Tirkizna'))
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))

    expect(teacherApi.setColor).toHaveBeenCalledWith('p-teacher', 'teal')
    expect(await screen.findByRole('status')).toHaveTextContent('Boja je sačuvana.')
    expect(teacherApi.state.reference.color).toBe('teal')
    expect(await radio('Tirkizna')).toBeChecked()
  })

  it('goes back to no choice', async () => {
    const state = seedTeacher()
    state.reference.color = 'wine'
    const { teacherApi } = await open(createFakeTeacherApi({ reference: state.reference }))
    await userEvent.click(await radio('Bez izbora (podrazumevana boja)'))
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(teacherApi.setColor).toHaveBeenCalledWith('p-teacher', null)
    expect(await screen.findByRole('status')).toHaveTextContent('Boja je sačuvana.')
  })

  it('has nothing to save until the choice changes', async () => {
    await open()
    expect(screen.getByRole('button', { name: 'Sačuvaj' })).toBeDisabled()
    await userEvent.click(await radio('Zelena'))
    expect(screen.getByRole('button', { name: 'Sačuvaj' })).toBeEnabled()
    await userEvent.click(await radio('Bez izbora (podrazumevana boja)'))
    expect(screen.getByRole('button', { name: 'Sačuvaj' })).toBeDisabled()
  })

  it('lets two teachers have the same colour: nothing here knows what colleagues chose', async () => {
    const state = seedTeacher()
    state.reference.colleagues = [{ ...state.reference.colleagues[0], color: 'teal' }]
    const { teacherApi } = await open(createFakeTeacherApi({ reference: state.reference }))
    await userEvent.click(await radio('Tirkizna'))
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(teacherApi.setColor).toHaveBeenCalledWith('p-teacher', 'teal')
    expect(await screen.findByRole('status')).toHaveTextContent('Boja je sačuvana.')
  })

  it('explains a failure and keeps the choice', async () => {
    const api = createFakeTeacherApi()
    api.failNext('setColor', new AdminError('network'))
    await open(api)
    await userEvent.click(await radio('Crvena'))
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom.')
    expect(await radio('Crvena')).toBeChecked()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('explains a colour the database does not accept', async () => {
    const api = createFakeTeacherApi()
    api.failNext('setColor', new AdminError('23514'))
    await open(api)
    await userEvent.click(await radio('Crvena'))
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ta boja nije na spisku. Izaberite drugu.',
    )
  })

  it('does not save twice while the first request runs', async () => {
    const api = createFakeTeacherApi()
    await open(api)
    const release = api.hold('setColor')
    await userEvent.click(await radio('Zelena'))
    await userEvent.click(screen.getByRole('button', { name: 'Sačuvaj' }))
    expect(screen.getByRole('button', { name: 'Sačuvaj' })).toBeDisabled()
    release()
    expect(await screen.findByRole('status')).toHaveTextContent('Boja je sačuvana.')
    expect(api.calls.setColor).toHaveBeenCalledTimes(1)
  })

  it('shows the error with a retry when the page cannot load', async () => {
    const api = createFakeTeacherApi()
    api.failNext('reference', new AdminError('network'))
    renderTeacher(PATH, { api })
    expect(await screen.findByRole('alert')).toHaveTextContent('Nema veze sa serverom.')
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await radio('Bez izbora (podrazumevana boja)')).toBeInTheDocument()
  })
})
