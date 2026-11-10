/*
 * Service worker of Sigma Tim. It does two things only: shows a push notification and, when one is tapped, takes the
 * person to the page it names. It caches nothing, so a new version of the app is never held back by it.
 *
 * A push message is JSON: { "title": "...", "body": "...", "url": "/ucenik", "tag": "lesson-<id>" }.
 * `url` is a path of this site (anything else is replaced by the home page); a notice with the same `tag` replaces
 * the earlier one instead of piling up.
 */

const FALLBACK_TITLE = 'Sigma Tim'

/** Only paths of this site; a message can never send somebody to another address. */
function safePath(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//')) return '/'
  return url
}

function readMessage(event) {
  if (!event.data) return {}
  try {
    return event.data.json() || {}
  } catch {
    return { body: event.data.text() }
  }
}

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  const message = readMessage(event)
  const options = {
    body: typeof message.body === 'string' ? message.body : '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: safePath(message.url) },
  }
  if (typeof message.tag === 'string') options.tag = message.tag
  event.waitUntil(
    self.registration.showNotification(
      typeof message.title === 'string' && message.title ? message.title : FALLBACK_TITLE,
      options,
    ),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(
    safePath(event.notification.data && event.notification.data.url),
    self.location.origin,
  ).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      for (const window of windows) {
        if (new URL(window.url).origin === self.location.origin && 'focus' in window) {
          // an open tab of the app is reused; it opens the page the notice names
          return window
            .focus()
            .then(() => ('navigate' in window ? window.navigate(target) : undefined))
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
