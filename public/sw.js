// FindWork service worker: shows pushed notifications and opens the app when
// one is tapped. It deliberately caches nothing, so a new deploy is never
// hidden behind a stale copy.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'FindWork', body: event.data ? event.data.text() : '' }
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'FindWork', {
      body: data.body || '',
      tag: data.tag,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      data: { url: data.url || '/notifications' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL((event.notification.data && event.notification.data.url) || '/notifications', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      // Reuse an open tab rather than stacking another.
      for (const client of windows) {
        if ('focus' in client && 'navigate' in client) return client.navigate(url).then((c) => (c || client).focus())
      }
      return self.clients.openWindow(url)
    }),
  )
})
