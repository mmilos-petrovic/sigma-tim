import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../lib/database.types'
import type { PushEnv, PushPrefs, PushStore } from './pushApi'

/** iPhone, iPod, iPad (an iPad asks for the desktop site and says "Macintosh", but has a touch screen). */
export function isIos(userAgent: string, maxTouchPoints: number): boolean {
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
}

/** The page runs as an installed app (home-screen icon) rather than in a browser tab. */
function isStandalone(): boolean {
  const iosFlag = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return iosFlag || window.matchMedia?.('(display-mode: standalone)').matches === true
}

export function createBrowserEnv(): PushEnv {
  const supported =
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  const ios =
    typeof navigator !== 'undefined' && isIos(navigator.userAgent, navigator.maxTouchPoints)

  const registration = () => navigator.serviceWorker.ready
  const toDevice = (subscription: PushSubscription) => subscription

  return {
    supported,
    // iOS Safari hides the push API until the page is an installed app
    needsInstall: !supported && ios && !isStandalone(),
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    async getSubscription() {
      const subscription = await (await registration()).pushManager.getSubscription()
      return subscription ? toDevice(subscription) : null
    },
    async subscribe(applicationServerKey) {
      const subscription = await (
        await registration()
      ).pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      })
      return toDevice(subscription)
    },
  }
}

export function createSupabasePushStore(client: SupabaseClient<Database>): PushStore {
  return {
    async has(profileId, endpoint) {
      const { data, error } = await client
        .from('push_subscriptions')
        .select('id')
        .eq('profile_id', profileId)
        .eq('endpoint', endpoint)
        .limit(1)
      if (error) throw new Error(error.message)
      return (data ?? []).length > 0
    },
    async save({ profileId, endpoint, p256dh, auth, userAgent }) {
      const { error } = await client.from('push_subscriptions').insert({
        profile_id: profileId,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent,
      })
      if (error) throw new Error(error.message)
    },
    async remove(endpoint) {
      const { error } = await client.from('push_subscriptions').delete().eq('endpoint', endpoint)
      if (error) throw new Error(error.message)
    },
  }
}

const OFF_PREFIX = 'push-off:'

/** localStorage may be missing or throw (private windows, blocked data): then nothing is remembered. */
export function createLocalPushPrefs(storage: () => Storage = () => localStorage): PushPrefs {
  return {
    isOff(profileId) {
      try {
        return storage().getItem(OFF_PREFIX + profileId) === '1'
      } catch {
        return false
      }
    },
    setOff(profileId, off) {
      try {
        if (off) storage().setItem(OFF_PREFIX + profileId, '1')
        else storage().removeItem(OFF_PREFIX + profileId)
      } catch {
        // not remembered
      }
    },
  }
}
