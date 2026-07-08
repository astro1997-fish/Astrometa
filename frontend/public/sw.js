// Minimal service worker to support browser push notifications for deposit
// confirmations. It doesn't need to cache anything — its only job is to let
// the Notification API display notifications that persist even if the app
// tab isn't focused, and to focus/open the app when a notification is clicked.

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Real Web Push delivery — fired by the browser/OS even if the app is fully
// closed, since the push service wakes the service worker to handle it.
self.addEventListener('push', (event) => {
  let payload = { title: 'Deposit confirmed', body: 'Your balance was updated.', url: '/dashboard' }
  try {
    if (event.data) payload = { ...payload, ...event.data.json() }
  } catch {
    // Non-JSON payload — fall back to the defaults above.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: payload.url },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate?.(targetUrl)
          return client.focus()
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    }),
  )
})
