import { vi } from 'vitest'
import type { DeviceSubscription, PushEnv, PushPrefs, PushStore } from '../notifications/pushApi'

export const VAPID =
  'BLhqf8u-tFSJcpEWo1azyylK6u_gGyCA-h409NVKOuHWzgqDmoqNWU1UDPDXnSwPbxen2tzYBxss0UTNdyxcP8U'

export interface FakeBrowser extends PushEnv {
  permissionState: NotificationPermission
  /** What the person answers when the browser asks. */
  answer: NotificationPermission
  current: DeviceSubscription | null
  subscribeFails: boolean
  made: number
}

/** A browser that can do push; the test changes properties to describe another browser. */
export function createFakeBrowser(overrides: Partial<FakeBrowser> = {}): FakeBrowser {
  const browser: FakeBrowser = {
    supported: true,
    needsInstall: false,
    userAgent: 'Test Browser',
    permissionState: 'default',
    answer: 'granted',
    current: null,
    subscribeFails: false,
    made: 0,
    permission: () => browser.permissionState,
    requestPermission: async () => {
      browser.permissionState = browser.answer
      return browser.answer
    },
    getSubscription: async () => browser.current,
    subscribe: async () => {
      if (browser.subscribeFails) throw new Error('push service unavailable')
      browser.made += 1
      const subscription: DeviceSubscription = {
        endpoint: `https://push.test/device-${browser.made}`,
        toJSON: () => ({ keys: { p256dh: 'p256dh-key', auth: 'auth-key' } }),
        unsubscribe: vi.fn(async () => {
          if (browser.current === subscription) browser.current = null
          return true
        }),
      }
      browser.current = subscription
      return subscription
    },
    ...overrides,
  }
  return browser
}

export interface FakeStore extends PushStore {
  rows: { profileId: string; endpoint: string; p256dh: string; auth: string; userAgent: string }[]
  saveFails: boolean
}

export function createFakeStore(): FakeStore {
  const store: FakeStore = {
    rows: [],
    saveFails: false,
    has: async (profileId, endpoint) =>
      store.rows.some((row) => row.profileId === profileId && row.endpoint === endpoint),
    save: async (row) => {
      if (store.saveFails) throw new Error('database said no')
      store.rows.push(row)
    },
    remove: async (endpoint) => {
      store.rows = store.rows.filter((row) => row.endpoint !== endpoint)
    },
  }
  return store
}

export function createFakePrefs(): PushPrefs & { off: Set<string> } {
  const off = new Set<string>()
  return {
    off,
    isOff: (profileId) => off.has(profileId),
    setOff: (profileId, value) => {
      if (value) off.add(profileId)
      else off.delete(profileId)
    },
  }
}
