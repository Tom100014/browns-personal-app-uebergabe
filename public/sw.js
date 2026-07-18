// Browns Perso - Service Worker (Web Push)
self.addEventListener("install", () => self.skipWaiting())
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()))

self.addEventListener("push", function (event) {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = {} }
  const title = data.title || "Browns Perso"
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: { url: data.url || "/" },
    tag: data.tag || undefined,
    renotify: !!data.tag,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener("notificationclick", function (event) {
  event.notification.close()
  const requestedUrl = (event.notification.data && event.notification.data.url) || "/"
  let target
  try {
    target = new URL(requestedUrl, self.location.origin)
    if (target.origin !== self.location.origin) target = new URL("/", self.location.origin)
  } catch {
    target = new URL("/", self.location.origin)
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url === target.href && "focus" in client) return client.focus()
      }
      if (self.clients.openWindow) return self.clients.openWindow(target.href)
    })
  )
})
