import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { PushApi, PushStatus } from './pushApi'

const ApiContext = createContext<PushApi | null>(null)

/** The push implementation of the running app. Absent in tests that do not care about notifications. */
export function PushApiProvider({ api, children }: { api: PushApi | null; children: ReactNode }) {
  return <ApiContext.Provider value={api}>{children}</ApiContext.Provider>
}

/** Used by the sign-out button, which is outside the device state. */
// eslint-disable-next-line react-refresh/only-export-components
export function usePushApi(): PushApi | null {
  return useContext(ApiContext)
}

export interface PushDeviceState {
  /** Null while it is being found out. */
  status: PushStatus | null
  busy: boolean
  /** The last switch on or off did not work. */
  failed: boolean
  enable(): Promise<PushStatus>
  disable(): Promise<void>
}

const DeviceContext = createContext<PushDeviceState | null>(null)

/** The state of this device for the signed-in person, null when the app has no push (tests). */
// eslint-disable-next-line react-refresh/only-export-components
export function usePushDevice(): PushDeviceState | null {
  return useContext(DeviceContext)
}

/**
 * Finds out the state once per sign-in, subscribing silently when the browser already allows it, and shares it with the
 * prompt, the banner and the settings, so that they never disagree.
 */
export function PushDevice({ profileId, children }: { profileId: string; children: ReactNode }) {
  const api = useContext(ApiContext)
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!api) return
    let current = true
    api
      .ensure(profileId)
      .then((next) => current && setStatus(next))
      .catch(() => current && setStatus('off'))
    return () => {
      current = false
    }
  }, [api, profileId])

  const run = useCallback(
    async (action: () => Promise<PushStatus | void>) => {
      setBusy(true)
      setFailed(false)
      try {
        const next = await action()
        setStatus(next ?? (await api!.status(profileId)))
      } catch {
        setFailed(true)
        setStatus(await api!.status(profileId).catch(() => 'off' as const))
      } finally {
        setBusy(false)
      }
    },
    [api, profileId],
  )

  const value = useMemo<PushDeviceState | null>(() => {
    if (!api) return null
    return {
      status,
      busy,
      failed,
      async enable() {
        await run(() => api.enable(profileId))
        return api.status(profileId)
      },
      async disable() {
        await run(() => api.disable(profileId))
      },
    }
  }, [api, status, busy, failed, run, profileId])

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}
