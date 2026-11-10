/**
 * Push notifications on this device, for one signed-in person.
 *
 * `status`   what the device can do right now
 *   unconfigured  the build has no VAPID key: the feature is hidden
 *   unsupported   this browser cannot receive push
 *   needs-install iPhone/iPad Safari: push only works for an app added to the home screen
 *   blocked       the person said no in the browser; only the browser's settings can change that
 *   off           can be switched on (no subscription for this person on this device)
 *   on            a subscription for this person exists on this device
 *
 * The device is "on" by default: after sign-in `ensure` subscribes silently when the browser already allows it, unless
 * the person switched it off here. Signing out forgets the device, so a shared phone never gets somebody else's notices.
 */
export type PushStatus = 'unconfigured' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'

export interface PushApi {
  status(profileId: string): Promise<PushStatus>
  /** Asks for permission when it was never asked, then subscribes. Resolves to the status afterwards. */
  enable(profileId: string): Promise<PushStatus>
  /** Switches push off on this device, and remembers that the person wanted it that way. */
  disable(profileId: string): Promise<void>
  /** Subscribes silently when the browser already allows push and the person did not switch it off here. */
  ensure(profileId: string): Promise<PushStatus>
  /** Sign-out: forgets this device for this person (without remembering a choice). */
  release(profileId: string): Promise<void>
}

/** The part of a browser `PushSubscription` this code uses. */
export interface DeviceSubscription {
  endpoint: string
  toJSON(): { keys?: { p256dh?: string; auth?: string } }
  unsubscribe(): Promise<boolean>
}

/** What the browser offers; `browserEnv.ts` is the real one, tests bring their own. */
export interface PushEnv {
  supported: boolean
  /** iPhone/iPad Safari that is not (yet) an installed app: nothing works until it is. */
  needsInstall: boolean
  permission(): NotificationPermission
  requestPermission(): Promise<NotificationPermission>
  getSubscription(): Promise<DeviceSubscription | null>
  subscribe(applicationServerKey: Uint8Array): Promise<DeviceSubscription>
  userAgent: string
}

/** One row per device in `push_subscriptions` (row-level security keeps it to the person's own). */
export interface PushStore {
  has(profileId: string, endpoint: string): Promise<boolean>
  save(row: {
    profileId: string
    endpoint: string
    p256dh: string
    auth: string
    userAgent: string
  }): Promise<void>
  remove(endpoint: string): Promise<void>
}

/** Remembers on this device that a person switched push off. Failing storage must never break anything. */
export interface PushPrefs {
  isOff(profileId: string): boolean
  setOff(profileId: string, off: boolean): void
}

export class PushError extends Error {
  readonly code: 'permission' | 'subscribe' | 'save'
  constructor(code: PushError['code'], message: string = code) {
    super(message)
    this.name = 'PushError'
    this.code = code
  }
}

/** The VAPID public key as the bytes `pushManager.subscribe` wants (it is shared as URL-safe base64). */
export function decodeKey(key: string): Uint8Array {
  const padded = key
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(key.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export function createPushApi({
  env,
  store,
  prefs,
  vapidKey,
}: {
  env: PushEnv
  store: PushStore
  prefs: PushPrefs
  /** `VITE_VAPID_PUBLIC_KEY`; missing in a build that has no push set up. */
  vapidKey: string | undefined
}): PushApi {
  const status = async (profileId: string): Promise<PushStatus> => {
    if (!vapidKey) return 'unconfigured'
    if (!env.supported) return env.needsInstall ? 'needs-install' : 'unsupported'
    if (env.permission() === 'denied') return 'blocked'
    const subscription = await env.getSubscription()
    if (subscription && (await store.has(profileId, subscription.endpoint))) return 'on'
    return 'off'
  }

  /** Forgets the subscription this browser holds, wherever it is recorded. */
  const forget = async () => {
    const subscription = await env.getSubscription()
    if (!subscription) return
    await subscription.unsubscribe().catch(() => false)
    await store.remove(subscription.endpoint).catch(() => undefined)
  }

  const subscribe = async (profileId: string) => {
    // A new subscription every time: its address then belongs to this person alone, even on a shared device.
    await forget()
    let subscription: DeviceSubscription
    try {
      subscription = await env.subscribe(decodeKey(vapidKey!))
    } catch (error) {
      throw new PushError('subscribe', error instanceof Error ? error.message : String(error))
    }
    const keys = subscription.toJSON().keys
    if (!keys?.p256dh || !keys.auth)
      throw new PushError('subscribe', 'the subscription has no keys')
    try {
      await store.save({
        profileId,
        endpoint: subscription.endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        userAgent: env.userAgent.slice(0, 300),
      })
    } catch (error) {
      await subscription.unsubscribe().catch(() => false)
      throw new PushError('save', error instanceof Error ? error.message : String(error))
    }
    prefs.setOff(profileId, false)
  }

  return {
    status,

    async enable(profileId) {
      const current = await status(profileId)
      if (current !== 'off' && current !== 'on') return current
      if (env.permission() === 'default') {
        const answer = await env.requestPermission()
        if (answer !== 'granted') return status(profileId)
      }
      if (current === 'off') await subscribe(profileId)
      return status(profileId)
    },

    async disable(profileId) {
      prefs.setOff(profileId, true)
      if (!vapidKey || !env.supported) return
      await forget()
    },

    async ensure(profileId) {
      const current = await status(profileId)
      if (current !== 'off') return current
      if (env.permission() !== 'granted' || prefs.isOff(profileId)) return current
      try {
        await subscribe(profileId)
      } catch {
        // silent by design: the person is asked again from the banner or the settings
        return current
      }
      return status(profileId)
    },

    async release() {
      if (!vapidKey || !env.supported) return
      await forget()
    },
  }
}
