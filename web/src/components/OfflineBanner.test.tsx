import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OfflineBanner } from './OfflineBanner'

function setOnline(online: boolean) {
  vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(online)
}

const go = (event: 'online' | 'offline') => act(() => void window.dispatchEvent(new Event(event)))

afterEach(() => {
  vi.restoreAllMocks()
})

describe('OfflineBanner', () => {
  it('says nothing while there is a connection', () => {
    setOnline(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says so at once when the page is opened without one', () => {
    setOnline(false)
    render(<OfflineBanner />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Nema internet veze. Promene se ne čuvaju dok se veza ne vrati.',
    )
  })

  it('appears when the connection is lost and goes away when it is back', () => {
    setOnline(true)
    render(<OfflineBanner />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    setOnline(false)
    go('offline')
    expect(screen.getByRole('status')).toHaveClass('offline-banner')

    setOnline(true)
    go('online')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('is not on the pages made at build time, which are made without a browser', () => {
    setOnline(false)
    expect(renderToString(<OfflineBanner />)).toBe('')
  })

  it('stops listening when it is gone', () => {
    setOnline(true)
    const { unmount } = render(<OfflineBanner />)
    const remove = vi.spyOn(window, 'removeEventListener')
    unmount()
    expect(remove).toHaveBeenCalledWith('online', expect.any(Function))
    expect(remove).toHaveBeenCalledWith('offline', expect.any(Function))
  })
})
