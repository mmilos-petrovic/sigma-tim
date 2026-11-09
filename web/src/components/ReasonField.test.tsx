import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ReasonField } from './ReasonField'

function Controlled({ onValue = vi.fn() }: { onValue?: (value: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <ReasonField
      value={value}
      hint="Razlog dobija učenik u obaveštenju."
      onChange={(next) => {
        setValue(next)
        onValue(next)
      }}
    />
  )
}

describe('the reason field', () => {
  it('says it is optional and who gets the reason', () => {
    render(<Controlled />)
    expect(screen.getByLabelText('Razlog (nije obavezan)')).toBeInTheDocument()
    expect(screen.getByText('Razlog dobija učenik u obaveštenju.')).toBeInTheDocument()
  })

  it('takes at most 200 characters', () => {
    render(<Controlled />)
    expect(screen.getByLabelText('Razlog (nije obavezan)')).toHaveAttribute('maxlength', '200')
  })

  it('hands on what is typed', async () => {
    const onValue = vi.fn()
    render(<Controlled onValue={onValue} />)
    await userEvent.type(screen.getByLabelText('Razlog (nije obavezan)'), 'Bolestan sam')
    expect(onValue).toHaveBeenLastCalledWith('Bolestan sam')
  })
})
