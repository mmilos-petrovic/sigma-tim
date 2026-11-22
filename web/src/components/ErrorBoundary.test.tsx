import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { reloadForNewVersion } from '../lib/staleVersion'
import { reportError } from '../monitoring'
import { ErrorBoundary } from './ErrorBoundary'

vi.mock('../monitoring', () => ({ reportError: vi.fn() }))
vi.mock('../lib/staleVersion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/staleVersion')>()),
  reloadForNewVersion: vi.fn(() => true),
}))

function Broken(): never {
  throw new Error('screen broke')
}

function StaleScreen(): never {
  throw new TypeError(
    'Failed to fetch dynamically imported module: https://sigmatim.com/assets/ContextPage-abc.js',
  )
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.mocked(reportError).mockClear()
  vi.mocked(reloadForNewVersion).mockReset().mockReturnValue(true)
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
    expect(reloadForNewVersion).not.toHaveBeenCalled()
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
    // an error of the app is not a reason to load the page again
    expect(reloadForNewVersion).not.toHaveBeenCalled()
  })

  it('loads the page again, without a word, when a screen is gone because the page is old', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(
      <ErrorBoundary>
        <StaleScreen />
      </ErrorBoundary>,
    )
    expect(reloadForNewVersion).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('status')).toHaveTextContent('Učitavanje')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(reportError).not.toHaveBeenCalled()
  })

  it('shows the error when loading the page again a moment ago did not help', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(reloadForNewVersion).mockReturnValue(false)
    render(
      <ErrorBoundary>
        <StaleScreen />
      </ErrorBoundary>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Došlo je do greške')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(reportError).toHaveBeenCalledTimes(1)
  })
})
