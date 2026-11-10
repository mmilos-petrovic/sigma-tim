import { describe, expect, it, vi } from 'vitest'
import workerSource from '../../public/sw.js?raw'

type Listener = (event: unknown) => void

/** Runs `public/sw.js` against a stand-in for the worker's global scope and returns what it did. */
function loadWorker(
  windows: {
    url: string
    focus: () => Promise<unknown>
    navigate?: (url: string) => Promise<unknown>
  }[] = [],
) {
  const listeners: Record<string, Listener> = {}
  const shown: { title: string; options: Record<string, unknown> }[] = []
  const opened: string[] = []
  const self = {
    location: { origin: 'https://sigmatim.com' },
    skipWaiting: vi.fn(),
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options })
      },
    },
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: async () => windows,
      openWindow: async (url: string) => {
        opened.push(url)
      },
    },
    addEventListener: (type: string, listener: Listener) => {
      listeners[type] = listener
    },
  }
  new Function('self', workerSource)(self)

  /** Fires an event and waits for what it handed to `waitUntil`. */
  const fire = async (type: string, event: Record<string, unknown>) => {
    let pending: Promise<unknown> = Promise.resolve()
    listeners[type]({ ...event, waitUntil: (promise: Promise<unknown>) => (pending = promise) })
    await pending
  }
  return { self, shown, opened, fire }
}

const message = (data: unknown) => ({
  data: { json: () => data, text: () => String(data) },
})

describe('push', () => {
  it('shows the title and text it was sent', async () => {
    const { shown, fire } = loadWorker()
    await fire(
      'push',
      message({
        title: 'Pomeren čas',
        body: 'Matematika, sreda 16:00',
        url: '/ucenik',
        tag: 'lesson-1',
      }),
    )
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe('Pomeren čas')
    expect(shown[0].options).toMatchObject({
      body: 'Matematika, sreda 16:00',
      tag: 'lesson-1',
      icon: '/icon-192.png',
      data: { url: '/ucenik' },
    })
  })

  it('falls back to the name of the app without a title', async () => {
    const { shown, fire } = loadWorker()
    await fire('push', message({ body: 'Tekst' }))
    expect(shown[0].title).toBe('Sigma Tim')
    expect(shown[0].options).not.toHaveProperty('tag')
  })

  it('shows a plain text message', async () => {
    const { shown, fire } = loadWorker()
    await fire('push', {
      data: {
        json: () => {
          throw new SyntaxError('not json')
        },
        text: () => 'Obična poruka',
      },
    })
    expect(shown[0].options).toMatchObject({ body: 'Obična poruka' })
  })

  it('shows something even when the message is empty', async () => {
    const { shown, fire } = loadWorker()
    await fire('push', {})
    expect(shown).toHaveLength(1)
    expect(shown[0].title).toBe('Sigma Tim')
  })

  it.each([
    ['https://evil.example/phish', '/'],
    ['//evil.example', '/'],
    ['javascript:alert(1)', '/'],
    [42, '/'],
    ['/nastavnik/casovi', '/nastavnik/casovi'],
  ])('keeps only a path of this site: %s', async (url, expected) => {
    const { shown, fire } = loadWorker()
    await fire('push', message({ title: 'x', url }))
    expect(shown[0].options).toMatchObject({ data: { url: expected } })
  })
})

describe('notificationclick', () => {
  const click = (url: string) => ({ notification: { close: vi.fn(), data: { url } } })

  it('opens the page the notice names when the app is not open', async () => {
    const { opened, fire } = loadWorker()
    const event = click('/ucenik')
    await fire('notificationclick', event)
    expect(event.notification.close).toHaveBeenCalled()
    expect(opened).toEqual(['https://sigmatim.com/ucenik'])
  })

  it('reuses a tab of the app and sends it to the page', async () => {
    const focus = vi.fn(async () => undefined)
    const navigate = vi.fn(async () => undefined)
    const { opened, fire } = loadWorker([
      { url: 'https://elsewhere.example/', focus: vi.fn(), navigate: vi.fn() },
      { url: 'https://sigmatim.com/nastavnik', focus, navigate },
    ])
    await fire('notificationclick', click('/nastavnik/casovi'))
    expect(focus).toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledWith('https://sigmatim.com/nastavnik/casovi')
    expect(opened).toEqual([])
  })

  it('goes to the home page when the notice carries no address', async () => {
    const { opened, fire } = loadWorker()
    await fire('notificationclick', { notification: { close: vi.fn(), data: undefined } })
    expect(opened).toEqual(['https://sigmatim.com/'])
  })
})

describe('lifecycle', () => {
  it('takes over at once and keeps no cache', async () => {
    const { self, fire } = loadWorker()
    await fire('install', {})
    expect(self.skipWaiting).toHaveBeenCalled()
    await fire('activate', {})
    expect(self.clients.claim).toHaveBeenCalled()
  })
})
