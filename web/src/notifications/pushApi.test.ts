import { describe, expect, it } from 'vitest'
import { createFakeBrowser, createFakePrefs, createFakeStore, VAPID } from '../test/fakePush'
import { createPushApi, decodeKey, PushError } from './pushApi'

const ME = 'profile-me'

/** `vapidKey`: null for a build that has none (undefined would pick the default). */
function setup(browser = createFakeBrowser(), vapidKey: string | null = VAPID) {
  const store = createFakeStore()
  const prefs = createFakePrefs()
  const api = createPushApi({ env: browser, store, prefs, vapidKey: vapidKey ?? undefined })
  return { api, browser, store, prefs }
}

describe('decodeKey', () => {
  it('turns the URL-safe base64 public key into its 65 bytes', () => {
    const bytes = decodeKey(VAPID)
    expect(bytes).toHaveLength(65)
    // an uncompressed P-256 point
    expect(bytes[0]).toBe(4)
  })

  it('accepts a key with the padding left out', () => {
    expect(decodeKey('AQID')).toEqual(Uint8Array.from([1, 2, 3]))
    expect(decodeKey('AQI')).toEqual(Uint8Array.from([1, 2]))
  })
})

describe('status', () => {
  it('is unconfigured in a build without a VAPID key', async () => {
    expect(await setup(undefined, null).api.status(ME)).toBe('unconfigured')
  })

  it('is unsupported where the browser cannot receive push', async () => {
    const { api } = setup(createFakeBrowser({ supported: false }))
    expect(await api.status(ME)).toBe('unsupported')
  })

  it('asks an iPhone to install the app first', async () => {
    const { api } = setup(createFakeBrowser({ supported: false, needsInstall: true }))
    expect(await api.status(ME)).toBe('needs-install')
  })

  it('is blocked when the person said no in the browser', async () => {
    const { api } = setup(createFakeBrowser({ permissionState: 'denied' }))
    expect(await api.status(ME)).toBe('blocked')
  })

  it('is off without a subscription and on with one that belongs to the person', async () => {
    const { api } = setup()
    expect(await api.status(ME)).toBe('off')
    await api.enable(ME)
    expect(await api.status(ME)).toBe('on')
  })

  it("is off for somebody else on a device that holds another person's subscription", async () => {
    const { api } = setup()
    await api.enable('somebody-else')
    expect(await api.status(ME)).toBe('off')
    expect(await api.status('somebody-else')).toBe('on')
  })
})

describe('enable', () => {
  it('asks the browser once, subscribes and stores the device', async () => {
    const { api, browser, store } = setup()
    expect(await api.enable(ME)).toBe('on')
    expect(browser.permissionState).toBe('granted')
    expect(store.rows).toEqual([
      {
        profileId: ME,
        endpoint: 'https://push.test/device-1',
        p256dh: 'p256dh-key',
        auth: 'auth-key',
        userAgent: 'Test Browser',
      },
    ])
  })

  it('does not subscribe when the person refuses', async () => {
    const { api, browser, store } = setup(createFakeBrowser({ answer: 'denied' }))
    expect(await api.enable(ME)).toBe('blocked')
    expect(browser.made).toBe(0)
    expect(store.rows).toEqual([])
  })

  it('does not subscribe when the question is dismissed without an answer', async () => {
    const { api, store } = setup(createFakeBrowser({ answer: 'default' }))
    expect(await api.enable(ME)).toBe('off')
    expect(store.rows).toEqual([])
  })

  it('does nothing where there is nothing to switch on', async () => {
    const { api, store } = setup(createFakeBrowser({ supported: false, needsInstall: true }))
    expect(await api.enable(ME)).toBe('needs-install')
    expect(store.rows).toEqual([])
  })

  it('is harmless when it is already on', async () => {
    const { api, browser, store } = setup()
    await api.enable(ME)
    expect(await api.enable(ME)).toBe('on')
    expect(browser.made).toBe(1)
    expect(store.rows).toHaveLength(1)
  })

  it("replaces another person's subscription on a shared device with a fresh one", async () => {
    const { api, browser, store } = setup()
    await api.enable('somebody-else')
    await api.enable(ME)
    // the old address is cancelled and forgotten; the new one belongs to the new person alone
    expect(browser.made).toBe(2)
    expect(store.rows.map((row) => [row.profileId, row.endpoint])).toEqual([
      [ME, 'https://push.test/device-2'],
    ])
  })

  it('forgets a choice to switch it off', async () => {
    const { api, prefs } = setup()
    prefs.setOff(ME, true)
    await api.enable(ME)
    expect(prefs.isOff(ME)).toBe(false)
  })

  it('fails with a code when the push service refuses', async () => {
    const { api, store } = setup(
      createFakeBrowser({ permissionState: 'granted', subscribeFails: true }),
    )
    await expect(api.enable(ME)).rejects.toMatchObject({ name: 'PushError', code: 'subscribe' })
    expect(store.rows).toEqual([])
  })

  it('cancels the subscription again when storing it fails', async () => {
    const browser = createFakeBrowser({ permissionState: 'granted' })
    const { api, store } = setup(browser)
    store.saveFails = true
    await expect(api.enable(ME)).rejects.toBeInstanceOf(PushError)
    await expect(api.enable(ME)).rejects.toMatchObject({ code: 'save' })
    expect(browser.current).toBeNull()
  })

  it('refuses a subscription that came without keys', async () => {
    const browser = createFakeBrowser({ permissionState: 'granted' })
    const { api } = setup(browser)
    const subscribe = browser.subscribe
    browser.subscribe = async (key) => {
      const subscription = await subscribe(key)
      subscription.toJSON = () => ({})
      return subscription
    }
    await expect(api.enable(ME)).rejects.toMatchObject({ code: 'subscribe' })
  })

  it('keeps the user agent short enough to store', async () => {
    const { api, store } = setup(createFakeBrowser({ userAgent: 'x'.repeat(1000) }))
    await api.enable(ME)
    expect(store.rows[0].userAgent).toHaveLength(300)
  })
})

describe('disable', () => {
  it('removes the device and remembers that the person wanted it off', async () => {
    const { api, browser, store, prefs } = setup()
    await api.enable(ME)
    await api.disable(ME)
    expect(store.rows).toEqual([])
    expect(browser.current).toBeNull()
    expect(prefs.isOff(ME)).toBe(true)
    expect(await api.status(ME)).toBe('off')
  })

  it('still remembers the choice where push cannot work', async () => {
    const { api, prefs } = setup(createFakeBrowser({ supported: false }))
    await api.disable(ME)
    expect(prefs.isOff(ME)).toBe(true)
  })
})

describe('ensure', () => {
  it('turns push on silently when the browser already allows it', async () => {
    const { api, store } = setup(createFakeBrowser({ permissionState: 'granted' }))
    expect(await api.ensure(ME)).toBe('on')
    expect(store.rows).toHaveLength(1)
  })

  it('never asks the browser', async () => {
    const { api, browser } = setup(createFakeBrowser({ permissionState: 'default' }))
    expect(await api.ensure(ME)).toBe('off')
    expect(browser.permissionState).toBe('default')
  })

  it('respects a choice to switch it off on this device', async () => {
    const { api, prefs, store } = setup(createFakeBrowser({ permissionState: 'granted' }))
    prefs.setOff(ME, true)
    expect(await api.ensure(ME)).toBe('off')
    expect(store.rows).toEqual([])
  })

  it('leaves a person who is blocked or on an unsupported browser alone', async () => {
    const blocked = setup(createFakeBrowser({ permissionState: 'denied' }))
    expect(await blocked.api.ensure(ME)).toBe('blocked')
    const unsupported = setup(createFakeBrowser({ supported: false }))
    expect(await unsupported.api.ensure(ME)).toBe('unsupported')
  })

  it('does not fail the page when the subscription cannot be made', async () => {
    const { api } = setup(createFakeBrowser({ permissionState: 'granted', subscribeFails: true }))
    expect(await api.ensure(ME)).toBe('off')
  })

  it('keeps a subscription that is already there', async () => {
    const { api, browser } = setup(createFakeBrowser({ permissionState: 'granted' }))
    await api.ensure(ME)
    await api.ensure(ME)
    expect(browser.made).toBe(1)
  })
})

describe('release', () => {
  it('forgets the device on sign-out without remembering a choice', async () => {
    const { api, store, prefs } = setup()
    await api.enable(ME)
    await api.release(ME)
    expect(store.rows).toEqual([])
    expect(prefs.isOff(ME)).toBe(false)
  })

  it('is harmless without push', async () => {
    const unsupported = setup(createFakeBrowser({ supported: false }))
    await expect(unsupported.api.release(ME)).resolves.toBeUndefined()
    const unconfigured = setup(undefined, null)
    await expect(unconfigured.api.release(ME)).resolves.toBeUndefined()
  })
})
