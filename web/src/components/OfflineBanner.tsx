import { useSyncExternalStore } from 'react'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}

/** The browser's own idea of whether there is a connection. The pages made at build time are shown as if there was. */
// eslint-disable-next-line react-refresh/only-export-components
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  )
}

/**
 * Says so when the connection is gone, on every page, and goes away by itself when it is back (the data is asked for again
 * then). The browser knows when the device has no network at all, not when the network leads nowhere: a request that fails
 * for that reason is explained by the screen that made it.
 */
export function OfflineBanner() {
  if (useOnline()) return null
  return (
    <p role="status" className="offline-banner">
      Nema internet veze. Promene se ne čuvaju dok se veza ne vrati.
    </p>
  )
}
