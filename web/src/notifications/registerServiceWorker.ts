/**
 * The service worker only shows push notifications and opens the app when one is tapped; it caches nothing.
 * Without a VAPID key (a build that has no push) there is nothing for it to do, so it is not installed.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.VITE_VAPID_PUBLIC_KEY) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // push stays unavailable; the app itself works without it
    })
  })
}
