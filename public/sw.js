// Browns Perso - Service Worker: Web Push + Offline (PWA)
const VERSION = "v2"
const STATIC_CACHE = `browns-static-${VERSION}`
const OFFLINE_URL = "/offline.html"
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/manifest.webmanifest"]

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
      .then(() => self.skipWaiting())
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    /\.(css|js|woff2?|png|jpe?g|svg|webp|ico)$/.test(url.pathname)
  )
}

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return

  const url = new URL(req.url)
  // Fremde Hosts (Supabase, Wetter-API, Bilder) und alle API-Routen immer live ans Netz.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith("/api/")) return

  // Statische, gehashte Assets: Cache-first (schneller Start, funktioniert offline).
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const clone = res.clone()
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, clone))
          }
          return res
        })
      })
    )
    return
  }

  // Seiten-Navigationen: Network-first (immer frische, anmeldepflichtige Inhalte),
  // bei fehlender Verbindung die Offline-Seite zeigen — nie der Browser-Fehler.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(OFFLINE_URL))
    )
  }
})

// ---- Web Push ----
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
    renotify: true,
    requireInteraction: data.important === true,
    vibrate: [300, 100, 300, 100, 300, 100, 600],
    silent: false,
    actions: [
      { action: "open", title: "Öffnen" }
    ]
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
