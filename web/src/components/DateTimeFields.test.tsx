import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DateField, TimeField } from './DateTimeFields'

function WithDate({ initial = '2026-11-09', onValue = vi.fn(), disabled = false }) {
  const [value, setValue] = useState(initial)
  return (
    <DateField
      label="Datum"
      value={value}
      disabled={disabled}
      onChange={(next) => {
        setValue(next)
        onValue(next)
      }}
    />
  )
}

function WithTime({ initial = '16:30', onValue = vi.fn(), disabled = false }) {
  const [value, setValue] = useState(initial)
  return (
    <TimeField
      label="Početak"
      value={value}
      disabled={disabled}
      onChange={(next) => {
        setValue(next)
        onValue(next)
      }}
    />
  )
}

const optionNames = (select: HTMLElement) =>
  Array.from(select.querySelectorAll('option')).map((o) => o.textContent)

describe('the date field', () => {
  it('shows the date as day.month.year and says how it is typed', () => {
    render(<WithDate />)
    const field = screen.getByLabelText('Datum')
    expect(field).toHaveValue('09.11.2026')
    expect(field).toHaveAttribute('placeholder', 'dd.mm.gggg')
    expect(field).toHaveAttribute('inputmode', 'numeric')
  })

  it('hands on the date of the calendar once a whole date is typed', async () => {
    const onValue = vi.fn()
    render(<WithDate onValue={onValue} />)
    const field = screen.getByLabelText('Datum')
    await userEvent.clear(field)
    await userEvent.type(field, '6.11.2026')
    expect(onValue).toHaveBeenLastCalledWith('2026-11-06')
    expect(field).toHaveValue('6.11.2026') // what was typed is not rewritten under the fingers
  })

  it('hands on nothing while the date is unfinished or does not exist', async () => {
    const onValue = vi.fn()
    render(<WithDate onValue={onValue} />)
    const field = screen.getByLabelText('Datum')
    await userEvent.clear(field)
    expect(onValue).toHaveBeenLastCalledWith('')
    await userEvent.type(field, '06.11.')
    expect(onValue).toHaveBeenLastCalledWith('')
    await userEvent.clear(field)
    await userEvent.type(field, '31.02.2026')
    expect(onValue).toHaveBeenLastCalledWith('')
  })

  it('can not be changed when it is disabled', () => {
    render(<WithDate disabled />)
    expect(screen.getByLabelText('Datum')).toBeDisabled()
  })
})

describe('the time field', () => {
  it('is a group with an hour from 00 to 23 and the quarters of an hour, no AM or PM', () => {
    render(<WithTime />)
    const group = screen.getByRole('group', { name: 'Početak' })
    const hours = screen.getByLabelText('Početak, sat')
    const minutes = screen.getByLabelText('Početak, minuti')
    expect(hours).toHaveValue('16')
    expect(minutes).toHaveValue('30')
    expect(optionNames(hours)).toEqual(
      Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0')),
    )
    expect(optionNames(minutes)).toEqual(['00', '15', '30', '45'])
    expect(group.textContent).not.toMatch(/AM|PM/)
  })

  it('hands on the time as HH:MM when the hour or the minutes change', async () => {
    const onValue = vi.fn()
    render(<WithTime onValue={onValue} />)
    await userEvent.selectOptions(screen.getByLabelText('Početak, sat'), '07')
    expect(onValue).toHaveBeenLastCalledWith('07:30')
    await userEvent.selectOptions(screen.getByLabelText('Početak, minuti'), '45')
    expect(onValue).toHaveBeenLastCalledWith('07:45')
    await userEvent.selectOptions(screen.getByLabelText('Početak, sat'), '00')
    expect(onValue).toHaveBeenLastCalledWith('00:45')
  })

  it('keeps a minute that is not a quarter when the time already had it, so nothing changes silently', () => {
    render(<WithTime initial="14:10" />)
    const minutes = screen.getByLabelText('Početak, minuti')
    expect(minutes).toHaveValue('10')
    expect(optionNames(minutes)).toEqual(['00', '10', '15', '30', '45'])
  })

  it('shows dashes for a time that is not one, and fills in 00 when only the hour is chosen', () => {
    const onValue = vi.fn()
    render(<WithTime initial="" onValue={onValue} />)
    expect(screen.getByLabelText('Početak, sat')).toHaveValue('')
    expect(screen.getByLabelText('Početak, minuti')).toHaveValue('')
    fireEvent.change(screen.getByLabelText('Početak, sat'), { target: { value: '09' } })
    expect(onValue).toHaveBeenLastCalledWith('09:00')
  })

  it('can not be changed when it is disabled', () => {
    render(<WithTime disabled />)
    expect(screen.getByLabelText('Početak, sat')).toBeDisabled()
    expect(screen.getByLabelText('Početak, minuti')).toBeDisabled()
  })
})
