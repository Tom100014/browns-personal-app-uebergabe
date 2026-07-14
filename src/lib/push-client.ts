"use client"

export type PushStatus = "loading" | "unsupported" | "denied" | "default" | "subscribed"

export function isPushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const out = new Uint8Array(buffer)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function getPushStatus(): Promise<PushStatus> {
  if (!isPushSupported()) return "unsupported"
  if (Notification.permission === "denied") return "denied"
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg ? await reg.pushManager.getSubscription() : null
  if (Notification.permission === "granted" && sub) return "subscribed"
  return "default"
}

export async function subscribePush(): Promise<{ ok: boolean; error?: string }> {
  if (!isPushSupported()) return { ok: false, error: "Dieses Gerät unterstützt keine Benachrichtigungen." }
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  if (!key) return { ok: false, error: "Push ist serverseitig nicht konfiguriert." }

  const permission = await Notification.requestPermission()
  if (permission !== "granted") return { ok: false, error: "Berechtigung wurde nicht erteilt." }

  const reg = await navigator.serviceWorker.register("/sw.js")
  await navigator.serviceWorker.ready
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  })
  const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } }
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
  })
  if (!res.ok) return { ok: false, error: "Abo konnte nicht gespeichert werden." }
  return { ok: true }
}

type NotifyPayload = {
  title: string
  body: string
  url?: string
  tag?: string
  employeeIds?: string[]
  audience?: "all" | "self"
}

/** Fire-and-forget push dispatch (server decides recipients/subscriptions). */
export function notifyPush(payload: NotifyPayload): void {
  fetch("/api/push/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {})
}
