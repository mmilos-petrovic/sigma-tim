import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { AdminError } from '../../admin/adminApi'
import {
  at,
  createFakeStudentApi,
  JANA,
  lessonOf,
  MARKO,
  seedStudent,
} from '../../test/fakeStudentApi'
import { makeRoles, personas } from '../../test/fixtures'
import { page, renderStudent } from '../../test/renderStudent'

afterEach(() => window.localStorage.clear())

const twoChildren = () => {
  const state = seedStudent()
  state.records = [MARKO, JANA]
  state.lessons = [
    lessonOf({
      id: 'marko-1',
      studentId: MARKO.id,
      subject: 'Matematika',
      start: at(30),
      end: at(31),
    }),
    lessonOf({
      id: 'jana-1',
      studentId: JANA.id,
      teacherId: 't-petar',
      teacherName: 'Petar Jović',
      subject: 'Hemija',
      start: at(40),
      end: at(41),
    }),
  ]
  return createFakeStudentApi(state)
}

describe('the same page for a student and a parent', () => {
  it('has the student’s heading at /ucenik and the parent’s at /roditelj', async () => {
    const student = renderStudent('/ucenik')
    await page('Moji časovi')
    student.unmount()
    renderStudent('/roditelj')
    await page('Časovi dece')
  })

  it('gives the parent the same lessons, free slots and actions', async () => {
    renderStudent('/roditelj')
    await page('Časovi dece')
    expect(await screen.findByRole('list', { name: 'Predstojeći časovi' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Prošli časovi' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /^Slobodni termini/ })).toHaveAttribute(
      'href',
      '/roditelj/termini',
    )
  })

  it('never shows a calendar', async () => {
    renderStudent('/ucenik')
    await page('Moji časovi')
    await screen.findByRole('list', { name: 'Predstojeći časovi' })
    expect(document.querySelector('.fc')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Novi čas' })).not.toBeInTheDocument()
  })

  it('keeps the other contexts of an account: a parent who is also a student can switch', async () => {
    renderStudent('/roditelj', { roles: makeRoles({ ...personas.parent, isStudent: true }) })
    await page('Časovi dece')
    const switcher = await screen.findByRole('navigation', { name: 'Izbor prikaza' })
    expect(within(switcher).getByRole('link', { name: 'Moji časovi' })).toHaveAttribute(
      'href',
      '/ucenik',
    )
  })

  it('shows only the student’s own lessons for an account that also teaches', async () => {
    const state = seedStudent()
    // a lesson the same person TEACHES must not appear among the lessons they take part in
    state.lessons = [...state.lessons.filter((l) => l.id === 'l-next')]
    renderStudent('/ucenik', {
      roles: makeRoles({ ...personas.student, isTeacher: true }),
      api: createFakeStudentApi(state),
    })
    const list = await screen.findByRole('list', { name: 'Predstojeći časovi' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  })
})

describe('choosing whose lessons to look at', () => {
  it('is not offered with one record', async () => {
    renderStudent('/roditelj')
    await page('Časovi dece')
    await screen.findByRole('list', { name: 'Predstojeći časovi' })
    expect(screen.queryByLabelText('Dete')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nastavnik')).not.toBeInTheDocument()
  })

  it('lets a parent with several children choose a child, listed by name', async () => {
    renderStudent('/roditelj', { api: twoChildren() })
    const select = await screen.findByLabelText('Dete')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Jana Marković', 'Marko Marković'])
  })

  it('starts with the first child alphabetically, and shows that child’s lessons', async () => {
    renderStudent('/roditelj', { api: twoChildren() })
    const select = (await screen.findByLabelText('Dete')) as HTMLSelectElement
    expect(select.value).toBe('st-jana')
    const list = await screen.findByRole('list', { name: 'Predstojeći časovi' })
    expect(list).toHaveTextContent('Hemija')
    expect(list).not.toHaveTextContent('Matematika')
  })

  it('switches to the other child’s lessons', async () => {
    renderStudent('/roditelj', { api: twoChildren() })
    await userEvent.selectOptions(await screen.findByLabelText('Dete'), 'st-marko')
    const list = await screen.findByRole('list', { name: 'Predstojeći časovi' })
    expect(list).toHaveTextContent('Matematika')
    expect(list).not.toHaveTextContent('Hemija')
  })

  it('remembers the choice on this device', async () => {
    const first = renderStudent('/roditelj', { api: twoChildren() })
    await userEvent.selectOptions(await screen.findByLabelText('Dete'), 'st-marko')
    first.unmount()
    renderStudent('/roditelj', { api: twoChildren() })
    expect(((await screen.findByLabelText('Dete')) as HTMLSelectElement).value).toBe('st-marko')
  })

  it('falls back to the first child when the remembered one is gone', async () => {
    window.localStorage.setItem('sigma.lastRecord.parent.p-parent', 'st-gone')
    renderStudent('/roditelj', { api: twoChildren() })
    expect(((await screen.findByLabelText('Dete')) as HTMLSelectElement).value).toBe('st-jana')
  })

  it('lets a student of two teachers choose a teacher, labelled by teacher', async () => {
    const state = seedStudent()
    state.records = [
      { id: 'a', name: 'Sava Student', teacherId: 't-ana', teacherName: 'Ana Nikolić' },
      { id: 'b', name: 'Sava Student', teacherId: 't-petar', teacherName: 'Petar Jović' },
    ]
    renderStudent('/ucenik', { api: createFakeStudentApi(state) })
    const select = await screen.findByLabelText('Nastavnik')
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Kod nastavnika: Ana Nikolić', 'Kod nastavnika: Petar Jović'])
  })

  it('says so when the account has no student records', async () => {
    renderStudent('/ucenik', { api: createFakeStudentApi({ records: [] }) })
    expect(await screen.findByText('Za ovaj nalog nema podataka o učeniku.')).toBeInTheDocument()
  })

  it('explains a failure to load them and offers another try', async () => {
    const api = createFakeStudentApi()
    api.failNext('listRecords', new AdminError('network'))
    renderStudent('/ucenik', { api })
    expect(await screen.findByText(/Nema veze sa serverom/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }))
    expect(await screen.findByRole('list', { name: 'Predstojeći časovi' })).toBeInTheDocument()
  })
})

describe('a student without a teacher', () => {
  it('sees the history and is told there is no teacher, without the free-slots tab', async () => {
    const state = seedStudent()
    state.records = [{ id: 'st-x', name: 'Sava Test', teacherId: null, teacherName: null }]
    state.lessons = [
      lessonOf({
        id: 'old',
        studentId: 'st-x',
        start: at(-30),
        end: at(-29),
        outcome: 'held',
        teacherName: 'Stari Nastavnik',
      }),
    ]
    renderStudent('/ucenik', { api: createFakeStudentApi(state) })
    expect(
      await screen.findByText('Trenutno nemate nastavnika, pa nema slobodnih termina.'),
    ).toBeInTheDocument()
    expect(await screen.findByRole('list', { name: 'Prošli časovi' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Slobodni termini/ })).not.toBeInTheDocument()
  })
})
