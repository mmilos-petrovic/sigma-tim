import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportError } from '../monitoring'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('../monitoring', () => ({ reportError: vi.fn() }))

function Broken(): never {
  throw new Error('screen broke')
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(reportError).mockClear()
})

describe('ErrorBoundary', () => {
  it('shows what is inside while all is well', () => {
    render(
      <ErrorBoundary>
        <p>All is well</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('All is well')).toBeInTheDocument()
    expect(reportError).not.toHaveBeenCalled()
  })

  it('shows a message instead of a white page, and reports the error with its components', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Došlo je do greške')
    expect(screen.getByRole('button', { name: 'Osveži stranicu' })).toBeInTheDocument()
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'screen broke' }),
      expect.stringContaining('Broken'),
    )
  })
})
