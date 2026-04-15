const PORTAL_BASE = 'https://thomasshepard.github.io/shep-portal'

// Install + activate — take control immediately
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Handle incoming push
self.addEventListener('push', e => {
  if (!e.data) return
  const data = e.data.json()

  const options = {
    body:     data.body || '',
    icon:     `${PORTAL_BASE}/icons/icon-192.png`,
    badge:    `${PORTAL_BASE}/icons/badge-72.png`,
    tag:      data.source_key || data.id || 'shep-portal',
    renotify: false,
    data: {
      action_url:      data.action_url || '',
      notification_id: data.id || '',
    },
    actions: [
      { action: 'open',    title: 'Open'    },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  }

  e.waitUntil(
    self.registration.showNotification(data.title || 'Shep Portal', options)
  )
})

// Handle notification click
self.addEventListener('notificationclick', e => {
  e.notification.close()

  if (e.action === 'dismiss') return

  const actionUrl = e.notification.data?.action_url || ''
  const target = actionUrl
    ? `${PORTAL_BASE}/#${actionUrl}`
    : `${PORTAL_BASE}/`

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      // Focus existing portal tab if open
      for (const client of clients) {
        if (client.url.startsWith(PORTAL_BASE) && 'focus' in client) {
          client.focus()
          client.navigate(target)
          return
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(target)
    })
  )
})
